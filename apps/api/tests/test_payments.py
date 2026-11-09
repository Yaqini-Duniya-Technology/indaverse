from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from hashlib import sha512
import hmac
import json
from threading import Barrier
import time
from uuid import uuid4

import httpx
import pytest
from pydantic import SecretStr, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from test_beta_access import beta_client, register, PASSWORD
from app.core.config import Settings, settings
from app.core.credit_policy import default_credit_policy
from app.core.payment_policy import CreditBundle
from app.models.credits import CreditEntry
from app.models.payments import PaymentAudit, SandboxPayment
from app.services import payments, paystack
from app.services.credits import utc_now, wallet_summary


WEBHOOK = "/api/v1/payments/paystack/webhook"
CHECKOUT = "/api/v1/payments/checkout"
EMAIL = "creator@example.com"


def login(client, email=EMAIL):
    return client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})


def offer(client, *, product="bundle-starter", amount=250000, credits=10, attempt=None):
    return client.post(CHECKOUT, json={"product": product, "confirmed_amount_kobo": amount,
                                      "confirmed_credits": credits, "attempt": attempt or str(uuid4())})


def provider_result(reference, **overrides):
    return {"status": "success", "domain": "test", "currency": "NGN", "id": 876,
            "amount": 250000, "reference": reference, "customer": {"email": EMAIL},
            "paid_at": utc_now().isoformat() + "Z", **overrides}


def webhook(client, reference, *, stamp=None, tamper=False):
    body = json.dumps({"event": "charge.success", "data": {"reference": reference, "amount": 999999}}).encode()
    stamp = str(int(time.time()) if stamp is None else stamp)
    key = settings.paystack_webhook_secret.get_secret_value().encode()
    digest = hmac.new(key, stamp.encode() + b"." + body, sha512).hexdigest()
    return client.post(WEBHOOK, content=body + (b" " if tamper else b""),
                       headers={"Paystack-Signature": f"t={stamp},v1=whk_fixture:{digest}"})


@pytest.fixture
def sandbox(beta_client, monkeypatch):
    client, engine = beta_client
    monkeypatch.setattr(settings, "paystack_sandbox_enabled", True)
    monkeypatch.setattr(settings, "paystack_test_secret", SecretStr("sk_test_fixture"))
    monkeypatch.setattr(settings, "paystack_webhook_secret", SecretStr("whsec_fixture"))
    monkeypatch.setattr(settings, "credit_bundles", {
        "starter": CreditBundle(name="Starter Credits", credits=10, amount_kobo=250000),
    })
    monkeypatch.setattr(settings, "credit_policy", default_credit_policy())
    monkeypatch.setattr(payments, "RECHECK_DELAY", timedelta(0))
    calls = {"initialize": 0, "verify": 0}
    result = {}

    def initialize(reference, email, amount):
        calls["initialize"] += 1
        assert email == EMAIL
        return "https://checkout.paystack.com/sandbox-code"

    def verify(reference):
        calls["verify"] += 1
        return provider_result(reference, **result)

    monkeypatch.setattr(paystack, "initialize", initialize)
    monkeypatch.setattr(paystack, "verify", verify)
    owner = register(client).json()["id"]
    assert login(client).status_code == 200
    return client, engine, owner, calls, result


def test_checkout_disabled_and_live_keys_rejected(beta_client):
    client, _ = beta_client
    register(client)
    assert login(client).status_code == 200
    assert client.get("/api/v1/payments/catalog").json()["enabled"] is False
    assert offer(client).status_code == 503
    with pytest.raises(ValidationError, match="only accepts a Paystack test"):
        Settings(_env_file=None, database_url="sqlite://", redis_url="redis://localhost",
                 secret_key="fixture", paystack_test_secret="sk_live_fixture")


def test_checkout_freezes_terms_and_replays_same_attempt(sandbox):
    client, _, _, calls, _ = sandbox
    assert offer(client, amount=1).status_code == 409
    assert offer(client, credits=9).status_code == 409
    attempt = str(uuid4())
    row = offer(client, attempt=attempt).json()
    assert row["state"] == "pending"
    assert row["checkout_url"] == "https://checkout.paystack.com/sandbox-code"
    settings.credit_bundles["starter"].credits = 75
    settings.credit_bundles["starter"].amount_kobo = 290000
    assert offer(client, attempt=attempt).json() == row
    assert offer(client, amount=290000, attempt=attempt).status_code == 409
    assert calls == {"initialize": 1, "verify": 0}
    assert client.get("/api/v1/credits").json()["available"] == 0
    assert webhook(client, row["reference"], tamper=True).status_code == 401
    assert webhook(client, row["reference"], stamp=int(time.time()) - 301).status_code == 401
    assert webhook(client, row["reference"]).status_code == 200
    assert client.get("/api/v1/credits").json()["available"] == 10


@pytest.mark.parametrize("change", [
    {"domain": "live"}, {"currency": "USD"}, {"amount": 249999}, {"amount": 250000.0},
    {"customer": {"email": "different@example.com"}}, {"paid_at": "2026-01-01"},
])
def test_mismatched_provider_result_never_awards_value(sandbox, change):
    client, _, _, _, result = sandbox
    row = offer(client).json()
    result.update(change)
    assert webhook(client, row["reference"]).status_code == 409
    assert client.get("/api/v1/credits").json()["available"] == 0


def test_parallel_confirmation_and_retry_award_one_credit_grant(sandbox, monkeypatch):
    client, engine, owner, _, _ = sandbox
    reference = offer(client).json()["reference"]
    barrier = Barrier(2)

    def provider(reference):
        barrier.wait(timeout=5)
        return provider_result(reference)

    monkeypatch.setattr(paystack, "verify", provider)
    with ThreadPoolExecutor(max_workers=2) as pool:
        manual = pool.submit(client.post, f"/api/v1/payments/{reference}/verify")
        provider_delivery = pool.submit(webhook, client, reference)
        assert manual.result(timeout=10).status_code == provider_delivery.result(timeout=10).status_code == 200
    # A fresh session with no access to in-memory state still sees fulfillment.
    assert webhook(client, reference).status_code == 200
    with Session(engine) as db:
        assert wallet_summary(db, owner)["available"] == 10
        entries = db.scalars(select(CreditEntry).where(CreditEntry.reference == reference)).all()
        assert [entry.kind for entry in entries] == ["grant"]
        audit = db.scalars(select(PaymentAudit)).all()
        assert sum(entry.event.startswith("fulfilled_") for entry in audit) == 1


def test_failed_pending_and_owner_isolation(sandbox):
    client, _, _, calls, result = sandbox
    reference = offer(client).json()["reference"]
    result["status"] = "failed"
    assert client.post(f"/api/v1/payments/{reference}/verify").json()["state"] == "failed"
    assert client.get("/api/v1/credits").json()["available"] == 0
    assert register(client, email="other@example.com", username="other").status_code == 201
    assert login(client, "other@example.com").status_code == 200
    assert client.get("/api/v1/payments/history").json()["items"] == []
    assert client.post(f"/api/v1/payments/{reference}/verify").status_code == 404
    assert calls["verify"] == 1


def test_prepaid_plan_extends_only_after_verification_and_honors_quoted_credits(sandbox):
    client, _, _, _, result = sandbox
    plan = settings.credit_policy.plans["basic"]
    plan.monthly_kobo, plan.annual_kobo, plan.included_credits = 500000, 5000000, 30
    first = offer(client, product="plan-basic-monthly", amount=500000, credits=30).json()["reference"]
    plan.included_credits = 50
    result["amount"] = 500000
    assert client.post(f"/api/v1/payments/{first}/verify").json()["state"] == "paid"
    wallet = client.get("/api/v1/credits").json()
    assert (wallet["plan_key"], wallet["available"]) == ("basic", 30)
    second = offer(client, product="plan-basic-annual", amount=5000000, credits=50).json()["reference"]
    result.update(amount=5000000, id=877)
    assert webhook(client, second).status_code == 200
    renewed = client.get("/api/v1/credits").json()
    assert (renewed["period"], renewed["available"]) == ("annual", 80)
    assert renewed["period_end"] > wallet["period_end"]


def test_same_provider_transaction_id_cannot_pay_two_orders(sandbox):
    client, _, _, _, _ = sandbox
    first = offer(client).json()["reference"]
    second = offer(client).json()["reference"]
    assert webhook(client, first).status_code == 200
    assert webhook(client, second).status_code == 409
    assert client.get("/api/v1/credits").json()["available"] == 10


def test_paystack_transport_checks_origin_and_uses_test_auth(monkeypatch):
    monkeypatch.setattr(settings, "paystack_sandbox_enabled", True)
    monkeypatch.setattr(settings, "paystack_test_secret", SecretStr("sk_test_fixture"))
    original = httpx.Client
    requests = []
    reference = "ivtest-" + "a" * 32

    def handle(request):
        requests.append(request)
        assert request.headers["Authorization"] == "Bearer sk_test_fixture"
        if request.method == "POST":
            assert json.loads(request.content)["amount"] == "123"
            return httpx.Response(200, json={"status": True, "data": {
                "authorization_url": "https://checkout.paystack.com.evil.invalid/123", "reference": reference,
            }})
        return httpx.Response(200, json={"status": True, "data": provider_result(reference)})

    monkeypatch.setattr(httpx, "Client", lambda **kw: original(transport=httpx.MockTransport(handle), **kw))
    with pytest.raises(paystack.ProviderError, match="checkout address"):
        paystack.initialize(reference, EMAIL, 123)
    assert paystack.verify(reference)["domain"] == "test"
    assert [str(req.url) for req in requests] == [
        "https://api.paystack.co/transaction/initialize", f"https://api.paystack.co/transaction/verify/{reference}",
    ]

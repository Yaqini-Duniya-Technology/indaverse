from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Barrier

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from test_beta_access import beta_client, register, PASSWORD
from app.core.config import settings
from app.core.credit_policy import default_credit_policy
from app.models.credits import CreditEntry
from app.services import credits


@pytest.fixture
def billing(beta_client, monkeypatch):
    client, engine = beta_client
    policy = default_credit_policy()
    policy.action_costs["image_generation"] = 5
    policy.plans["basic"].included_credits = 4
    policy.plans["free"].project_limit = 1
    policy.plans["free"].monthly_downloads = 1
    monkeypatch.setattr(settings, "credit_policy", policy)
    monkeypatch.setattr(settings, "credit_enforcement", True)
    clock = [datetime(2026, 11, 9, 12)]
    monkeypatch.setattr(credits, "utc_now", lambda: clock[0])
    owner = register(client).json()["id"]
    other = register(client, email="other@example.com", username="other").json()["id"]
    return client, engine, owner, other, clock


def test_lifecycle_and_replay(billing):
    _, engine, owner, _, clock = billing
    expiry = clock[0] + timedelta(days=30)
    with Session(engine, autoflush=False) as db, db.begin():
        credits.assign_plan(db, owner, "prepaid-1", "basic", "monthly", expiry)
        credits.assign_plan(db, owner, "prepaid-1", "basic", "monthly", expiry)
        for _ in range(2):
            credits.grant_credits(db, owner, "payment-1", "purchase", 7)
        assert credits.quote(db, owner, "image_generation")["credits"] == 5
        for _ in range(2):
            assert credits.reserve_credits(db, owner, "job-1", "image_generation", 5).amount == 5
        credits.finish_reservation(db, owner, "job-1", charged=3)
        credits.finish_reservation(db, owner, "job-1", charged=3)
        credits.reverse_credits(db, owner, "payment-1", "refund-1", 2)
        credits.reverse_credits(db, owner, "payment-1", "refund-1", 2)
    with Session(engine) as db:
        view = credits.wallet_summary(db, owner)
        assert view["available"] == 6
        assert view["sources"] == {"subscription": 1, "purchase": 5, "promotion": 0, "adjustment": 0}
        assert (view["reserved"], view["consumed"], view["reversed"]) == (0, 3, 2)
        assert [row.kind for row in db.scalars(select(CreditEntry).order_by(CreditEntry.id))] == [
            "grant", "plan", "grant", "reserve", "settle", "reverse",
        ]


def test_failure_releases_only_unexpired_credits(billing):
    _, engine, owner, _, clock = billing
    with Session(engine) as db, db.begin():
        credits.assign_plan(db, owner, "plan", "basic", "monthly", clock[0] + timedelta(days=1))
        credits.grant_credits(db, owner, "promo", "promotion", 2, clock[0] + timedelta(hours=1))
        credits.grant_credits(db, owner, "purchase", "purchase", 5)
        credits.reserve_credits(db, owner, "job", "image_generation", 5)
    clock[0] += timedelta(days=2)
    with Session(engine) as db, db.begin():
        hold = credits.finish_reservation(db, owner, "job", charged=0)
        assert hold.status == "released"
    with Session(engine) as db:
        view = credits.wallet_summary(db, owner)
        assert (view["plan_key"], view["available"], view["reserved"]) == ("free", 5, 0)
        assert not credits.quote(db, owner, "image_generation")["entitled"]
        release = db.scalar(select(CreditEntry).where(CreditEntry.kind == "release"))
        assert release.details["expired"] == 5


def test_insufficient_and_stale_quote_do_not_mutate_wallet(billing):
    _, engine, owner, other, clock = billing
    with Session(engine) as db, db.begin():
        credits.assign_plan(db, owner, "plan", "basic", "monthly", clock[0] + timedelta(days=1))
    for user, amount, expected in [(other, 5, 403), (owner, 6, 409), (owner, 5, 402)]:
        with Session(engine) as db, pytest.raises(HTTPException) as caught, db.begin():
            credits.reserve_credits(db, user, "bad", "image_generation", amount)
        assert caught.value.status_code == expected
    with Session(engine) as db:
        assert credits.wallet_summary(db, owner)["available"] == 4
        assert credits.wallet_summary(db, other)["available"] == 0


def test_parallel_jobs_cannot_overspend(billing):
    _, engine, owner, _, clock = billing
    with Session(engine) as db, db.begin():
        credits.assign_plan(db, owner, "plan", "basic", "monthly", clock[0] + timedelta(days=1))
        credits.grant_credits(db, owner, "promo", "promotion", 2)
    barrier = Barrier(2)

    def reserve(reference):
        barrier.wait(timeout=5)
        try:
            with Session(engine) as db, db.begin():
                credits.reserve_credits(db, owner, reference, "image_generation", 5)
            return 200
        except HTTPException as exc:
            return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as workers:
        assert sorted(workers.map(reserve, ["job-a", "job-b"])) == [200, 402]
    with Session(engine) as db:
        wallet = credits.wallet_summary(db, owner)
        assert (wallet["available"], wallet["reserved"]) == (1, 5)


def test_parallel_downloads_count_once_at_limit_and_reset_next_month(billing):
    _, engine, owner, _, clock = billing
    barrier = Barrier(2)

    def download(_):
        barrier.wait(timeout=5)
        try:
            with Session(engine) as db:
                credits.record_download(db, owner)
            return 200
        except HTTPException as exc:
            return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as workers:
        assert sorted(workers.map(download, [1, 2])) == [200, 429]
    clock[0] += timedelta(days=30)
    with Session(engine) as db:
        credits.record_download(db, owner)
        assert credits.wallet_summary(db, owner)["downloads"] == {"month": "2026-12", "used": 1, "limit": 1}


def test_api_enforces_owner_and_project_download_quotas(billing):
    client, engine, owner, other, _ = billing
    with Session(engine) as db, db.begin():
        credits.grant_credits(db, other, "other-only", "promotion", 7)
    assert client.get("/api/v1/credits").status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "creator@example.com", "password": PASSWORD}).status_code == 200
    assert client.get("/api/v1/credits").json()["available"] == 0
    assert client.get("/api/v1/credits/history").json()["items"] == []
    assert client.post("/api/v1/credits", json={"amount": 500}).status_code == 405
    demo = client.post("/api/v1/projects/demo/zamara")
    assert demo.status_code == 201
    project_id = demo.json()["id"]
    assert client.post("/api/v1/projects/demo/zamara").status_code == 403
    assert client.post(f"/api/v1/projects/{project_id}/duplicate").status_code == 403
    assert client.post("/api/v1/projects", json={"name": "Extra", "project_type": "music"}).status_code == 403
    build = f"/api/v1/projects/{project_id}/game/browser-build.html"
    assert client.get(build, params={"version": 1}, headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert client.get(build, params={"version": 99}).status_code == 409
    assert client.get(build, params={"version": 1}).status_code == 200
    assert client.get(build, params={"version": 1}).status_code == 429
    assert client.post("/api/v1/auth/login", json={"email": "other@example.com", "password": PASSWORD}).status_code == 200
    assert client.get(build, params={"version": 1}).status_code in (403, 404)
    other_wallet = client.get("/api/v1/credits").json()
    assert (other_wallet["available"], other_wallet["downloads"]["used"]) == (7, 0)


def test_storage_resolution_and_premium_limits(billing, monkeypatch, tmp_path):
    from io import BytesIO
    from PIL import Image
    from app.api.v1 import image_assets

    monkeypatch.setattr(image_assets, "UPLOAD_DIR", tmp_path / "private-images")
    client, engine, owner, _, _ = billing
    assert client.post("/api/v1/auth/login", json={"email": "creator@example.com", "password": PASSWORD}).status_code == 200
    project = client.post("/api/v1/projects", json={"name": "Image project", "project_type": "story"}).json()
    path = f"/api/v1/projects/{project['id']}/images"
    output = BytesIO()
    Image.new("RGB", (30, 20)).save(output, format="PNG")

    def upload():
        return client.post(path, files={"file": ("asset.png", output.getvalue(), "image/png")},
                           data={"label": "Reference"})

    settings.credit_policy.plans["free"].storage_bytes = 1
    assert upload().status_code == 413
    assert client.get(path).json()["items"] == []
    settings.credit_policy.plans["free"].storage_bytes = 10000
    saved = upload()
    assert saved.status_code == 201
    image = f"{path}/{saved.json()['id']}"
    settings.credit_policy.plans["free"].max_export_edge = 24
    assert client.get(image + "/content").status_code == 200
    assert client.post(image + "/download").status_code == 403
    with Session(engine) as db, pytest.raises(HTTPException) as denied:
        credits.record_download(db, owner, premium=True)
    assert denied.value.status_code == 403
    settings.credit_policy.plans["free"].max_export_edge = 30
    assert client.post(image + "/download").status_code == 200
    assert client.post(image + "/download").status_code == 429

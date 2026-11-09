"""Persist immutable quotes and fulfill them only after independent verification."""
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.payments import PaymentAudit, SandboxPayment
from app.services import paystack
from app.services.credits import _utc, fulfill_prepaid_plan, grant_credits, utc_now, wallet_summary

FINAL_STATES = ("paid", "review")
RECHECK_DELAY = timedelta(seconds=10)
REINIT_DELAY = timedelta(seconds=30)


def products():
    bundles = [{"key": "bundle-" + key, "title": value.name, "amount_kobo": value.amount_kobo,
                "credits": value.credits, "plan": None, "period": None}
               for key, value in settings.credit_bundles.items() if value.credits and value.amount_kobo]
    plans = [{"key": f"plan-{key}-{period}", "title": f"{value.name} · {period}", "amount_kobo": price,
              "credits": value.included_credits, "plan": key, "period": period}
             for key, value in settings.credit_policy.plans.items() if key != "free"
             for period, price in (("monthly", value.monthly_kobo), ("annual", value.annual_kobo)) if price]
    return bundles + plans


def lookup(db, reference, *, user_id=None):
    query = select(SandboxPayment).where(SandboxPayment.reference == reference)
    if user_id is not None:
        query = query.where(SandboxPayment.user_id == user_id)
    return db.scalar(query.execution_options(populate_existing=True))


def public(payment: SandboxPayment, *, checkout=False):
    return {
        "reference": payment.reference, "title": payment.title, "amount_kobo": payment.amount_kobo,
        "currency": "NGN", "credits": payment.credits, "state": payment.state,
        "created_at": payment.created_at.isoformat() + "Z",
        "paid_at": payment.paid_at.isoformat() + "Z" if payment.paid_at else None,
        "checkout_url": payment.checkout_url if checkout and payment.state == "pending" else None,
    }


def _audit(db, payment_id, event, stamp):
    db.add(PaymentAudit(payment_id=payment_id, event=event, created_at=stamp))


def create_checkout(db: Session, user_id: int, email: str, product_key: str, amount: int, confirmed_credits: int, attempt: str):
    def find():
        return db.scalar(select(SandboxPayment).where(SandboxPayment.user_id == user_id,
                         SandboxPayment.attempt == attempt).execution_options(populate_existing=True))

    row = find()
    if row is None:
        product = next((item for item in products() if item["key"] == product_key), None)
        if product is None or (amount, confirmed_credits) != (product["amount_kobo"], product["credits"]):
            raise HTTPException(409, "This test price is no longer available. Review the latest offer.")
        if product["plan"] and wallet_summary(db, user_id)["plan_key"] not in ("free", product["plan"]):
            raise HTTPException(409, "A different prepaid plan is still active.")
        stamp = utc_now()
        insert = {"postgresql": pg_insert, "sqlite": sqlite_insert}[db.get_bind().dialect.name]
        row_id = db.execute(insert(SandboxPayment).values(
            reference="ivtest-" + uuid4().hex, user_id=user_id, email=email, attempt=attempt,
            product=product_key, title=product["title"], amount_kobo=amount,
            credits=product["credits"], plan=product["plan"], period=product["period"],
            state="created", created_at=stamp, updated_at=stamp,
        ).on_conflict_do_nothing(index_elements=["user_id", "attempt"]).returning(SandboxPayment.id)).scalar_one_or_none()
        if row_id is not None:
            _audit(db, row_id, "quote_created", stamp)
        db.commit()
        row = find()
    if (row.product, row.amount_kobo, row.credits) != (product_key, amount, confirmed_credits):
        raise HTTPException(409, "This checkout attempt already has different terms.")
    if row.state in FINAL_STATES or row.checkout_url:
        return public(row, checkout=True)
    row_id, ref, frozen_email, frozen_amount = row.id, row.reference, row.email, row.amount_kobo
    stamp = utc_now()
    claimed = db.execute(update(SandboxPayment).where(
        SandboxPayment.id == row_id, or_(SandboxPayment.state == "created",
        (SandboxPayment.state == "initializing") & (SandboxPayment.updated_at <= stamp - REINIT_DELAY)),
    ).values(state="initializing", updated_at=stamp)).rowcount
    db.commit()
    if not claimed:
        return public(lookup(db, ref), checkout=True)
    try:
        url = paystack.initialize(ref, frozen_email, frozen_amount)
    except paystack.ProviderError as exc:
        raise HTTPException(503, "Checkout could not be opened. Check payment history before trying again.") from exc
    saved = db.execute(update(SandboxPayment).where(SandboxPayment.id == row_id,
                       SandboxPayment.state == "initializing", SandboxPayment.updated_at == stamp)
                       .values(checkout_url=url, state="pending", updated_at=utc_now())).rowcount
    if saved:
        _audit(db, row_id, "checkout_opened", utc_now())
    db.commit()
    return public(lookup(db, ref), checkout=True)


def reconcile(db: Session, reference: str, *, user_id: int | None = None, source: str = "manual"):
    row = lookup(db, reference, user_id=user_id)
    if row is None:
        if source == "webhook":
            return None
        raise HTTPException(404, "Test payment not found.")
    if row.state in FINAL_STATES:
        return public(row)
    row_id, frozen_amount, frozen_email, opened = row.id, row.amount_kobo, row.email, row.created_at
    if source == "manual":
        stamp = utc_now()
        claimed = db.execute(update(SandboxPayment).where(
            SandboxPayment.id == row_id, SandboxPayment.state.not_in(FINAL_STATES),
            or_(SandboxPayment.last_checked_at.is_(None),
                SandboxPayment.last_checked_at <= stamp - RECHECK_DELAY),
        ).values(last_checked_at=stamp)).rowcount
        db.commit()
        if not claimed:
            current = lookup(db, reference, user_id=user_id)
            if current.state in FINAL_STATES:
                return public(current)
            raise HTTPException(429, "Wait ten seconds before checking this payment again.")
    else:
        db.rollback()
    # Never hold an application transaction during the provider request.
    try:
        result = paystack.verify(reference)
    except paystack.ProviderError as exc:
        raise HTTPException(503, "Paystack has not confirmed this payment yet.") from exc
    if result.get("status") != "success":
        if result.get("domain") == "test" and result.get("reference") == reference and result.get("status") in ("failed", "abandoned"):
            stamp = utc_now()
            saved = db.execute(update(SandboxPayment).where(SandboxPayment.id == row_id,
                               SandboxPayment.state.in_(("created", "initializing", "pending")))
                               .values(state=result["status"], updated_at=stamp)).rowcount
            if saved:
                _audit(db, row_id, "provider_" + result["status"], stamp)
            db.commit()
        elif source == "webhook":
            raise HTTPException(503, "The provider has not confirmed a successful payment.")
        return public(lookup(db, reference))
    customer = result.get("customer")
    provider_id = result.get("id")
    stamp = utc_now()
    try:
        paid = datetime.fromisoformat(result["paid_at"])
        if paid.utcoffset() is None:
            raise ValueError
        paid = _utc(paid)
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(409, "The provider did not return a valid payment time.") from exc
    if (result.get("domain") != "test" or result.get("reference") != reference
            or result.get("currency") != "NGN" or type(result.get("amount")) is not int
            or result["amount"] != frozen_amount or type(provider_id) is not int or not 0 < provider_id < 2**63
            or not isinstance(customer, dict) or not isinstance(customer.get("email"), str)
            or customer["email"].lower() != frozen_email.lower() or paid > stamp + timedelta(minutes=5)
            or paid < opened - timedelta(minutes=5)):
        raise HTTPException(409, "The verified payment does not match this test checkout.")
    try:
        claimed = db.execute(update(SandboxPayment).where(SandboxPayment.id == row_id,
                             SandboxPayment.state.not_in(FINAL_STATES))
                             .values(provider_id=provider_id, paid_at=paid, updated_at=stamp)).rowcount
        if claimed:
            row = lookup(db, reference)
            try:
                with db.begin_nested():
                    if row.plan:
                        fulfill_prepaid_plan(db, row.user_id, reference, row.plan, row.period, row.credits)
                    else:
                        grant_credits(db, row.user_id, reference, "purchase", row.credits)
            except HTTPException as exc:
                if exc.status_code != 409:
                    raise
                row.state = "review"
                _audit(db, row_id, "fulfillment_review", stamp)
            else:
                row.state = "paid"
                _audit(db, row_id, "fulfilled_" + source, stamp)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "This test transaction was already recorded.") from exc
    return public(lookup(db, reference))

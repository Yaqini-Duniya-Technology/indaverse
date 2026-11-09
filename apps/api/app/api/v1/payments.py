"""Authenticated test checkout and a separately authenticated provider webhook."""
import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.v1.dependencies import get_current_user
from app.database.connection import get_db
from app.models.payments import SandboxPayment
from app.models.user import User
from app.services import payments, paystack

router = APIRouter(prefix="/payments", tags=["Sandbox payments"])
Reference = Annotated[str, Path(pattern=r"^ivtest-[0-9a-f]{32}$")]


class Checkout(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product: str = Field(pattern=r"^(bundle-[a-z]+|plan-[a-z]+-(monthly|annual))$", max_length=40)
    confirmed_amount_kobo: int = Field(gt=0, le=1_000_000_000, strict=True)
    confirmed_credits: int = Field(ge=0, le=1_000_000_000, strict=True)
    attempt: UUID


def require_sandbox():
    if paystack.test_key() is None:
        raise HTTPException(503, "Sandbox checkout is disabled.")


@router.get("/catalog")
def catalog(_user: User = Depends(get_current_user)):
    enabled = paystack.test_key() is not None
    return {"enabled": enabled, "products": payments.products() if enabled else [], "currency": "NGN"}


@router.get("/history")
def history(before: int | None = Query(default=None, gt=0), limit: int = Query(default=20, ge=1, le=100),
            user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = select(SandboxPayment).where(SandboxPayment.user_id == user.id)
    if before is not None:
        query = query.where(SandboxPayment.id < before)
    rows = db.scalars(query.order_by(SandboxPayment.id.desc()).limit(limit + 1)).all()
    return {"items": [payments.public(row, checkout=True) for row in rows[:limit]],
            "next_before": rows[limit - 1].id if len(rows) > limit else None}


@router.post("/checkout", dependencies=[Depends(require_sandbox)])
def checkout(data: Checkout, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return payments.create_checkout(db, user.id, user.email, data.product,
                                    data.confirmed_amount_kobo, data.confirmed_credits, str(data.attempt))


@router.post("/{reference}/verify", dependencies=[Depends(require_sandbox)])
def verify(reference: Reference, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return payments.reconcile(db, reference, user_id=user.id)


@router.post("/paystack/webhook", dependencies=[Depends(require_sandbox)])
async def webhook(request: Request, db: Session = Depends(get_db)):
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > 64 * 1024:
            raise HTTPException(413, "Webhook exceeds the body limit.")
        body.extend(chunk)
    raw = bytes(body)
    if not paystack.signed_webhook(raw, request.headers.get("Paystack-Signature"),
                                  request.headers.get("X-Paystack-Signature")):
        raise HTTPException(401, "Invalid webhook signature.")
    try:
        event = json.loads(raw)
    except (ValueError, RecursionError) as exc:
        raise HTTPException(400, "Invalid webhook body.") from exc
    if not isinstance(event, dict):
        raise HTTPException(400, "Invalid webhook body.")
    if event.get("event") == "charge.success":
        data = event.get("data")
        reference = data.get("reference") if isinstance(data, dict) else None
        if isinstance(reference, str) and paystack.REFERENCE.fullmatch(reference):
            await run_in_threadpool(payments.reconcile, db, reference, source="webhook")
    return {"received": True}

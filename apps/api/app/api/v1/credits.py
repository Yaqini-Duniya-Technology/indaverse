"""Authenticated, read-only wallet. Only trusted services can mutate credits."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.core.config import settings
from app.core.credit_policy import Action
from app.database.connection import get_db
from app.models.credits import CreditEntry
from app.models.user import User
from app.services.credits import quote, wallet_summary

router = APIRouter(prefix="/credits", tags=["Credits"])


@router.get("")
def wallet(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return wallet_summary(db, user.id)


@router.get("/plans")
def plans(user: User = Depends(get_current_user)):
    return {"currency": "NGN", **settings.credit_policy.model_dump()}


@router.get("/quote/{action}")
def action_quote(action: Action, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return quote(db, user.id, action)


@router.get("/history")
def history(before: int | None = Query(default=None, gt=0), limit: int = Query(default=25, ge=1, le=100),
            user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = select(CreditEntry).where(CreditEntry.user_id == user.id)
    if before is not None:
        query = query.where(CreditEntry.id < before)
    rows = db.scalars(query.order_by(CreditEntry.id.desc()).limit(limit + 1)).all()
    return {
        "items": [{"id": row.id, "kind": row.kind, "available_delta": row.available_delta,
                   "reserved_delta": row.reserved_delta, "created_at": row.created_at.isoformat() + "Z"}
                  for row in rows[:limit]],
        "next_before": rows[limit - 1].id if len(rows) > limit else None,
    }

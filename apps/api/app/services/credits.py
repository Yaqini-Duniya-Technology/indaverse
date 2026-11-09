"""Transactional credit operations. Callers commit with the payment/job result."""
from datetime import UTC, datetime
from hashlib import sha256
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import case, func, or_, select, true, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.credit_policy import ACTIONS, MAX_CREDITS, PLAN_KEYS, Action, Source
from app.models.credits import CreditAccount, CreditEntry, CreditLot, CreditReservation, DownloadUsage
from app.models.project import Project


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _lock(db: Session, user_id: int) -> CreditAccount:
    # Insert the wallet on demand, then take a write lock even on SQLite.
    # Every wallet, quota and entitlement write takes this lock first.
    db.flush()
    dialect = db.get_bind().dialect.name
    insert = {"postgresql": pg_insert, "sqlite": sqlite_insert}[dialect]
    db.execute(insert(CreditAccount).values(user_id=user_id, revision=0, plan_key="free")
               .on_conflict_do_nothing(index_elements=["user_id"]))
    db.execute(update(CreditAccount).where(CreditAccount.user_id == user_id)
               .values(revision=CreditAccount.revision + 1))
    return db.get(CreditAccount, user_id, populate_existing=True)


def _entry(db, user_id, kind, reference, stamp, *, available=0, reserved=0, **details):
    db.add(CreditEntry(user_id=user_id, kind=kind, reference=reference, available_delta=available,
                       reserved_delta=reserved, details=details, created_at=stamp))


def _utc(stamp: datetime) -> datetime:
    return stamp.astimezone(UTC).replace(tzinfo=None) if stamp.tzinfo is not None else stamp


def _reference(value: str):
    if not isinstance(value, str) or not 1 <= len(value) <= 128 or not value.isascii() or any(c.isspace() for c in value):
        raise ValueError("Use an opaque operation reference of at most 128 ASCII characters.")


def _positive(amount: int):
    if type(amount) is not int or not 1 <= amount <= MAX_CREDITS:
        raise ValueError("Use positive whole credits within the transaction limit.")


def _plan(account: CreditAccount | None, stamp: datetime):
    key = account.plan_key if account and account.period_end and account.period_end > stamp else "free"
    return key, settings.credit_policy.plans[key]


def _lot(db, user_id, reference):
    return db.scalar(select(CreditLot).where(CreditLot.user_id == user_id, CreditLot.reference == reference))


def _reservation(db, user_id, reference):
    return db.scalar(select(CreditReservation).where(CreditReservation.user_id == user_id,
                                                    CreditReservation.reference == reference))


def _live_lots(db, user_id, stamp):
    return db.scalars(select(CreditLot).where(
        CreditLot.user_id == user_id, CreditLot.remaining > 0,
        or_(CreditLot.expires_at.is_(None), CreditLot.expires_at > stamp),
    ).order_by(case((CreditLot.expires_at.is_(None), 1), else_=0), CreditLot.expires_at, CreditLot.id)).all()


def _expire(db, user_id, stamp):
    lots = db.scalars(select(CreditLot).where(CreditLot.user_id == user_id,
                      CreditLot.remaining > 0, CreditLot.expires_at <= stamp)).all()
    for lot in lots:
        _entry(db, user_id, "expiry", lot.reference, stamp, available=-lot.remaining, lot_id=lot.id)
        lot.remaining = 0


def _grant(db, user_id, reference, source, amount, expires_at, stamp):
    existing = _lot(db, user_id, reference)
    if existing:
        if (existing.source, existing.amount, existing.expires_at) != (source, amount, expires_at):
            raise HTTPException(409, "This grant reference was already used with different terms.")
        return existing
    if expires_at is not None and expires_at <= stamp:
        raise ValueError("A new grant must expire in the future.")
    lot = CreditLot(user_id=user_id, reference=reference, source=source, amount=amount,
                    remaining=amount, expires_at=expires_at)
    db.add(lot)
    db.flush()
    _entry(db, user_id, "grant", reference, stamp, available=amount, source=source, lot_id=lot.id)
    return lot


def grant_credits(db: Session, user_id: int, reference: str, source: Source, amount: int,
                  expires_at: datetime | None = None):
    _reference(reference)
    _positive(amount)
    if reference.startswith("plan:"):
        raise ValueError("This operation reference prefix is reserved.")
    if source not in ("subscription", "purchase", "promotion", "adjustment"):
        raise ValueError("Unknown credit source.")
    _lock(db, user_id)
    stamp = utc_now()
    _expire(db, user_id, stamp)
    return _grant(db, user_id, reference, source, amount, _utc(expires_at) if expires_at is not None else None, stamp)


def assign_plan(db: Session, user_id: int, reference: str, key: str, period: Literal["monthly", "annual"],
                period_end: datetime):
    _reference(reference)
    if key not in PLAN_KEYS or key == "free" or period not in ("monthly", "annual"):
        raise ValueError("Choose a paid plan and a monthly or annual period.")
    account = _lock(db, user_id)
    stamp = utc_now()
    _expire(db, user_id, stamp)
    period_end = _utc(period_end)
    details = {"plan": key, "period": period, "ends_at": period_end.isoformat()}
    previous = db.scalar(select(CreditEntry).where(CreditEntry.user_id == user_id,
                         CreditEntry.kind == "plan", CreditEntry.reference == reference))
    if previous:
        if previous.details != details:
            raise HTTPException(409, "This plan reference was already used with different terms.")
        return
    if period_end <= stamp or (account.period_end and period_end <= account.period_end):
        raise HTTPException(409, "The new plan period must end after the current period.")
    account.plan_key, account.period, account.period_end = key, period, period_end
    amount = settings.credit_policy.plans[key].included_credits
    if amount:
        _grant(db, user_id, _plan_reference(reference),
               "subscription", amount, period_end, stamp)
    _entry(db, user_id, "plan", reference, stamp, **details)


def _plan_reference(reference: str) -> str:
    return "plan:" + sha256(reference.encode()).hexdigest()


def quote(db: Session, user_id: int, action: Action) -> dict:
    _, plan = _plan(db.get(CreditAccount, user_id), utc_now())
    amount = settings.credit_policy.action_costs.get(action)
    return {"action": action, "credits": amount, "entitled": action in plan.ai_actions and amount is not None}


def reserve_credits(db: Session, user_id: int, reference: str, action: Action, confirmed_cost: int):
    _reference(reference)
    _positive(confirmed_cost)
    if action not in ACTIONS:
        raise ValueError("Unknown credit action.")
    account = _lock(db, user_id)
    existing = _reservation(db, user_id, reference)
    if existing:
        if (existing.action, existing.amount) != (action, confirmed_cost):
            raise HTTPException(409, "This reservation reference was already used with different terms.")
        return existing
    stamp = utc_now()
    _, plan = _plan(account, stamp)
    cost = settings.credit_policy.action_costs.get(action)
    if action not in plan.ai_actions or cost is None:
        raise HTTPException(403, "This action is not available on your current plan.")
    if confirmed_cost != cost:
        raise HTTPException(409, "The cost changed. Review the latest quote before confirming.")
    _expire(db, user_id, stamp)
    lots = _live_lots(db, user_id, stamp)
    if sum(lot.remaining for lot in lots) < cost:
        raise HTTPException(402, "You do not have enough available credits.")
    needed = cost
    allocations = []
    for lot in lots:
        used = min(needed, lot.remaining)
        lot.remaining -= used
        allocations.append([lot.id, used])
        needed -= used
        if not needed:
            break
    hold = CreditReservation(user_id=user_id, reference=reference, action=action, amount=cost,
                             status="reserved", allocations=allocations, created_at=stamp)
    db.add(hold)
    _entry(db, user_id, "reserve", reference, stamp, available=-cost, reserved=cost, action=action)
    db.flush()
    return hold


def finish_reservation(db: Session, user_id: int, reference: str, *, charged: int):
    """Zero releases failed/cancelled work. A partial result charges only its accepted cost."""
    _reference(reference)
    if type(charged) is not int or not 0 <= charged <= MAX_CREDITS:
        raise ValueError("Invalid settled credit amount.")
    _lock(db, user_id)
    hold = _reservation(db, user_id, reference)
    if hold is None:
        raise HTTPException(404, "Credit reservation not found.")
    if hold.status != "reserved":
        if hold.charged != charged:
            raise HTTPException(409, "This reservation already has a different outcome.")
        return hold
    if charged > hold.amount:
        raise HTTPException(422, "The charge cannot exceed the confirmed reservation.")
    stamp = utc_now()
    _expire(db, user_id, stamp)
    remaining_charge, returned, expired = charged, 0, 0
    for lot_id, held in hold.allocations:
        cost = min(remaining_charge, held)
        remaining_charge -= cost
        unspent = held - cost
        if not unspent:
            continue
        lot = db.get(CreditLot, lot_id)
        if lot.expires_at is not None and lot.expires_at <= stamp:
            expired += unspent
        else:
            lot.remaining += unspent
            returned += unspent
    hold.charged = charged
    hold.status = "settled" if charged else "released"
    _entry(db, user_id, "settle" if charged else "release", reference, stamp,
           available=returned, reserved=-hold.amount, charged=charged, expired=expired)
    db.flush()
    return hold


def reverse_credits(db: Session, user_id: int, grant_reference: str, reference: str, amount: int):
    """Reverse unspent credits only; consumed or held credits need reconciliation."""
    _reference(reference)
    _reference(grant_reference)
    _positive(amount)
    _lock(db, user_id)
    stamp = utc_now()
    _expire(db, user_id, stamp)
    previous = db.scalar(select(CreditEntry).where(CreditEntry.user_id == user_id,
                         CreditEntry.kind == "reverse", CreditEntry.reference == reference))
    details = {"grant_reference": grant_reference}
    if previous:
        if previous.available_delta != -amount or previous.details != details:
            raise HTTPException(409, "This reversal reference was already used with different terms.")
        return
    lot = _lot(db, user_id, grant_reference)
    if not lot or (lot.expires_at is not None and lot.expires_at <= stamp) or lot.remaining < amount:
        raise HTTPException(409, "The grant does not have enough unspent credits to reverse.")
    lot.remaining -= amount
    _entry(db, user_id, "reverse", reference, stamp, available=-amount, **details)


def check_project_creation(db: Session, user_id: int, project_type: str):
    if not settings.credit_enforcement:
        return
    _, plan = _plan(_lock(db, user_id), utc_now())
    if project_type not in plan.project_types:
        raise HTTPException(403, "This studio is not available on your current plan.")
    if plan.project_limit is not None:
        count = db.scalar(select(func.count()).select_from(Project).where(Project.user_id == user_id))
        if count >= plan.project_limit:
            raise HTTPException(403, "You have reached your plan's saved project limit.")


def record_download(db: Session, user_id: int, *, premium=False, edge: int | None = None):
    if not settings.credit_enforcement:
        return
    account = _lock(db, user_id)
    stamp = utc_now()
    _, plan = _plan(account, stamp)
    if premium and not plan.premium_exports:
        raise HTTPException(403, "This export requires a plan with premium exports.")
    if edge is not None and plan.max_export_edge is not None and edge > plan.max_export_edge:
        raise HTTPException(403, "This export exceeds your plan's resolution limit.")
    month = stamp.strftime("%Y-%m")
    usage = db.get(DownloadUsage, (user_id, month), populate_existing=True)
    if plan.monthly_downloads is not None and (usage.count if usage else 0) >= plan.monthly_downloads:
        raise HTTPException(429, "You have used this month's download allowance.")
    if usage:
        usage.count += 1
    else:
        db.add(DownloadUsage(user_id=user_id, month=month, count=1))
    db.commit()


def wallet_summary(db: Session, user_id: int) -> dict:
    stamp = utc_now()
    month = stamp.strftime("%Y-%m")
    counters = select(
        func.coalesce(func.sum(case((CreditReservation.status == "reserved", CreditReservation.amount), else_=0)), 0).label("held"),
        func.coalesce(func.sum(CreditReservation.charged), 0).label("consumed"),
    ).where(CreditReservation.user_id == user_id).subquery()
    reversals = select(func.coalesce(func.sum(-CreditEntry.available_delta), 0)).where(
        CreditEntry.user_id == user_id, CreditEntry.kind == "reverse").scalar_subquery()
    # One statement keeps balances and reservations on the same read snapshot.
    rows = db.execute(select(CreditAccount, CreditLot, DownloadUsage.count,
                             counters.c.held, counters.c.consumed, reversals)
                      .select_from(CreditAccount)
                      .join(counters, true())
                      .outerjoin(CreditLot, (CreditLot.user_id == CreditAccount.user_id)
                                 & (CreditLot.remaining > 0)
                                 & or_(CreditLot.expires_at.is_(None), CreditLot.expires_at > stamp))
                      .outerjoin(DownloadUsage, (DownloadUsage.user_id == CreditAccount.user_id)
                                 & (DownloadUsage.month == month))
                      .where(CreditAccount.user_id == user_id)
                      .order_by(case((CreditLot.expires_at.is_(None), 1), else_=0),
                                CreditLot.expires_at, CreditLot.id)
                      .execution_options(populate_existing=True)).all()
    account, _, used, held, consumed, reversed_amount = rows[0] if rows else (None, None, 0, 0, 0, 0)
    key, plan = _plan(account, stamp)
    lots = [row[1] for row in rows if row[1] is not None]
    totals = dict.fromkeys(("subscription", "purchase", "promotion", "adjustment"), 0)
    for lot in lots:
        totals[lot.source] += lot.remaining
    return {
        "enforcement": settings.credit_enforcement, "plan_key": key, "plan": plan.model_dump(),
        "period": account.period if key != "free" else None,
        "period_end": account.period_end.isoformat() + "Z" if key != "free" else None,
        "available": sum(totals.values()), "sources": totals, "reserved": int(held), "consumed": int(consumed),
        "reversed": int(reversed_amount),
        "downloads": {"month": month, "used": used or 0, "limit": plan.monthly_downloads},
        "expiring": [{"source": lot.source, "credits": lot.remaining, "expires_at": lot.expires_at.isoformat() + "Z"}
                     for lot in lots if lot.expires_at is not None][:20],
    }


def check_storage(db: Session, user_id: int, additional_bytes: int):
    """Enforce stored media bytes while the caller's write transaction is open."""
    if not settings.credit_enforcement:
        return
    from app.models.audio_asset import AudioAsset
    from app.models.image_asset import ImageAsset
    from app.models.video_sequence import VideoSequenceSoundtrack, VideoSequenceSource

    _, plan = _plan(_lock(db, user_id), utc_now())
    if plan.storage_bytes is None or additional_bytes <= 0:
        return
    used = sum(db.scalar(select(func.coalesce(func.sum(size), 0)).select_from(model)
                        .join(Project, Project.id == model.project_id)
                        .where(Project.user_id == user_id)) for model, size in (
        (AudioAsset, AudioAsset.file_size), (ImageAsset, ImageAsset.file_size),
        (VideoSequenceSource, func.length(VideoSequenceSource.content)),
        (VideoSequenceSoundtrack, func.length(VideoSequenceSoundtrack.content)),
    ))
    if used + additional_bytes > plan.storage_bytes:
        raise HTTPException(413, "This file would exceed your plan's stored media limit.")

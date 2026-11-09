from datetime import UTC, datetime, timedelta
from hashlib import sha256
import secrets

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.beta_access import BetaAccess, BetaInvite


def now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def issue_invite(db: Session, email: str, hours: int) -> str:
    if not 1 <= hours <= 168:
        raise ValueError("Invite lifetime must be between 1 and 168 hours.")
    token = secrets.token_urlsafe(32)
    db.add(BetaInvite(
        digest=sha256(token.encode()).hexdigest(),
        email=email.lower(),
        expires_at=now() + timedelta(hours=hours),
    ))
    return token


def consume_invite(db: Session, email: str, token: str) -> datetime:
    if len(token) != 43 or not token.isascii():
        raise HTTPException(status_code=403, detail="A valid beta invitation is required.")
    stamp = now()
    digest = sha256(token.encode()).hexdigest()
    redeemed = db.execute(
        update(BetaInvite)
        .where(
            BetaInvite.digest == digest,
            BetaInvite.email == email,
            BetaInvite.expires_at > stamp,
            BetaInvite.redeemed_at.is_(None),
            BetaInvite.revoked_at.is_(None),
        )
        .values(redeemed_at=stamp)
        .returning(BetaInvite.digest)
    ).scalar_one_or_none()
    if redeemed is None:
        raise HTTPException(status_code=403, detail="A valid beta invitation is required.")
    return stamp


def require_beta_access(db: Session, user_id: int) -> None:
    if not settings.private_beta:
        return
    grant = db.get(BetaAccess, user_id)
    if grant is None or grant.revoked_at is not None:
        raise HTTPException(status_code=403, detail="This account does not have beta access.")

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.beta_access import BetaAccess
from app.services.beta_access import consume_invite
from app.models.user import User
from app.schemas.auth import UserRegister


def get_user_by_email(db: Session, email: str) -> User | None:
    statement = select(User).where(User.email == email)
    return db.scalar(statement)


def get_user_by_username(db: Session, username: str) -> User | None:
    statement = select(User).where(User.username == username)
    return db.scalar(statement)


def create_user(db: Session, user_data: UserRegister) -> User:
    email = user_data.email.lower()
    try:
        stamp = None
        if settings.private_beta:
            token = user_data.invite_code.get_secret_value() if user_data.invite_code else ""
            stamp = consume_invite(db, email, token)
        user = User(
            email=email,
            username=user_data.username,
            hashed_password=hash_password(user_data.password),
        )
        db.add(user)
        if stamp is not None:
            db.flush()
            db.add(BetaAccess(user_id=user.id, granted_at=stamp))
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email or username is already registered.") from exc

    return user
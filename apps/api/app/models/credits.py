from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class CreditAccount(Base):
    __tablename__ = "credit_accounts"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    revision: Mapped[int] = mapped_column(BigInteger, default=0)
    plan_key: Mapped[str] = mapped_column(String(16), default="free")
    period: Mapped[str | None] = mapped_column(String(12))
    period_end: Mapped[datetime | None] = mapped_column(DateTime)


class CreditLot(Base):
    __tablename__ = "credit_lots"
    __table_args__ = (
        UniqueConstraint("user_id", "reference", name="uq_credit_lot_reference"),
        CheckConstraint("remaining >= 0 AND remaining <= amount AND amount > 0", name="ck_credit_lot_balance"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("credit_accounts.user_id", ondelete="CASCADE"))
    reference: Mapped[str] = mapped_column(String(128))
    source: Mapped[str] = mapped_column(String(16))
    amount: Mapped[int] = mapped_column(BigInteger)
    remaining: Mapped[int] = mapped_column(BigInteger)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)


class CreditReservation(Base):
    __tablename__ = "credit_reservations"
    __table_args__ = (UniqueConstraint("user_id", "reference", name="uq_credit_reservation_reference"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("credit_accounts.user_id", ondelete="CASCADE"))
    reference: Mapped[str] = mapped_column(String(128))
    action: Mapped[str] = mapped_column(String(40))
    amount: Mapped[int] = mapped_column(BigInteger)
    charged: Mapped[int | None] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(12))
    allocations: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class CreditEntry(Base):
    __tablename__ = "credit_entries"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("credit_accounts.user_id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    reference: Mapped[str] = mapped_column(String(128))
    available_delta: Mapped[int] = mapped_column(BigInteger)
    reserved_delta: Mapped[int] = mapped_column(BigInteger)
    details: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class DownloadUsage(Base):
    __tablename__ = "credit_download_usage"
    user_id: Mapped[int] = mapped_column(ForeignKey("credit_accounts.user_id", ondelete="CASCADE"), primary_key=True)
    month: Mapped[str] = mapped_column(String(7), primary_key=True)
    count: Mapped[int] = mapped_column(Integer)

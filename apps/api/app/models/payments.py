from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class SandboxPayment(Base):
    __tablename__ = "sandbox_payments"
    __table_args__ = (
        UniqueConstraint("user_id", "attempt", name="uq_sandbox_payment_attempt"),
        CheckConstraint("amount_kobo > 0 AND credits >= 0", name="ck_sandbox_payment_quote"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(48), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    attempt: Mapped[str] = mapped_column(String(36))
    email: Mapped[str] = mapped_column(String(320))
    product: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(120))
    amount_kobo: Mapped[int] = mapped_column(Integer)
    credits: Mapped[int] = mapped_column(Integer)
    plan: Mapped[str | None] = mapped_column(String(16))
    period: Mapped[str | None] = mapped_column(String(12))
    state: Mapped[str] = mapped_column(String(20))
    checkout_url: Mapped[str | None] = mapped_column(String(512))
    provider_id: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class PaymentAudit(Base):
    __tablename__ = "sandbox_payment_audit"
    id: Mapped[int] = mapped_column(primary_key=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("sandbox_payments.id", ondelete="RESTRICT"), index=True)
    event: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime)

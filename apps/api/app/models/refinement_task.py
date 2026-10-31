from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class RefinementTask(Base):
    __tablename__ = "refinement_tasks"
    __table_args__ = (
        UniqueConstraint("review_id", "source_number", name="uq_refinement_review_source"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True,
    )
    review_id: Mapped[int] = mapped_column(
        ForeignKey("project_reviews.id", ondelete="CASCADE"), index=True,
    )
    # Zero means the overall review summary; otherwise the original step number.
    source_number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(250))
    source_feedback: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="todo")
    resolution: Mapped[str] = mapped_column(Text, default="")
    evidence: Mapped[list[dict]] = mapped_column(
        JSON, default=list, server_default="[]", nullable=False,
    )
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow,
    )

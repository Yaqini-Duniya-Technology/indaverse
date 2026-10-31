from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class ProjectPlan(Base):
    __tablename__ = "project_plans"

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    brief_version: Mapped[int] = mapped_column(Integer, nullable=False)
    brief_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    planner: Mapped[str] = mapped_column(String(50), nullable=False)
    steps: Mapped[list] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False,
    )

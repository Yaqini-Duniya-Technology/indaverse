from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class ImageGenerationJob(Base):
    __tablename__ = "image_generation_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True,
    )
    label: Mapped[str] = mapped_column(String(150))
    purpose: Mapped[str] = mapped_column(String(30))
    prompt: Mapped[str] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(30))
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow,
    )

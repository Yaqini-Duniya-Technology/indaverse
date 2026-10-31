from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    project_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        index=True,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    visibility: Mapped[str] = mapped_column(
        String(20),
        default="private",
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    user = relationship(
        "User",
        back_populates="projects",
    )

    audio_assets = relationship(
        "AudioAsset",
        back_populates="project",
        cascade="all, delete-orphan",
    )

    music_project = relationship(
        "MusicProject",
        back_populates="project",
        uselist=False,
        cascade="all, delete-orphan",
    )

    generation_jobs = relationship(
        "MusicGenerationJob",
        back_populates="project",
        cascade="all, delete-orphan",
    )

    # Persistent creative brief and versioned project cover.
    brief_goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    brief_audience: Mapped[str | None] = mapped_column(Text, nullable=True)
    brief_style: Mapped[str | None] = mapped_column(Text, nullable=True)
    brief_constraints: Mapped[str | None] = mapped_column(Text, nullable=True)
    brief_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    cover_image_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cover_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

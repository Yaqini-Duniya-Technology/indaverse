from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base


class MusicProject(Base):
    __tablename__ = "music_projects"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    artist: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    genre: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    mood: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    bpm: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    lyrics_intro: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    lyrics_verse_1: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    lyrics_chorus: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    lyrics_verse_2: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    lyrics_bridge: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    lyrics_outro: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
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

    project = relationship(
        "Project",
         back_populates="music_project",
             )

from sqlalchemy import ForeignKey, Integer, JSON, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class VideoSequence(Base):
    __tablename__ = "video_sequences"

    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    clips: Mapped[list[dict]] = mapped_column(JSON, nullable=False)


class VideoSequenceSource(Base):
    __tablename__ = "video_sequence_sources"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("video_sequences.project_id", ondelete="CASCADE"), index=True,
    )
    name: Mapped[str] = mapped_column(String(150))
    duration_ms: Mapped[int] = mapped_column(Integer)
    content: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)


class VideoSequenceSoundtrack(Base):
    __tablename__ = "video_sequence_soundtracks"

    project_id: Mapped[int] = mapped_column(
        ForeignKey("video_sequences.project_id", ondelete="CASCADE"), primary_key=True,
    )
    name: Mapped[str] = mapped_column(String(150))
    format: Mapped[str] = mapped_column(String(3))
    duration_ms: Mapped[int] = mapped_column(Integer)
    settings: Mapped[dict] = mapped_column(JSON)
    content: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)

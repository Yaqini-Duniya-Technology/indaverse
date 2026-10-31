from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class GameProject(Base):
    __tablename__ = "game_projects"

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True,
    )
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    dimension: Mapped[str] = mapped_column(String(2), nullable=False)
    genre: Mapped[str] = mapped_column(String(100), nullable=False)
    concept: Mapped[str] = mapped_column(Text, nullable=False)
    core_loop: Mapped[str] = mapped_column(Text, nullable=False)
    controls: Mapped[str] = mapped_column(Text, nullable=False)
    characters: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    levels: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    assets: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False,
    )

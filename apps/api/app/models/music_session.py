from sqlalchemy import ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class MusicSession(Base):
    __tablename__ = "music_sessions"

    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    version: Mapped[int] = mapped_column()
    data: Mapped[dict] = mapped_column(JSON)

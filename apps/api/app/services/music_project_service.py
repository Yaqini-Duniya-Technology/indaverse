from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.music_project import MusicProject
from app.schemas.music_project import (
    MusicProjectCreate,
    MusicProjectUpdate,
)


def get_music_project(
    db: Session,
    project_id: int,
) -> MusicProject | None:
    statement = select(MusicProject).where(
        MusicProject.project_id == project_id
    )

    return db.scalar(statement)


def create_music_project(
    db: Session,
    project_id: int,
    data: MusicProjectCreate,
) -> MusicProject:
    try:
        lock_song_project(db, project_id)
        existing = db.scalar(
            select(MusicProject)
            .where(MusicProject.project_id == project_id)
            .execution_options(populate_existing=True)
        )
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail="A song already exists. Load the saved song before editing.",
            )
        values = data.model_dump()
        title = values["title"]
        if not title.strip():
            raise HTTPException(status_code=422, detail="Song title cannot be empty.")
        values["title"] = title.strip()
        song = MusicProject(project_id=project_id, **values)
        db.add(song)
        add_revision(db, song, "created")
        db.commit()
        db.refresh(song)
        return song
    except Exception:
        db.rollback()
        raise



def update_music_project(
    db: Session,
    music_project: MusicProject,
    data: MusicProjectUpdate,
) -> MusicProject:
    from datetime import datetime, timedelta, timezone
    from fastapi import HTTPException
    from app.models.project import Project

    def utc_naive(value):
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    try:
        # Lock the parent so concurrent saves are checked in sequence.
        db.execute(
            select(Project.id)
            .where(Project.id == music_project.project_id)
            .with_for_update()
        ).scalar_one()
        db.refresh(music_project)

        current_stamp = utc_naive(music_project.updated_at)
        expected_stamp = utc_naive(data.expected_updated_at)
        if current_stamp != expected_stamp:
            raise HTTPException(
                status_code=409,
                detail=(
                    "This song changed in another tab. Your draft was not saved. "
                    "Keep a copy before loading the latest song."
                ),
            )

        changes = data.model_dump(
            exclude_unset=True,
            exclude={"expected_updated_at"},
        )
        if "title" in changes:
            title = changes["title"]
            if not isinstance(title, str) or not title.strip():
                raise HTTPException(status_code=422, detail="Song title cannot be empty.")
            changes["title"] = title.strip()

        changed = any(
            getattr(music_project, field) != value
            for field, value in changes.items()
        )
        if changed:
            preserve_current_revision(db, music_project, "baseline")
            for field, value in changes.items():
                setattr(music_project, field, value)
            music_project.updated_at = max(
                datetime.now(timezone.utc).replace(tzinfo=None),
                current_stamp + timedelta(microseconds=1),
            )

        if changed:
            add_revision(db, music_project, "saved")

        db.commit()
        db.refresh(music_project)
        return music_project
    except Exception:
        db.rollback()
        raise



def delete_music_project(
    db: Session,
    music_project: MusicProject,
) -> None:
    try:
        lock_song_project(db, music_project.project_id)
        db.refresh(music_project)
        preserve_current_revision(db, music_project, "before_delete")
        db.delete(music_project)
        db.commit()
    except Exception:
        db.rollback()
        raise


# Restored music revision recording
from copy import deepcopy
from fastapi import HTTPException
from app.models.music_revision import MusicRevision
from app.models.project import Project

SONG_FIELDS = (
    "title", "artist", "genre", "mood", "bpm",
    "lyrics_intro", "lyrics_verse_1", "lyrics_chorus",
    "lyrics_verse_2", "lyrics_bridge", "lyrics_outro",
)


def song_snapshot(song: MusicProject) -> dict:
    return deepcopy({field: getattr(song, field) for field in SONG_FIELDS})


def add_revision(db: Session, song: MusicProject, reason: str) -> None:
    db.add(MusicRevision(
        project_id=song.project_id,
        reason=reason,
        snapshot=song_snapshot(song),
    ))


def preserve_current_revision(db: Session, song: MusicProject, reason: str) -> None:
    latest = db.scalar(
        select(MusicRevision)
        .where(MusicRevision.project_id == song.project_id)
        .order_by(MusicRevision.id.desc())
        .limit(1)
    )
    if latest is None or latest.snapshot != song_snapshot(song):
        add_revision(db, song, reason)


def lock_song_project(db: Session, project_id: int) -> None:
    db.execute(
        select(Project.id)
        .where(Project.id == project_id)
        .with_for_update()
    ).scalar_one()

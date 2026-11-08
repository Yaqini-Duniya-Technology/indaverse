from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.database.connection import get_db
from app.models.audio_asset import AudioAsset
from app.models.music_session import MusicSession
from app.models.project import Project
from app.models.user import User

router = APIRouter(prefix="/projects/{project_id}/music/session", tags=["Music Studio"])
MAX_AUDIO_BYTES = 12 * 1024 * 1024


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Region(Strict):
    start_ms: int = Field(ge=0, lt=300_000)
    end_ms: int = Field(gt=0, le=300_000)
    offset_ms: int = Field(ge=0, lt=600_000)
    fade_in_ms: int = Field(ge=0, le=10_000)
    fade_out_ms: int = Field(ge=0, le=10_000)


class Track(Strict):
    asset_id: int = Field(gt=0)
    duration_ms: int = Field(ge=100, le=300_000)
    volume: int = Field(ge=0, le=100)
    mute: bool
    solo: bool
    regions: list[Region] = Field(min_length=1, max_length=4)


class Lyric(Strict):
    name: str = Field(min_length=1, max_length=60)
    text: str = Field(max_length=4000)
    start_ms: int | None = Field(default=None, ge=0, lt=600_000)
    end_ms: int | None = Field(default=None, gt=0, le=600_000)


class Arrangement(Strict):
    tracks: list[Track] = Field(max_length=4)
    lyrics: list[Lyric] = Field(max_length=12)


class Edit(Strict):
    version: int = Field(ge=0)
    data: Arrangement


def owned(db, project_id, user_id, lock=False):
    query = select(Project.id).where(Project.id == project_id, Project.user_id == user_id,
                                     Project.project_type.in_(("music", "music_video")))
    if lock:
        query = query.with_for_update()
    if db.scalar(query) is None:
        raise HTTPException(404, "Music project not found.")


def state(row):
    return {"version": row.version, "data": row.data} if row else {"version": 0, "data": {"tracks": [], "lyrics": []}}


@router.get("")
def get_session(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owned(db, project_id, user.id)
    return state(db.get(MusicSession, project_id))


@router.put("")
def save_session(project_id: int, edit: Edit, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owned(db, project_id, user.id, lock=True)
    row = db.get(MusicSession, project_id, populate_existing=True)
    current = state(row)
    if current["version"] != edit.version:
        raise HTTPException(409, "The saved session changed. Reload before saving again.")
    ids = {track.asset_id for track in edit.data.tracks}
    if len(ids) != len(edit.data.tracks):
        raise HTTPException(422, "Each source can be added to the session once.")
    if ids:
        available = set(db.scalars(select(AudioAsset.id).where(
            AudioAsset.project_id == project_id, AudioAsset.id.in_(ids), AudioAsset.file_size <= MAX_AUDIO_BYTES,
        )))
        if available != ids:
            raise HTTPException(422, "A session track is missing or exceeds 12 MiB.")
    total = 0
    for track in edit.data.tracks:
        previous = 0
        for region in sorted(track.regions, key=lambda item: item.offset_ms):
            length = region.end_ms - region.start_ms
            if length < 100 or region.end_ms > track.duration_ms:
                raise HTTPException(422, "Each region must be at least 0.1 seconds and stay within its track.")
            if region.fade_in_ms + region.fade_out_ms > length:
                raise HTTPException(422, "Combined fades cannot exceed the region length.")
            end = region.offset_ms + length
            if region.offset_ms < previous or end > 600_000:
                raise HTTPException(422, "Regions on the same track cannot overlap or extend beyond ten minutes.")
            previous = end
            total = max(total, end)
    for lyric in edit.data.lyrics:
        if not lyric.name.strip():
            raise HTTPException(422, "Enter a lyric section name.")
        if (lyric.start_ms is not None or lyric.end_ms is not None) and (
            lyric.start_ms is None or lyric.end_ms is None or not lyric.start_ms < lyric.end_ms <= total
        ):
            raise HTTPException(422, "Each linked lyric range needs a start and end inside the session.")
    data = edit.data.model_dump()
    if data == current["data"]:
        return current
    if row is None:
        row = MusicSession(project_id=project_id, version=1, data=data)
        db.add(row)
    else:
        row.version += 1
        row.data = data
    result = state(row)
    db.commit()
    return result


class Transfer(Strict):
    version: int = Field(ge=1)
    destination_id: int = Field(gt=0)
    destination_version: int = Field(ge=0)
    start_ms: int = Field(ge=0, lt=600_000)
    end_ms: int = Field(gt=0, le=600_000)


def render_mix(db, project_id, user_id, version, output_format, start=0, end=None):
    from pathlib import Path
    from tempfile import TemporaryDirectory

    from app.api.v1.audio_assets import stored_audio_path
    from app.api.v1.video_clip_export import available_tools
    from app.services.clip_export import ClipError
    from app.services.music_mixdown import mix

    owned(db, project_id, user_id)
    row = db.get(MusicSession, project_id, populate_existing=True)
    if row is None or row.version != version:
        raise HTTPException(409, "The saved session changed. Reload before rendering.")
    tracks = row.data["tracks"]
    duration = max((r["offset_ms"] + r["end_ms"] - r["start_ms"] for t in tracks for r in t["regions"]), default=0)
    solo = any(t["solo"] and not t["mute"] for t in tracks)
    audible = [t for t in tracks if not t["mute"] and t["volume"] and (not solo or t["solo"])]
    if not audible:
        raise HTTPException(422, "The saved mix needs an audible track.")
    if end is not None and (end > duration or not 250 <= end - start <= 119_900):
        raise HTTPException(422, "Choose a range of 0.25 to 119.9 seconds within the saved mix.")
    tools = available_tools()
    if tools is None:
        raise HTTPException(503, "Enable local FFmpeg rendering to export a mix.")
    assets = []
    for track in audible:
        asset = db.get(AudioAsset, track["asset_id"])
        if asset is None or asset.project_id != project_id or asset.file_size > MAX_AUDIO_BYTES:
            raise HTTPException(422, "A source is missing or exceeds 12 MiB.")
        assets.append((track, asset.mime_type, stored_audio_path(asset)))
    db.close()
    try:
        inputs = []
        for track, media_type, path in assets:
            with path.open("rb") as source:
                content = source.read(MAX_AUDIO_BYTES + 1)
            if not content or len(content) > MAX_AUDIO_BYTES:
                raise HTTPException(422, "A source is empty or exceeds 12 MiB.")
            inputs.append((track, media_type, content))
        with TemporaryDirectory(prefix="indaverse-mix-") as folder:
            return mix(tools, Path(folder), inputs, output_format, duration, start, end)
    except OSError as exc:
        raise HTTPException(422, "An audio source or render file could not be opened.") from exc
    except ClipError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@router.post("/mix/{output_format}")
def download_mix(project_id: int, output_format: Literal["wav", "mp3"], version: int = Query(ge=1),
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.api.v1.video_clip_export import render_slot
    from app.services.export_response import private_download

    if not render_slot.acquire(blocking=False):
        raise HTTPException(429, "The media renderer is busy. Try again shortly.")
    try:
        content = render_mix(db, project_id, user.id, version, output_format)
        return private_download(content, media_type="audio/wav" if output_format == "wav" else "audio/mpeg",
                                filename=f"indaverse-mix-v{version}.{output_format}")
    finally:
        render_slot.release()


@router.post("/send-to-video")
def send_to_video(project_id: int, data: Transfer, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    from app.api.v1.video_clip_export import render_slot
    from app.api.v1.video_sequence import load, store_soundtrack

    user_id = user.id
    destination, _ = load(db, data.destination_id, user_id, version=data.destination_version)
    if destination is None or not destination.clips:
        raise HTTPException(422, "Add a video clip to the destination first.")
    if not render_slot.acquire(blocking=False):
        raise HTTPException(429, "The media renderer is busy. Try again shortly.")
    try:
        content = render_mix(db, project_id, user_id, data.version, "mp3", data.start_ms, data.end_ms)
        return store_soundtrack(db, data.destination_id, user_id, data.destination_version,
                                f"Music project {project_id} mix v{data.version}.mp3", "mp3",
                                data.end_ms - data.start_ms, content)
    finally:
        render_slot.release()

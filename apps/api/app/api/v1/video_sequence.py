from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Literal
from urllib.parse import unquote
from uuid import uuid4

import anyio
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.v1.dependencies import get_current_user
from app.api.v1.video_clip_export import available_tools, render_slot
from app.api.v1.video_projects import owned_video_project
from app.database.connection import get_db
from app.models.user import User
from app.models.video_sequence import VideoSequence, VideoSequenceSource
from app.services import clip_export, sequence_export as export
from app.services.export_response import private_download

router = APIRouter(prefix="/projects/{project_id}/video/sequence", tags=["Video Studio"])


class Cut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    source_id: str = Field(pattern="^[a-f0-9]{32}$")
    start_ms: int = Field(ge=0, le=120_000)
    end_ms: int = Field(gt=0, le=120_000)
    title: str = Field(default="", max_length=48)
    muted: bool = False
    volume_percent: int = Field(default=100, ge=0, le=100)
    fade_edges: bool = False

    framing: Literal["fit", "fill"] = "fit"
    title_position: Literal["top", "bottom"] = "bottom"
    title_duration_ms: int = Field(default=0, ge=0, le=export.MAX_SEQUENCE_MS)
    caption: str = Field(default="", max_length=90)

    @field_validator("title", "caption")
    @classmethod
    def validate_clip_text(cls, value: str) -> str:
        if any(not character.isprintable() for character in value):
            raise ValueError("Clip text must be a single line of printable text.")
        return value.strip()


class SequenceEdit(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    version: int = Field(ge=0)
    clips: list[Cut] = Field(max_length=export.MAX_CLIPS)


def load(db, project_id, user_id, *, lock=False, version=None):
    owned_video_project(db, project_id, user_id, lock=lock)
    sequence = db.get(VideoSequence, project_id, populate_existing=True)
    if version is not None and version != (sequence.version if sequence else 0):
        raise HTTPException(409, "The saved sequence changed. Reload before saving again.")
    sources = {source.id: source for source in db.scalars(select(VideoSequenceSource)
               .where(VideoSequenceSource.project_id == project_id))}
    return sequence, sources


def state(sequence, sources):
    return {
        "version": sequence.version if sequence else 0,
        "clips": sequence.clips if sequence else [],
        "sources": [{"id": s.id, "name": s.name, "duration_ms": s.duration_ms} for s in sources.values()],
        "renderer_available": available_tools() is not None,
    }


@router.get("")
def get_sequence(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return state(*load(db, project_id, user.id, lock=True))


def add_source(db, project_id, user_id, version, name, duration, content):
    sequence, sources = load(db, project_id, user_id, lock=True, version=version)
    if len(sources) >= export.MAX_CLIPS:
        raise HTTPException(422, "Remove a saved clip before adding another.")
    current = sequence.clips if sequence else []
    remaining = export.MAX_SEQUENCE_MS - sum(c["end_ms"] - c["start_ms"] for c in current)
    end = min(5000, duration, remaining)
    if end < export.MIN_SEGMENT_MS:
        raise HTTPException(422, "Shorten the saved sequence before adding this clip.")
    if sequence is None:
        sequence = VideoSequence(project_id=project_id, version=0, clips=[])
        db.add(sequence)
        db.flush()
    source = VideoSequenceSource(id=uuid4().hex, project_id=project_id, name=name,
                                 duration_ms=duration, content=content)
    db.add(source)
    sequence.clips = [*current, {"source_id": source.id, "start_ms": 0, "end_ms": end}]
    sequence.version += 1
    sources[source.id] = source
    result = state(sequence, sources)
    db.commit()
    return result


@router.post("/sources", status_code=201)
async def upload_source(
    project_id: int, request: Request,
    version: int = Query(ge=0), encoded_name: str = Header(alias="X-Video-Filename", max_length=1800),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    user_id = user.id
    await run_in_threadpool(lambda: load(db, project_id, user_id, version=version))
    await run_in_threadpool(db.close)
    tools = available_tools()
    if tools is None:
        raise HTTPException(503, "Local MP4 processing is unavailable.")
    if request.headers.get("content-type") != "video/mp4":
        raise HTTPException(415, "Choose an MP4 video.")
    name = unquote(encoded_name).strip()
    if not 1 <= len(name) <= 150 or any(not char.isprintable() or char in "/\\" for char in name):
        raise HTTPException(422, "Use a source name of 1 to 150 characters.")
    if not render_slot.acquire(blocking=False):
        raise HTTPException(429, "Video processing is busy. Try again shortly.")
    try:
        with TemporaryDirectory(prefix="indaverse-sequence-source-") as folder:
            path = Path(folder) / "source.mp4"
            size = 0
            with anyio.fail_after(30):
                async with await anyio.open_file(path, "wb") as target:
                    async for chunk in request.stream():
                        size += len(chunk)
                        if size > export.MAX_SOURCE_BYTES:
                            raise HTTPException(413, "Each saved source must be 8 MiB or smaller.")
                        await target.write(chunk)
            duration, _ = await run_in_threadpool(
                lambda: clip_export.probe(tools[1], path, video_only_duration=True)
            )
            if not export.MIN_SEGMENT_MS / 1000 <= duration <= clip_export.MAX_SOURCE_SECONDS:
                raise HTTPException(422, "The source must be between 0.5 and 120 seconds.")
            content = await run_in_threadpool(path.read_bytes)
            return await run_in_threadpool(add_source, db, project_id, user_id, version, name.strip(),
                                           int(duration * 1000), content)
    except TimeoutError as exc:
        raise HTTPException(408, "The video upload timed out.") from exc
    except clip_export.ClipError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    except OSError as exc:
        raise HTTPException(503, "Temporary video storage is unavailable.") from exc
    finally:
        render_slot.release()


@router.put("")
def save_sequence(project_id: int, edit: SequenceEdit,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sequence, sources = load(db, project_id, user.id, lock=True, version=edit.version)
    kept = set()
    total = 0
    for clip in edit.clips:
        source = sources.get(clip.source_id)
        if source is None or clip.source_id in kept:
            raise HTTPException(422, "Each clip must use a distinct source in this project.")
        duration = clip.end_ms - clip.start_ms
        if duration < export.MIN_SEGMENT_MS or clip.end_ms > source.duration_ms:
            raise HTTPException(422, "Each cut must be at least 0.5 seconds and within its source.")
        kept.add(clip.source_id)
        total += duration
    if total > export.MAX_SEQUENCE_MS:
        raise HTTPException(422, "The sequence must be 30 seconds or shorter.")
    clips = [clip.model_dump(exclude_defaults=True) for clip in edit.clips]
    if sequence is not None and sequence.clips != clips:
        sequence.clips = clips
        sequence.version += 1
        for source_id in sources.keys() - kept:
            db.delete(sources.pop(source_id))
        result = state(sequence, sources)
        db.commit()
        return result
    return state(sequence, sources)


@router.get("/sources/{source_id}")
def preview_source(project_id: int, source_id: str,
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _, sources = load(db, project_id, user.id, lock=True)
    source = sources.get(source_id)
    if source is None:
        raise HTTPException(404, "Saved clip not found.")
    return Response(source.content, media_type="video/mp4", headers={"Cache-Control": "no-store"})


@router.get("/captions.srt")
def download_captions(project_id: int, version: int = Query(ge=0),
                      user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sequence, _ = load(db, project_id, user.id, lock=True, version=version)
    content = export.captions_srt(sequence.clips if sequence else [])
    if not content:
        raise HTTPException(422, "Save at least one caption before downloading.")
    return private_download(content, media_type="application/x-subrip",
                            filename=f"indaverse-{project_id}-captions.srt")


@router.post("/render")
def render_sequence(project_id: int, version: int = Query(ge=0),
                    preset: export.Preset = "landscape", burn_captions: bool = False,
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tools = available_tools()
    # Check ownership and snapshot the expected saved version before rendering.
    sequence, sources = load(db, project_id, user.id, lock=True, version=version)
    if tools is None:
        raise HTTPException(503, "Local MP4 processing is unavailable.")
    if sequence is None or not sequence.clips:
        raise HTTPException(422, "Add a clip before rendering.")
    if not render_slot.acquire(blocking=False):
        raise HTTPException(429, "Video processing is busy. Try again shortly.")
    try:
        items = [(cut, sources[cut["source_id"]].content) for cut in sequence.clips]
        db.close()
        with TemporaryDirectory(prefix="indaverse-sequence-") as folder:
            content = export.render(tools, Path(folder), items, preset=preset, burn_captions=burn_captions)
    except clip_export.ClipError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    except OSError as exc:
        raise HTTPException(503, "Temporary video storage is unavailable.") from exc
    finally:
        render_slot.release()
    return private_download(content, media_type="video/mp4", filename=f"indaverse-{project_id}-sequence.mp4")

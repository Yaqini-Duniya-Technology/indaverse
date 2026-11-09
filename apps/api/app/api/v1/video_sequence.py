from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Literal
from urllib.parse import unquote
from uuid import uuid4

import anyio
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.services.credits import check_storage
from app.api.v1.dependencies import get_current_user
from app.api.v1.video_clip_export import available_tools, render_slot
from app.api.v1.video_projects import owned_video_project
from app.database.connection import get_db
from app.models.user import User
from app.models.video_sequence import VideoSequence, VideoSequenceRevision, VideoSequenceSoundtrack, VideoSequenceSource
from app.services import clip_export, sequence_export as export, sequence_soundtrack as music
from app.services.export_response import metered_download
from app.services.video_delivery import POSTER_TAIL_MS, build_kit

from app.services.export_response import guard_download_origin

router = APIRouter(prefix="/projects/{project_id}/video/sequence", tags=["Video Studio"])


class CaptionCue(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    start_ms: int = Field(ge=0, lt=export.MAX_SEQUENCE_MS)
    end_ms: int = Field(gt=0, le=export.MAX_SEQUENCE_MS)
    text: str = Field(min_length=1, max_length=90)
    position: Literal["top", "bottom"] = "bottom"

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        lines = value.split("\n")
        if len(lines) > 2 or any(not line.strip() or not line.isprintable() for line in lines):
            raise ValueError("Use one or two nonempty lines of printable caption text.")
        return "\n".join(line.strip() for line in lines)


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
    caption_cues: list[CaptionCue] = Field(default_factory=list, max_length=export.MAX_CUES_PER_CLIP)

    @field_validator("title", "caption")
    @classmethod
    def validate_clip_text(cls, value: str) -> str:
        if any(not character.isprintable() for character in value):
            raise ValueError("Clip text must be a single line of printable text.")
        return value.strip()


class SoundtrackSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    start_ms: int = Field(ge=0, le=120_000)
    end_ms: int = Field(gt=0, le=120_000)
    offset_ms: int = Field(default=0, ge=0, lt=export.MAX_SEQUENCE_MS)
    volume_percent: int = Field(default=35, ge=0, le=100)
    fade_in_ms: int = Field(default=0, ge=0, le=5000)
    fade_out_ms: int = Field(default=0, ge=0, le=5000)
    mode: Literal["mix", "replace"] = "mix"


class SequenceEdit(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    version: int = Field(ge=0)
    clips: list[Cut] = Field(max_length=export.MAX_CLIPS)
    soundtrack_settings: SoundtrackSettings | None = None


def load(db, project_id, user_id, *, lock=False, version=None):
    owned_video_project(db, project_id, user_id, lock=lock)
    sequence = db.get(VideoSequence, project_id, populate_existing=True)
    if version is not None and version != (sequence.version if sequence else 0):
        raise HTTPException(409, "The saved sequence changed. Reload before saving again.")
    sources = {source.id: source for source in db.scalars(select(VideoSequenceSource)
               .where(VideoSequenceSource.project_id == project_id))}
    return sequence, sources


def state(db, sequence, sources):
    track = db.get(VideoSequenceSoundtrack, sequence.project_id) if sequence else None
    return {
        "soundtrack": ({"name": track.name, "duration_ms": track.duration_ms,
                        "media_type": music.MEDIA_TYPES[track.format], "settings": track.settings}
                       if track else None),
        "version": sequence.version if sequence else 0,
        "clips": sequence.clips if sequence else [],
        "sources": [{"id": s.id, "name": s.name, "duration_ms": s.duration_ms} for s in sources.values()],
        "renderer_available": available_tools() is not None,
    }


REVISION_LIMIT = 30


def record_revision(db, sequence):
    if sequence is None or not sequence.version:
        return
    key = (sequence.project_id, sequence.version)
    if db.get(VideoSequenceRevision, key) is not None:
        return
    track = db.get(VideoSequenceSoundtrack, sequence.project_id)
    db.add(VideoSequenceRevision(project_id=sequence.project_id, version=sequence.version, snapshot={
        "clips": sequence.clips,
        "soundtrack": {"source_token": track.source_token, "settings": track.settings} if track else None,
    }))


def commit_sequence(db, sequence, sources):
    db.flush()
    record_revision(db, sequence)
    db.execute(delete(VideoSequenceRevision).where(
        VideoSequenceRevision.project_id == sequence.project_id,
        VideoSequenceRevision.version <= sequence.version - REVISION_LIMIT,
    ))
    result = state(db, sequence, sources)
    db.commit()
    return result


@router.get("/revisions")
def list_sequence_revisions(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sequence, sources = load(db, project_id, user.id, lock=True)
    if sequence is None:
        return {"version": 0, "revisions": []}
    track = db.get(VideoSequenceSoundtrack, project_id)
    rows = db.scalars(select(VideoSequenceRevision).where(VideoSequenceRevision.project_id == project_id)
                     .order_by(VideoSequenceRevision.version.desc()).limit(REVISION_LIMIT))
    revisions = []
    for row in rows:
        snapshot = row.snapshot
        audio = snapshot["soundtrack"]
        compatible = (set(sources) == {clip["source_id"] for clip in snapshot["clips"]}
                      and bool(audio) == bool(track)
                      and (track is None or audio["source_token"] == track.source_token))
        revisions.append({"version": row.version, "clips": snapshot["clips"],
                          "soundtrack_settings": audio["settings"] if audio else None,
                          "compatible": compatible})
    return {"version": sequence.version, "revisions": revisions}


@router.get("")
def get_sequence(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return state(db, *load(db, project_id, user.id, lock=True))


def add_source(db, project_id, user_id, version, name, duration, content):
    sequence, sources = load(db, project_id, user_id, lock=True, version=version)
    if len(sources) >= export.MAX_CLIPS:
        raise HTTPException(422, "Remove a saved clip before adding another.")
    current = sequence.clips if sequence else []
    remaining = export.MAX_SEQUENCE_MS - sum(c["end_ms"] - c["start_ms"] for c in current)
    end = min(5000, duration, remaining)
    if end < export.MIN_SEGMENT_MS:
        raise HTTPException(422, "Shorten the saved sequence before adding this clip.")
    check_storage(db, user_id, len(content))
    if sequence is None:
        sequence = VideoSequence(project_id=project_id, version=0, clips=[])
        db.add(sequence)
        db.flush()
    record_revision(db, sequence)
    source = VideoSequenceSource(id=uuid4().hex, project_id=project_id, name=name,
                                 duration_ms=duration, content=content)
    db.add(source)
    sequence.clips = [*current, {"source_id": source.id, "start_ms": 0, "end_ms": end}]
    sequence.version += 1
    sources[source.id] = source
    return commit_sequence(db, sequence, sources)


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


def store_soundtrack(db, project_id, user_id, version, name, audio_format, duration, content):
    sequence, sources = load(db, project_id, user_id, lock=True, version=version)
    if sequence is None or not sequence.clips:
        raise HTTPException(422, "Add a video clip before attaching a soundtrack.")
    record_revision(db, sequence)
    track = db.get(VideoSequenceSoundtrack, project_id)
    check_storage(db, user_id, len(content) - (len(track.content) if track else 0))
    if track is None:
        track = VideoSequenceSoundtrack(project_id=project_id)
        db.add(track)
    track.source_token = uuid4().hex
    track.name = name
    track.format = audio_format
    track.duration_ms = duration
    track.settings = SoundtrackSettings(start_ms=0, end_ms=duration).model_dump()
    track.content = content
    sequence.version += 1
    db.flush()
    return commit_sequence(db, sequence, sources)


@router.post("/soundtrack")
async def upload_soundtrack(
    project_id: int, request: Request,
    version: int = Query(ge=0), encoded_name: str = Header(alias="X-Audio-Filename", max_length=1800),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    user_id = user.id
    def check_sequence():
        sequence, _ = load(db, project_id, user_id, version=version)
        if sequence is None or not sequence.clips:
            raise HTTPException(422, "Add a video clip before attaching a soundtrack.")

    await run_in_threadpool(check_sequence)
    await run_in_threadpool(db.close)
    tools = available_tools()
    if tools is None:
        raise HTTPException(503, "Local audio processing is unavailable.")
    name = unquote(encoded_name).strip()
    if not 1 <= len(name) <= 150 or any(not char.isprintable() or char in "/\\" for char in name):
        raise HTTPException(422, "Use a soundtrack name of 1 to 150 characters.")
    audio_format = name.lower().rsplit(".", 1)[-1] if "." in name else ""
    if audio_format not in music.MEDIA_TYPES or music.MEDIA_TYPES[audio_format] != request.headers.get("content-type"):
        raise HTTPException(415, "Choose an MP3 or PCM WAV soundtrack.")
    if not render_slot.acquire(blocking=False):
        raise HTTPException(429, "Media processing is busy. Try again shortly.")
    try:
        with TemporaryDirectory(prefix="indaverse-soundtrack-") as folder:
            path = Path(folder) / f"soundtrack.{audio_format}"
            size = 0
            with anyio.fail_after(30):
                async with await anyio.open_file(path, "wb") as target:
                    async for chunk in request.stream():
                        size += len(chunk)
                        if size > music.MAX_BYTES:
                            raise HTTPException(413, "Soundtracks must be 8 MiB or smaller.")
                        await target.write(chunk)
            duration = await run_in_threadpool(music.duration_ms, tools[1], path, audio_format)
            content = await run_in_threadpool(path.read_bytes)
            return await run_in_threadpool(store_soundtrack, db, project_id, user_id, version,
                                           name, audio_format, duration, content)
    except TimeoutError as exc:
        raise HTTPException(408, "The soundtrack upload timed out.") from exc
    except clip_export.ClipError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    except OSError as exc:
        raise HTTPException(503, "Temporary audio storage is unavailable.") from exc
    finally:
        render_slot.release()


@router.get("/soundtrack")
def preview_soundtrack(project_id: int, version: int = Query(ge=0),
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    load(db, project_id, user.id, lock=True, version=version)
    track = db.get(VideoSequenceSoundtrack, project_id)
    if track is None:
        raise HTTPException(404, "No saved soundtrack.")
    return Response(track.content, media_type=music.MEDIA_TYPES[track.format],
                    headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


@router.delete("/soundtrack")
def remove_soundtrack(project_id: int, version: int = Query(ge=0),
                      user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sequence, sources = load(db, project_id, user.id, lock=True, version=version)
    track = db.get(VideoSequenceSoundtrack, project_id)
    if track is None:
        raise HTTPException(404, "No saved soundtrack.")
    record_revision(db, sequence)
    db.delete(track)
    sequence.version += 1
    db.flush()
    return commit_sequence(db, sequence, sources)


@router.put("")
def save_sequence(project_id: int, edit: SequenceEdit,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sequence, sources = load(db, project_id, user.id, lock=True, version=edit.version)
    kept = set()
    total = 0
    cue_count = 0
    for clip in edit.clips:
        source = sources.get(clip.source_id)
        if source is None or clip.source_id in kept:
            raise HTTPException(422, "Each clip must use a distinct source in this project.")
        duration = clip.end_ms - clip.start_ms
        if duration < export.MIN_SEGMENT_MS or clip.end_ms > source.duration_ms:
            raise HTTPException(422, "Each cut must be at least 0.5 seconds and within its source.")
        if clip.caption and clip.caption_cues:
            raise HTTPException(422, "Choose a full-cut caption or timed captions for each clip.")
        previous_end = 0
        clip.caption_cues.sort(key=lambda cue: cue.start_ms)
        for cue in clip.caption_cues:
            if cue.start_ms < previous_end or cue.end_ms > duration or cue.end_ms - cue.start_ms < export.MIN_CUE_MS:
                raise HTTPException(422, "Captions must be at least 0.1 seconds, fit inside the cut, and not overlap.")
            previous_end = cue.end_ms
        cue_count += len(clip.caption_cues) or int(bool(clip.caption))
        kept.add(clip.source_id)
        total += duration
    if total > export.MAX_SEQUENCE_MS:
        raise HTTPException(422, "The sequence must be 30 seconds or shorter.")
    if cue_count > export.MAX_CUES:
        raise HTTPException(422, "Use no more than 16 captions across the sequence.")
    clips = [clip.model_dump(exclude_defaults=True) for clip in edit.clips]
    soundtrack_changed = False
    if edit.soundtrack_settings is not None:
        track = db.get(VideoSequenceSoundtrack, project_id)
        if track is None:
            raise HTTPException(422, "Attach a soundtrack before changing its settings.")
        settings = edit.soundtrack_settings
        length = settings.end_ms - settings.start_ms
        if length < 250 or settings.end_ms > track.duration_ms:
            raise HTTPException(422, "Choose at least 0.25 seconds within the soundtrack.")
        if settings.fade_in_ms > length or settings.fade_out_ms > length:
            raise HTTPException(422, "Each fade must be within the selected soundtrack range.")
        updated_settings = settings.model_dump()
        soundtrack_changed = track.settings != updated_settings
        if soundtrack_changed:
            record_revision(db, sequence)
            track.settings = updated_settings
    if sequence is not None and (sequence.clips != clips or soundtrack_changed):
        if not soundtrack_changed:
            record_revision(db, sequence)
        sequence.clips = clips
        sequence.version += 1
        for source_id in sources.keys() - kept:
            db.delete(sources.pop(source_id))
        return commit_sequence(db, sequence, sources)
    return state(db, sequence, sources)


@router.get("/sources/{source_id}")
def preview_source(project_id: int, source_id: str,
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _, sources = load(db, project_id, user.id, lock=True)
    source = sources.get(source_id)
    if source is None:
        raise HTTPException(404, "Saved clip not found.")
    return Response(source.content, media_type="video/mp4", headers={"Cache-Control": "no-store"})


@router.get("/captions.{extension}", dependencies=[Depends(guard_download_origin)])
def download_captions(project_id: int, extension: Literal["srt", "vtt"], version: int = Query(ge=0),
                      user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sequence, _ = load(db, project_id, user.id, lock=True, version=version)
    vtt = extension == "vtt"
    content = export.captions_file(sequence.clips if sequence else [], vtt=vtt)
    if not content:
        raise HTTPException(422, "Save at least one caption before downloading.")
    return metered_download(db, user.id, content, media_type="text/vtt; charset=utf-8" if vtt else "application/x-subrip",
                            filename=f"indaverse-{project_id}-captions.{extension}")


@router.post("/render")
def render_sequence(project_id: int, version: int = Query(ge=0),
                    preset: export.Preset = "landscape", burn_captions: bool = False,
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    content = render_saved(db, project_id, user.id, version, preset, burn_captions)
    return metered_download(db, user.id, content, media_type="video/mp4", filename=f"indaverse-{project_id}-sequence.mp4",
                            edge=max(export.CANVASES[preset]))


@router.post("/delivery")
def export_delivery(project_id: int, version: int = Query(ge=0),
                    preset: export.Preset = "landscape", burn_captions: bool = False,
                    poster_ms: int | None = Query(default=None, ge=0, lt=export.MAX_SEQUENCE_MS),
                    include_srt: bool = True, include_vtt: bool = True,
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    def package(folder, mp4, cuts, ffmpeg):
        duration = sum(cut["end_ms"] - cut["start_ms"] for cut in cuts)
        return build_kit(ffmpeg, folder, mp4, cuts, version=version, preset=preset,
                         burn_captions=burn_captions, poster_ms=duration // 2 if poster_ms is None else poster_ms,
                         include_srt=include_srt, include_vtt=include_vtt)

    content = render_saved(db, project_id, user.id, version, preset, burn_captions,
                           package=package, poster_ms=poster_ms)
    return metered_download(db, user.id, content, media_type="application/zip", filename=f"indaverse-{project_id}-delivery.zip",
                            premium=True, edge=max(export.CANVASES[preset]))


def render_saved(db, project_id, user_id, version, preset, burn_captions, *, package=None, poster_ms=None):
    tools = available_tools()
    # Check ownership and snapshot the expected saved version before rendering.
    sequence, sources = load(db, project_id, user_id, lock=True, version=version)
    if tools is None:
        raise HTTPException(503, "Local MP4 processing is unavailable.")
    if sequence is None or not sequence.clips:
        raise HTTPException(422, "Add a clip before rendering.")
    cuts = sequence.clips
    if poster_ms is not None and poster_ms > sum(cut["end_ms"] - cut["start_ms"] for cut in cuts) - POSTER_TAIL_MS:
        raise HTTPException(422, "Choose a poster time at least 0.1 seconds before the video ends.")
    if not render_slot.acquire(blocking=False):
        raise HTTPException(429, "Video processing is busy. Try again shortly.")
    try:
        items = [(cut, sources[cut["source_id"]].content) for cut in cuts]
        track = db.get(VideoSequenceSoundtrack, project_id)
        soundtrack = (track.format, track.settings, track.content) if track else None
        db.close()
        with TemporaryDirectory(prefix="indaverse-sequence-") as folder:
            content = export.render(tools, Path(folder), items, preset=preset,
                                    burn_captions=burn_captions, soundtrack=soundtrack)
            return package(Path(folder), content, cuts, tools[0]) if package else content
    except clip_export.ClipError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    except OSError as exc:
        raise HTTPException(503, "Temporary video storage is unavailable.") from exc
    finally:
        render_slot.release()

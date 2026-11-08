"""Package a saved export using fixed filenames and bounded generated assets."""
import csv
from hashlib import sha256
from io import BytesIO, StringIO
import json
from pathlib import Path
from zipfile import ZIP_STORED, ZipFile

from app.services.clip_export import ClipError, run
from app.services.sequence_export import CANVASES, captions_file, clip_cues

POSTER_TAIL_MS = 100


def build_kit(ffmpeg, directory: Path, content: bytes, cuts, *, version, preset,
              burn_captions, poster_ms, include_srt, include_vtt):
    duration = sum(cut["end_ms"] - cut["start_ms"] for cut in cuts)
    width, height = CANVASES[preset]
    poster = directory / "poster.jpg"
    run([ffmpeg, "-v", "error", "-nostdin", "-threads", "2", "-max_alloc", "67108864",
         "-protocol_whitelist", "file", "-ss", f"{poster_ms / 1000:.3f}",
         "-i", str(directory / "sequence.mp4"), "-frames:v", "1", "-threads", "1", "-q:v", "3",
         "-f", "image2", "-update", "1", str(poster)], timeout=10)
    if not poster.is_file() or not 0 < poster.stat().st_size <= 1024 * 1024:
        raise ClipError("A poster could not be created. Choose an earlier time.")

    timeline = StringIO(newline="")
    writer = csv.writer(timeline)
    writer.writerow(("clip", "source_start_ms", "source_end_ms", "video_start_ms", "video_end_ms", "caption_count"))
    offset = 0
    transcript = []
    for index, cut in enumerate(cuts, 1):
        cues = clip_cues(cut)
        end = offset + cut["end_ms"] - cut["start_ms"]
        writer.writerow((index, cut["start_ms"], cut["end_ms"], offset, end, len(cues)))
        for cue in cues:
            transcript.append(f"[{(offset + cue['start_ms']) / 1000:.3f} s]\n{cue['text']}")
        offset = end

    checklist = (
        "Before publishing\n\n"
        "1. Watch video.mp4 and check framing, sound and caption timing.\n"
        "2. Check that poster.jpg is readable at thumbnail size.\n"
        "3. If your platform accepts subtitles, upload one of the included subtitle files.\n"
        "4. Confirm you have permission to publish the footage and music.\n"
        "5. Add your own post description and check the platform preview before posting.\n"
    )
    files = {
        "video.mp4": content,
        "poster.jpg": poster.read_bytes(),
        "timeline.csv": timeline.getvalue().encode("utf-8"),
        "publishing-checklist.txt": checklist.encode("utf-8"),
    }
    if transcript:
        files["caption-transcript.txt"] = ("\n\n".join(transcript) + "\n").encode("utf-8")
        if include_srt:
            files["captions.srt"] = captions_file(cuts)
        if include_vtt:
            files["captions.vtt"] = captions_file(cuts, vtt=True)
    manifest = {
        "schema_version": 1, "sequence_version": version, "preset": preset,
        "width": width, "height": height, "planned_duration_ms": duration,
        "poster_requested_ms": poster_ms, "captions_burned_in": bool(transcript and burn_captions),
        "files": {name: {"bytes": len(data), "sha256": sha256(data).hexdigest()} for name, data in files.items()},
    }
    files["manifest.json"] = (json.dumps(manifest, indent=2) + "\n").encode("utf-8")
    archive = BytesIO()
    with ZipFile(archive, "w", compression=ZIP_STORED) as zipped:
        for name, data in files.items():
            zipped.writestr(name, data)
    return archive.getvalue()

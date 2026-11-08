"""Bounded, local-only rendering of one H.264 MP4 clip."""
import json
import math
import shutil
import subprocess
from pathlib import Path

MAX_BYTES = 32 * 1024 * 1024
MAX_SOURCE_SECONDS = 120
MAX_CLIP_SECONDS = 30
MIN_CLIP_SECONDS = 0.5
INPUT_FLAGS = (
    "-protocol_whitelist", "file", "-f", "mov", "-enable_drefs", "0",
    "-use_absolute_path", "0", "-max_streams", "8",
)


class ClipError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


def renderer_tools() -> tuple[str, str] | None:
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    return (ffmpeg, ffprobe) if ffmpeg and ffprobe else None


def run(args, *, timeout, capture=False):
    try:
        return subprocess.run(
            args, stdin=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
            timeout=timeout, check=True,
        ).stdout
    except subprocess.TimeoutExpired as exc:
        raise ClipError("Video processing timed out. Try a shorter or smaller clip.", 504) from exc
    except subprocess.CalledProcessError as exc:
        raise ClipError("Could not process this MP4. Try a standard H.264 MP4 file.") from exc
    except OSError as exc:
        raise ClipError("The local video renderer could not start.", 503) from exc


def probe(ffprobe: str, path: Path, *, video_only_duration: bool = False):
    raw = run(
        [ffprobe, "-v", "error", "-max_alloc", "67108864", *INPUT_FLAGS,
         "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,duration:stream_disposition=attached_pic",
         "-of", "json", str(path)],
        timeout=8, capture=True,
    )
    try:
        info = json.loads(raw)
        duration = float(info["format"]["duration"])
        video = next(s for s in info["streams"] if s["codec_type"] == "video")
        if video_only_duration:
            # Ignore a longer audio track when checking whether a video cut exists.
            track_duration = float(video["duration"])
            if not math.isfinite(track_duration):
                raise ValueError
            duration = min(duration, track_duration)
        has_audio = any(s["codec_type"] == "audio" for s in info["streams"])
        if (not math.isfinite(duration) or duration <= 0 or video["codec_name"] != "h264"
                or video.get("disposition", {}).get("attached_pic", 0)
                or not 2 <= video["width"] <= 1920 or not 2 <= video["height"] <= 1920
                or video["width"] * video["height"] > 1920 * 1080):
            raise ValueError
    except (KeyError, TypeError, ValueError, StopIteration) as exc:
        raise ClipError("Use an H.264 MP4 video up to 1080p, without cover art as its first video stream.") from exc
    return duration, has_audio


def trim_mp4(tools: tuple[str, str], source: Path, output: Path, start: float, end: float) -> bytes:
    ffmpeg, ffprobe = tools
    duration, has_audio = probe(ffprobe, source)
    if duration > MAX_SOURCE_SECONDS or end > duration + 0.01:
        raise ClipError("The source must be at most 120 seconds and the cut must end within it.")
    length = end - start
    run(
        [ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-max_alloc", "67108864",
         "-filter_threads", "1", "-threads", "2", *INPUT_FLAGS,
         "-ss", f"{start:.6f}", "-i", str(source), "-t", f"{length:.6f}",
         "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1", "-map_chapters", "-1",
         "-vf", "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
         "-r", "30", "-c:v", "libx264", "-threads", "2", "-preset", "veryfast",
         "-pix_fmt", "yuv420p", "-crf", "23", "-maxrate", "6M", "-bufsize", "6M",
         "-c:a", "aac", "-ac", "2", "-b:a", "128k", "-movflags", "+faststart",
         "-fs", str(MAX_BYTES), "-f", "mp4", str(output)],
        timeout=45,
    )
    actual, output_audio = probe(ffprobe, output)
    if abs(actual - length) > 0.15 or output_audio != has_audio or not 0 < output.stat().st_size < MAX_BYTES:
        raise ClipError("The export did not contain the requested range. Try a different source clip.")
    return output.read_bytes()

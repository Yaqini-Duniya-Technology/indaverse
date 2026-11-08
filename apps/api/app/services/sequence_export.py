"""Render an ordered sequence using the local clip export policy."""
from html import escape
from pathlib import Path
from textwrap import wrap
from typing import Literal

from PIL import Image, ImageDraw, ImageFont

from app.services.sequence_soundtrack import append_mix
from app.services.clip_export import ClipError, INPUT_FLAGS, MAX_BYTES, probe, run

MAX_CLIPS = 4
MAX_SOURCE_BYTES = 8 * 1024 * 1024
MAX_SEQUENCE_MS = 30_000
MIN_SEGMENT_MS = 500
FADE_SECONDS = 0.25


Preset = Literal["landscape", "vertical", "square"]
CANVASES: dict[Preset, tuple[int, int]] = {
    "landscape": (640, 360),
    "vertical": (360, 640),
    "square": (480, 480),
}


def text_card(path: Path, text: str, size: tuple[int, int], position: str, *, caption=False) -> None:
    width, height = size
    canvas = Image.new("RGBA", size)
    draw = ImageDraw.Draw(canvas)
    lines = "\n".join(wrap(text, width=30)) if caption else text
    limit = width - 64
    for font_size in range(27 if not caption else 23, 8, -1):
        font = ImageFont.load_default(size=font_size)
        left, top, right, bottom = draw.multiline_textbbox((0, 0), lines, font=font, align="center")
        if right - left <= limit:
            break
    if right - left > limit:
        raise ClipError("The clip text is too wide. Use shorter text.")
    w, h = right - left, bottom - top
    x = (width - w) // 2
    y = {"top": 26, "bottom": height - 42 - h,
         "above-caption": height - 150 - h, "caption": height - 24 - h}[position]
    draw.rounded_rectangle((x - 14, y - 8, x + w + 14, y + h + 8),
                           radius=8, fill=(0, 0, 0, 206))
    draw.multiline_text((x - left, y - top), lines, font=font, fill="white", align="center")
    canvas.save(path)


def srt_timestamp(milliseconds: int) -> str:
    seconds, ms = divmod(milliseconds, 1000)
    minutes, second = divmod(seconds, 60)
    hour, minute = divmod(minutes, 60)
    return f"{hour:02d}:{minute:02d}:{second:02d},{ms:03d}"


def captions_srt(cuts: list[dict]) -> bytes:
    cues = []
    start = 0
    for cut in cuts:
        end = start + cut["end_ms"] - cut["start_ms"]
        if text := cut.get("caption"):
            cues.append(
                f"{len(cues) + 1}\n{srt_timestamp(start)} --> {srt_timestamp(end)}\n{escape(text, quote=False)}\n"
            )
        start = end
    return "\n".join(cues).encode("utf-8")


def render(tools: tuple[str, str], directory: Path, items: list[tuple[dict, bytes]],
           *, preset: Preset = "landscape", burn_captions: bool = False,
           soundtrack: tuple[str, dict, bytes] | None = None) -> bytes:
    width, height = CANVASES[preset]
    ffmpeg, ffprobe = tools
    inputs, overlays, filters, streams = [], [], [], []
    expected = 0
    for index, (cut, content) in enumerate(items):
        path = directory / f"source-{index}.mp4"
        path.write_bytes(content)
        video_duration, has_audio = probe(ffprobe, path, video_only_duration=True)
        if cut["end_ms"] / 1000 > video_duration + 0.001:
            raise ClipError("A saved cut extends beyond its video track.")
        start = cut["start_ms"] / 1000
        length = (cut["end_ms"] - cut["start_ms"]) / 1000
        expected += length
        inputs.extend(["-threads", "2", *INPUT_FLAGS, "-ss", f"{start:.3f}",
                       "-t", f"{length:.3f}", "-i", str(path)])
        framing = (f"scale={width}:{height}:force_original_aspect_ratio=increase:force_divisible_by=2,"
                   f"crop={width}:{height}" if cut.get("framing") == "fill" else
                   f"scale={width}:{height}:force_original_aspect_ratio=decrease:force_divisible_by=2,"
                   f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2")
        picture = f"base{index}"
        filters.append(f"[{index}:v:0]setpts=PTS-STARTPTS,{framing},setsar=1,fps=30,format=yuv420p[{picture}]")
        caption = cut.get("caption") if burn_captions else None
        title_position = cut.get("title_position", "bottom")
        if caption and title_position == "bottom":
            title_position = "above-caption"
        for kind, text, position, until in (
            ("title", cut.get("title"), title_position, cut.get("title_duration_ms", 0)),
            ("caption", caption, "caption", 0),
        ):
            if not text:
                continue
            card = directory / f"{kind}-{index}.png"
            text_card(card, text, (width, height), position, caption=kind == "caption")
            overlay_index = len(items) + len(overlays)
            overlays.append(["-threads", "1", "-protocol_whitelist", "file",
                             "-f", "image2", "-pattern_type", "none", "-c:v", "png", "-i", str(card)])
            enable = f":enable='lt(t,{until / 1000:.3f})'" if until else ""
            target = f"{kind}{index}"
            filters.append(
                f"[{picture}][{overlay_index}:v]overlay=eof_action=repeat{enable},format=yuv420p[{target}]"
            )
            picture = target
        video_fade = audio_fade = ""
        if cut.get("fade_edges", False):
            fade_out = length - FADE_SECONDS
            video_fade = f",fade=t=in:st=0:d={FADE_SECONDS},fade=t=out:st={fade_out:.3f}:d={FADE_SECONDS}"
            audio_fade = f",afade=t=in:st=0:d={FADE_SECONDS},afade=t=out:st={fade_out:.3f}:d={FADE_SECONDS}"
        filters.append(f"[{picture}]null{video_fade}[v{index}]")
        volume = cut.get("volume_percent", 100)
        if has_audio and not cut.get("muted", False) and volume > 0:
            audio = (f"[{index}:a:0]asetpts=PTS-STARTPTS,aresample=48000,"
                     f"aformat=sample_rates=48000:channel_layouts=stereo,volume={volume / 100:.2f},apad")
        else:
            audio = "anullsrc=channel_layout=stereo:sample_rate=48000"
        filters.append(f"{audio},atrim=duration={length:.3f},asetpts=PTS-STARTPTS{audio_fade}[a{index}]")
        streams.append(f"[v{index}][a{index}]")
    audio_output = "clipaudio" if soundtrack else "audio"
    filters.append("".join(streams) + f"concat=n={len(items)}:v=1:a=1[video][{audio_output}]")
    music_input = append_mix(directory, soundtrack, expected, len(items) + len(overlays), filters) if soundtrack else []
    output = directory / "sequence.mp4"
    run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-max_alloc", "67108864",
        "-filter_complex_threads", "1", *inputs, *(flag for args in overlays for flag in args), *music_input, "-filter_complex", ";".join(filters),
        "-map", "[video]", "-map", "[audio]", "-map_metadata", "-1", "-map_chapters", "-1",
        "-t", f"{expected:.3f}", "-c:v", "libx264", "-preset", "veryfast", "-threads", "2",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
        "-fs", str(MAX_BYTES), "-f", "mp4", str(output),
    ], timeout=60)
    duration, audio = probe(ffprobe, output, video_only_duration=True)
    if abs(duration - expected) > 0.17 or not audio or not 0 < output.stat().st_size < MAX_BYTES:
        raise ClipError("The rendered duration did not match the saved sequence.")
    return output.read_bytes()

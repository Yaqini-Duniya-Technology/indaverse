"""Render an ordered sequence using the local clip export policy."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.services.clip_export import ClipError, INPUT_FLAGS, MAX_BYTES, probe, run

MAX_CLIPS = 4
MAX_SOURCE_BYTES = 8 * 1024 * 1024
MAX_SEQUENCE_MS = 30_000
MIN_SEGMENT_MS = 500


def title_card(path: Path, title: str) -> None:
    canvas = Image.new("RGBA", (640, 360))
    draw = ImageDraw.Draw(canvas)
    for size in range(27, 9, -1):
        font = ImageFont.load_default(size=size)
        left, top, right, bottom = draw.textbbox((0, 0), title, font=font)
        if right - left <= 552:
            break
    width, height = right - left, bottom - top
    if width > 552:
        raise ClipError("The title is too wide. Use shorter text.")
    x, y = (640 - width) // 2, 318 - height // 2
    draw.rounded_rectangle((x - 14, y - 8, x + width + 14, y + height + 8),
                           radius=8, fill=(0, 0, 0, 206))
    draw.text((x - left, y - top), title, font=font, fill="white")
    canvas.save(path)

def render(tools: tuple[str, str], directory: Path, items: list[tuple[dict, bytes]]) -> bytes:
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
        filters.append(
            f"[{index}:v:0]setpts=PTS-STARTPTS,"
            "scale=640:360:force_original_aspect_ratio=decrease:force_divisible_by=2,"
            f"pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[base{index}]"
        )
        if title := cut.get("title"):
            card = directory / f"title-{index}.png"
            title_card(card, title)
            overlay_index = len(items) + len(overlays)
            overlays.append(["-threads", "1", "-protocol_whitelist", "file",
                             "-f", "image2", "-pattern_type", "none", "-c:v", "png", "-i", str(card)])
            filters.append(f"[base{index}][{overlay_index}:v]overlay=eof_action=repeat,format=yuv420p[v{index}]")
        else:
            filters.append(f"[base{index}]null[v{index}]")
        if has_audio and not cut.get("muted", False):
            audio = (f"[{index}:a:0]asetpts=PTS-STARTPTS,aresample=48000,"
                     "aformat=sample_rates=48000:channel_layouts=stereo,apad")
        else:
            audio = "anullsrc=channel_layout=stereo:sample_rate=48000"
        filters.append(f"{audio},atrim=duration={length:.3f},asetpts=PTS-STARTPTS[a{index}]")
        streams.append(f"[v{index}][a{index}]")
    filters.append("".join(streams) + f"concat=n={len(items)}:v=1:a=1[video][audio]")
    output = directory / "sequence.mp4"
    run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-max_alloc", "67108864",
        "-filter_complex_threads", "1", *inputs, *(flag for args in overlays for flag in args), "-filter_complex", ";".join(filters),
        "-map", "[video]", "-map", "[audio]", "-map_metadata", "-1", "-map_chapters", "-1",
        "-t", f"{expected:.3f}", "-c:v", "libx264", "-preset", "veryfast", "-threads", "2",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
        "-fs", str(MAX_BYTES), "-f", "mp4", str(output),
    ], timeout=60)
    duration, audio = probe(ffprobe, output, video_only_duration=True)
    if abs(duration - expected) > 0.17 or not audio or not 0 < output.stat().st_size < MAX_BYTES:
        raise ClipError("The rendered duration did not match the saved sequence.")
    return output.read_bytes()

"""Probe and mix a bounded, local audio source."""
import json
import math
from pathlib import Path

from app.services.clip_export import ClipError, run

MAX_BYTES = 8 * 1024 * 1024
MEDIA_TYPES = {"mp3": "audio/mpeg", "wav": "audio/wav"}
CODECS = {"mp3": {"mp3"}, "wav": {"pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_f32le", "pcm_u8"}}


def input_flags(audio_format):
    return ["-protocol_whitelist", "file", "-f", audio_format, "-max_streams", "4"]


def duration_ms(ffprobe, path, audio_format):
    error = "Choose an MP3 or PCM WAV with mono or stereo audio, up to 120 seconds and 96 kHz."
    try:
        raw = run([ffprobe, "-v", "error", "-max_alloc", "67108864", *input_flags(audio_format),
                   "-show_entries", "format=duration:stream=codec_type,codec_name,sample_rate,channels",
                   "-of", "json", str(path)], timeout=8, capture=True)
        info = json.loads(raw)
        (stream,) = info["streams"]
        duration = float(info["format"]["duration"])
        if (stream["codec_type"] != "audio" or stream["codec_name"] not in CODECS[audio_format]
                or not 0 < int(stream["sample_rate"]) <= 96000 or stream["channels"] not in (1, 2)
                or not math.isfinite(duration) or not .25 <= duration <= 120):
            raise ValueError
    except ClipError as exc:
        if exc.status != 422:
            raise
        raise ClipError(error) from exc
    except (TypeError, ValueError, KeyError) as exc:
        raise ClipError(error) from exc
    return int(duration * 1000)


def append_mix(directory: Path, soundtrack, duration, index, filters):
    audio_format, settings, content = soundtrack
    offset = settings["offset_ms"]
    length = min(settings["end_ms"] - settings["start_ms"], round(duration * 1000) - offset)
    args = []
    track = "anullsrc=channel_layout=stereo:sample_rate=48000"
    if length > 0 and settings["volume_percent"] > 0:
        source = directory / f"soundtrack.{audio_format}"
        source.write_bytes(content)
        args = ["-threads", "1", *input_flags(audio_format), "-i", str(source)]
        start = settings["start_ms"]
        track = (f"[{index}:a:0]asetpts=PTS-STARTPTS,aresample=48000,"
                 f"aformat=sample_rates=48000:channel_layouts=stereo,atrim=start_sample={start * 48}:"
                 f"end_sample={(start + length) * 48},asetpts=PTS-STARTPTS,"
                 f"volume={settings['volume_percent'] / 100:.2f}")
        if fade_in := min(settings["fade_in_ms"], length):
            track += f",afade=t=in:ss=0:ns={fade_in * 48}"
        if fade_out := min(settings["fade_out_ms"], length):
            track += f",afade=t=out:ss={(length - fade_out) * 48}:ns={fade_out * 48}"
        # Anchor the delayed samples to sequence time before combining streams.
        track += f",adelay={offset * 48}S:all=1,asetpts=N/SR/TB,apad"
    filters.append(f"{track},atrim=duration={duration:.3f}[soundtrack]")
    if settings["mode"] == "replace":
        filters.extend(["[clipaudio]anullsink", "[soundtrack]anull[audio]"])
    else:
        filters.append("[clipaudio][soundtrack]amix=inputs=2:duration=first:normalize=0,"
                       "alimiter=limit=0.95:level=false:latency=true[audio]")
    return args

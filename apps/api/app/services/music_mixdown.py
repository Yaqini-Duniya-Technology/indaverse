"""Render a bounded, saved arrangement without modifying source media."""
import json
import math

from app.services.clip_export import ClipError, run

FORMATS = {"audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3",
           "audio/mp4": "mov", "audio/ogg": "ogg", "audio/webm": "matroska"}
MAX_OUTPUT = 110 * 1024 * 1024
RATE = 44100


def mix(tools, folder, tracks, output_format, duration_ms, start_ms=0, end_ms=None):
    ffmpeg, ffprobe = tools
    inputs, graph, outputs = [], [], []
    for i, (track, media_type, data) in enumerate(tracks):
        demuxer = FORMATS.get(media_type)
        if not demuxer:
            raise ClipError("Unsupported session audio source.")
        source = folder / f"source-{i}.{demuxer}"
        source.write_bytes(data)
        flags = ["-protocol_whitelist", "file", "-f", demuxer, "-max_streams", "4"]
        if demuxer == "mov":
            flags += ["-enable_drefs", "0", "-use_absolute_path", "0"]
        try:
            raw = run([ffprobe, "-v", "error", "-max_alloc", "67108864", *flags, "-select_streams", "a:0",
                       "-show_entries", "format=duration:stream=channels,sample_rate", "-of", "json", str(source)],
                      timeout=8, capture=True)
            meta = json.loads(raw)
            stream = meta["streams"][0]
            seconds = float(meta["format"]["duration"])
            if (not math.isfinite(seconds) or not 0.1 <= seconds <= 300.1 or stream["channels"] not in (1, 2)
                    or not 0 < int(stream["sample_rate"]) <= 96000
                    or any(region["end_ms"] > seconds * 1000 + 2 for region in track["regions"])):
                raise ValueError
        except (ClipError, IndexError, KeyError, TypeError, ValueError) as exc:
            raise ClipError("A session source cannot be decoded or its saved trim exceeds the audio.") from exc
        inputs += ["-threads", "1", *flags, "-i", str(source)]
        regions = track["regions"]
        parts = [f"part{i}_{j}" for j in range(len(regions))]
        fanout = f"asplit={len(parts)}" if len(parts) > 1 else "anull"
        graph.append(f"[{i}:a:0]aresample={RATE},aformat=channel_layouts=stereo,asetpts=N/SR/TB,{fanout}"
                     + "".join(f"[{part}]" for part in parts))
        for j, (part, region) in enumerate(zip(parts, regions)):
            length = region["end_ms"] - region["start_ms"]
            chain = (f"[{part}]atrim=start={region['start_ms']/1000:.3f}:end={region['end_ms']/1000:.3f},"
                     f"asetpts=N/SR/TB,volume={track['volume']/100/len(tracks):.8f}")
            if fade := region["fade_in_ms"]:
                chain += f",afade=t=in:d={fade/1000:.3f}"
            if fade := region["fade_out_ms"]:
                chain += f",afade=t=out:st={(length-fade)/1000:.3f}:d={fade/1000:.3f}"
            target = f"region{i}_{j}"
            graph.append(chain + f",adelay={round(region['offset_ms']*RATE/1000)}S:all=1,asetpts=N/SR/TB[{target}]")
            outputs.append(f"[{target}]")
    end_ms = duration_ms if end_ms is None else end_ms
    # Keep padding finite: atrim can consume frames after its end without emitting them.
    graph.append("".join(outputs) + f"amix=inputs={len(outputs)}:normalize=0,apad=whole_len={round(end_ms * RATE / 1000)},"
                 f"atrim=start={start_ms/1000:.3f}:end={end_ms/1000:.3f},asetpts=N/SR/TB[out]")
    output = folder / f"mix.{output_format}"
    codec = ["-c:a", "pcm_s16le"] if output_format == "wav" else ["-c:a", "libmp3lame", "-b:a", "192k"]
    try:
        run([ffmpeg, "-v", "error", "-nostdin", "-max_alloc", "67108864", "-filter_complex_threads", "1",
             *inputs, "-filter_complex", ";".join(graph), "-map", "[out]", "-map_metadata", "-1",
             *codec, "-fs", str(MAX_OUTPUT), str(output)], timeout=60)
    except ClipError as exc:
        raise ClipError("Could not render the saved music mix.", exc.status) from exc
    if not output.is_file() or not 0 < output.stat().st_size < MAX_OUTPUT:
        raise ClipError("The mix output is empty or exceeds its size limit.")
    return output.read_bytes()

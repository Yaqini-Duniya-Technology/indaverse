import json
import subprocess
import struct

import pytest

from app.services.clip_export import renderer_tools
from test_creative_workspace import workspace
from test_video_clip_export import video_workspace


def test_sequence_reopens_and_exports_saved_order(video_workspace, tmp_path):
    tools = renderer_tools()
    if not tools:
        pytest.skip("Requires FFmpeg and FFprobe.")
    ffmpeg, ffprobe = tools
    client = video_workspace
    base = "/api/v1/projects/1/video/sequence"
    assert client.get(base).json()["version"] == 0
    assert client.get("/api/v1/projects/3/video/sequence").status_code == 404
    assert client.post("/api/v1/projects/3/video/sequence/render?version=0").status_code == 404
    for version, color in enumerate(("red", "blue")):
        source = tmp_path / f"{color}.mp4"
        cmd = [ffmpeg, "-v", "error", "-f", "lavfi", "-i", f"color={color}:s=160x120:r=24:d=3"]
        if color == "red":
            cmd += ["-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:a", "aac"]
        subprocess.run([*cmd, "-c:v", "libx264", "-threads", "2", str(source)], check=True, timeout=15)
        response = client.post(f"{base}/sources?version={version}",
                               content=source.read_bytes(), headers={"Content-Type": "video/mp4", "X-Video-Filename": f"{color}.mp4"})
        assert response.status_code == 201, response.text
    saved = client.get(base).json()
    assert saved["version"] == 2
    red, blue = saved["clips"]
    assert client.get(f"{base}/sources/{blue['source_id']}").content == (tmp_path / "blue.mp4").read_bytes()
    client.cookies.set("indaverse_access_token", "2")
    assert client.get(f"{base}/sources/{blue['source_id']}").status_code == 404
    client.cookies.set("indaverse_access_token", "1")
    ordered = [{**blue, "start_ms": 500, "end_ms": 1500}, {**red, "start_ms": 1000, "end_ms": 2250}]
    assert client.put(base, json={"version": 1, "clips": ordered}).status_code == 409
    assert client.put(base, json={"version": 2, "clips": [blue, blue]}).status_code == 422
    assert client.put(base, json={"version": 2, "clips": [{**blue, "end_ms": 3100}]}).status_code == 422
    assert client.put(base, json={"version": 2, "clips": ordered}).json()["version"] == 3
    assert client.get(base).json()["clips"] == ordered
    assert client.post(base + "/render?version=2").status_code == 409
    response = client.post(base + "/render?version=3")
    assert response.status_code == 200, response.text
    output = tmp_path / "sequence.mp4"
    output.write_bytes(response.content)
    info = json.loads(subprocess.check_output([
        ffprobe, "-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height",
        "-of", "json", str(output),
    ], timeout=10))
    assert float(info["format"]["duration"]) == pytest.approx(2.25, abs=0.09)
    assert {s["codec_name"] for s in info["streams"]} == {"aac", "h264"}
    assert (info["streams"][0]["width"], info["streams"][0]["height"]) == (640, 360)
    for time, channel in (("0.25", 2), ("1.5", 0)):
        pixel = subprocess.check_output([
            ffmpeg, "-v", "error", "-ss", time, "-i", str(output), "-frames:v", "1",
            "-vf", "crop=2:2:320:180,scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-",
        ], timeout=10)
        assert len(pixel) == 3 and pixel[channel] > 200
    for time, expected_tone in (("0.2", False), ("1.4", True)):
        pcm = subprocess.check_output([
            ffmpeg, "-v", "error", "-ss", time, "-i", str(output), "-t", "0.2",
            "-map", "0:a:0", "-ac", "1", "-f", "s16le", "-",
        ], timeout=10)
        peak = max(abs(sample) for (sample,) in struct.iter_unpack("<h", pcm))
        assert (peak > 100) == expected_tone
        if expected_tone:
            original_peak = peak
    subprocess.run([ffmpeg, "-v", "error", "-xerror", "-i", str(output), "-f", "null", "-"],
                   check=True, timeout=10)
    for invalid in ({"title": "line one\nline two"}, {"title": "x" * 49}, {"muted": "true"}):
        assert client.put(base, json={"version": 3, "clips": [ordered[0], {**ordered[1], **invalid}]}).status_code == 422
    titled = [ordered[0], {**ordered[1], "title": "Zamara: 100% %{pts}", "muted": True}]
    assert client.put(base, json={"version": 3, "clips": titled}).json()["version"] == 4
    assert client.get(base).json()["clips"] == titled
    response = client.post(base + "/render?version=4")
    assert response.status_code == 200, response.text
    output.write_bytes(response.content)
    for time, has_title in (("0.25", False), ("1.5", True), ("2.1", True)):
        frame = subprocess.check_output([
            ffmpeg, "-v", "error", "-ss", time, "-i", str(output), "-frames:v", "1",
            "-vf", "crop=560:64:40:286", "-pix_fmt", "rgb24", "-f", "rawvideo", "-",
        ], timeout=10)
        white = sum(min(pixel) > 200 for pixel in struct.iter_unpack("BBB", frame))
        assert (white > 50) == has_title
    pcm = subprocess.check_output([
        ffmpeg, "-v", "error", "-ss", "1.4", "-i", str(output), "-t", "0.2",
        "-map", "0:a:0", "-ac", "1", "-f", "s16le", "-",
    ], timeout=10)
    assert max(abs(sample) for (sample,) in struct.iter_unpack("<h", pcm)) < 10
    for invalid in ({"volume_percent": -1}, {"volume_percent": 101}, {"volume_percent": 50.5},
                    {"fade_edges": "true"}):
        assert client.put(base, json={"version": 4, "clips": [ordered[0], {**ordered[1], **invalid}]}).status_code == 422
    faded = [ordered[0], {**titled[1], "muted": False, "volume_percent": 50, "fade_edges": True}]
    assert client.put(base, json={"version": 4, "clips": faded}).json()["version"] == 5
    saved_effects = client.get(base).json()["clips"][1]
    assert saved_effects["volume_percent"] == 50 and saved_effects["fade_edges"] is True
    assert not saved_effects.get("muted", False)
    response = client.post(base + "/render?version=5")
    assert response.status_code == 200, response.text
    output.write_bytes(response.content)
    for time, visible in (("0.35", True), ("1.04", False), ("1.55", True), ("2.19", False)):
        pixel = subprocess.check_output([
            ffmpeg, "-v", "error", "-ss", time, "-i", str(output), "-frames:v", "1",
            "-vf", "crop=2:2:320:180,scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-",
        ], timeout=10)
        assert len(pixel) == 3
        assert max(pixel) > 200 if visible else max(pixel) < 115
    for time, middle in (("1.02", False), ("1.45", True), ("2.18", False)):
        pcm = subprocess.check_output([
            ffmpeg, "-v", "error", "-ss", time, "-i", str(output), "-t", "0.03",
            "-map", "0:a:0", "-ac", "1", "-f", "s16le", "-",
        ], timeout=10)
        peak = max(abs(sample) for (sample,) in struct.iter_unpack("<h", pcm))
        if middle:
            assert peak == pytest.approx(original_peak / 2, rel=0.22)
        else:
            assert peak < original_peak * 0.25
    assert client.put(base, json={"version": 5, "clips": [faded[1]]}).json()["version"] == 6
    assert client.get(f"{base}/sources/{blue['source_id']}").status_code == 404


def test_social_presets_framing_timed_title_and_captions(video_workspace, tmp_path):
    tools = renderer_tools()
    if not tools:
        pytest.skip("Requires FFmpeg and FFprobe.")
    ffmpeg, ffprobe = tools
    client = video_workspace
    base = "/api/v1/projects/1/video/sequence"
    source = tmp_path / "red.mp4"
    subprocess.run([
        ffmpeg, "-v", "error", "-f", "lavfi", "-i", "color=red:s=160x120:r=30:d=2",
        "-c:v", "libx264", "-threads", "2", str(source),
    ], check=True, timeout=15)
    for version in range(2):
        assert client.post(f"{base}/sources?version={version}", content=source.read_bytes(),
                           headers={"Content-Type": "video/mp4", "X-Video-Filename": f"red-{version}.mp4"}).status_code == 201
    first, second = client.get(base).json()["clips"]
    for invalid in ({"framing": "stretch"}, {"title_position": "center"}, {"title_duration_ms": -1},
                    {"caption": "a\nb"}, {"caption": "a" * 91}):
        assert client.put(base, json={"version": 2, "clips": [{**first, **invalid}, second]}).status_code == 422
    assert client.get(f"{base}/captions.srt?version=2").status_code == 422
    cuts = [{**first, "start_ms": 250, "end_ms": 1500},
            {**second, "framing": "fill", "title": "Zamara", "title_position": "top",
             "title_duration_ms": 500, "caption": "River & beacon <demo>", "end_ms": 1500}]
    saved = client.put(base, json={"version": 2, "clips": cuts})
    assert saved.status_code == 200, saved.text
    assert client.get(base).json()["clips"] == cuts
    assert client.get(f"{base}/captions.srt?version=2").status_code == 409
    client.cookies.set("indaverse_access_token", "2")
    assert client.get(f"{base}/captions.srt?version=3").status_code == 404
    client.cookies.set("indaverse_access_token", "1")
    srt = client.get(f"{base}/captions.srt?version=3")
    assert srt.status_code == 200, srt.text
    assert srt.headers["cache-control"] == "no-store"
    assert "indaverse-1-captions.srt" in srt.headers["content-disposition"]
    assert srt.text == "1\n00:00:01,250 --> 00:00:02,750\nRiver &amp; beacon &lt;demo&gt;\n"
    assert client.post(f"{base}/render?version=3&preset=large").status_code == 422

    output = tmp_path / "social.mp4"

    def render(preset, size, burn):
        response = client.post(f"{base}/render?version=3&preset={preset}&burn_captions={str(burn).lower()}")
        assert response.status_code == 200, response.text
        output.write_bytes(response.content)
        info = json.loads(subprocess.check_output([
            ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries",
            "stream=width,height:format=duration", "-of", "json", str(output),
        ], timeout=10))
        assert (info["streams"][0]["width"], info["streams"][0]["height"]) == size
        assert float(info["format"]["duration"]) == pytest.approx(2.75, abs=0.09)

    def pixels(time, crop):
        return subprocess.check_output([
            ffmpeg, "-v", "error", "-ss", time, "-i", str(output), "-frames:v", "1",
            "-vf", f"crop={crop}", "-pix_fmt", "rgb24", "-f", "rawvideo", "-",
        ], timeout=10)

    def white_count(time, crop):
        return sum(min(pixel) > 200 for pixel in struct.iter_unpack("BBB", pixels(time, crop)))

    render("square", (480, 480), False)
    assert white_count("2", "400:92:40:380") == 0
    render("vertical", (360, 640), True)
    assert max(pixels("0.5", "2:2:180:94")) < 15  # Fit letterboxes.
    assert pixels("2", "2:2:180:94")[0] > 200  # Fill crops and reaches the edge.
    assert white_count("1.5", "320:64:20:12") > 40
    assert white_count("2", "320:64:20:12") == 0  # Title ends at 1.75.
    assert white_count("0.6", "320:92:20:540") == 0
    assert white_count("2", "320:92:20:540") > 60


def test_soundtrack_renders_trim_offset_fades_and_mix(video_workspace, tmp_path):
    import math

    tools = renderer_tools()
    if not tools:
        pytest.skip("Requires FFmpeg and FFprobe.")
    ffmpeg, _ = tools
    client = video_workspace
    base = "/api/v1/projects/1/video/sequence"
    video, track, replacement = [tmp_path / name for name in ("clip.mp4", "score.wav", "replacement.mp3")]
    subprocess.run([
        ffmpeg, "-v", "error", "-f", "lavfi", "-i", "color=blue:s=160x120:r=30:d=3",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:a", "aac",
        "-c:v", "libx264", "-threads", "2", str(video),
    ], check=True, timeout=15)
    subprocess.run([
        ffmpeg, "-v", "error", "-f", "lavfi", "-i", "sine=frequency=700:duration=1",
        "-f", "lavfi", "-i", "sine=frequency=940:duration=2",
        "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1", str(track),
    ], check=True, timeout=15)
    subprocess.run([ffmpeg, "-v", "error", "-i", str(track), str(replacement)], check=True, timeout=15)

    def upload(path, version, media_type):
        return client.post(f"{base}/soundtrack?version={version}", content=path.read_bytes(),
                           headers={"Content-Type": media_type, "X-Audio-Filename": path.name})

    assert upload(track, 0, "audio/wav").status_code == 422
    assert client.post(f"{base}/sources?version=0", content=video.read_bytes(),
                       headers={"Content-Type": "video/mp4", "X-Video-Filename": "clip.mp4"}).status_code == 201
    assert upload(track, 0, "audio/wav").status_code == 409
    assert upload(track, 1, "audio/mpeg").status_code == 415
    bad = tmp_path / "bad.wav"
    bad.write_bytes(video.read_bytes())
    assert upload(bad, 1, "audio/wav").status_code == 422
    attached = upload(track, 1, "audio/wav")
    assert attached.status_code == 200, attached.text
    saved = attached.json()
    assert saved["soundtrack"]["name"] == "score.wav"
    assert saved["soundtrack"]["duration_ms"] == 3000
    assert "content" not in saved["soundtrack"]
    client.cookies.set("indaverse_access_token", "2")
    assert client.get(f"{base}/soundtrack?version=2").status_code == 404
    assert client.delete(f"{base}/soundtrack?version=2").status_code == 404
    assert upload(track, 2, "audio/wav").status_code == 404
    client.cookies.set("indaverse_access_token", "1")
    preview = client.get(f"{base}/soundtrack?version=2")
    assert preview.content == track.read_bytes()
    assert preview.headers["cache-control"] == "no-store"

    settings = {"start_ms": 1000, "end_ms": 2500, "offset_ms": 500, "volume_percent": 50,
                "fade_in_ms": 400, "fade_out_ms": 400, "mode": "mix"}
    for invalid in ({"end_ms": 3100}, {"fade_out_ms": 1600}, {"volume_percent": 101}, {"offset_ms": 30000}):
        assert client.put(base, json={"version": 2, "clips": saved["clips"],
                                      "soundtrack_settings": {**settings, **invalid}}).status_code == 422
    edited = client.put(base, json={"version": 2, "clips": [{**saved["clips"][0], "title": "Zamara"}],
                                   "soundtrack_settings": settings})
    assert edited.status_code == 200, edited.text
    assert edited.json()["version"] == 3
    assert client.get(base).json()["soundtrack"]["settings"] == settings
    assert client.put(base, json={"version": 3, "clips": edited.json()["clips"],
                                  "soundtrack_settings": settings}).json()["version"] == 3
    assert client.post(f"{base}/render?version=2").status_code == 409
    assert client.delete(f"{base}/soundtrack?version=2").status_code == 409
    assert upload(replacement, 2, "audio/mpeg").status_code == 409

    output = tmp_path / "mix.mp4"

    def render(version):
        result = client.post(f"{base}/render?version={version}")
        assert result.status_code == 200, result.text
        output.write_bytes(result.content)

    def tone(start, hz):
        pcm = subprocess.check_output([
            ffmpeg, "-v", "error", "-ss", str(start), "-i", str(output), "-t", "0.05",
            "-map", "0:a:0", "-ac", "1", "-ar", "8000", "-f", "s16le", "-",
        ], timeout=10)
        samples = [sample for (sample,) in struct.iter_unpack("<h", pcm)]
        assert len(samples) == 400
        return abs(sum(sample * complex(math.cos(i * hz * math.tau / 8000), math.sin(i * hz * math.tau / 8000))
                       for i, sample in enumerate(samples))) * 2 / len(samples)

    render(3)
    assert tone(.2, 440) > 1500 and tone(.2, 940) < 80
    assert tone(1.2, 440) > 1500 and tone(1.2, 940) > 1200
    assert tone(1.2, 700) < 120  # The first second of the soundtrack was trimmed.
    assert tone(.53, 940) < tone(1.2, 940) * .35
    assert tone(1.88, 940) < tone(1.2, 940) * .35
    assert tone(2.2, 940) < 80

    assert client.put(base, json={"version": 3, "clips": edited.json()["clips"],
                                  "soundtrack_settings": {**settings, "mode": "replace"}}).json()["version"] == 4
    render(4)
    assert tone(.2, 440) < 80 and tone(1.2, 440) < 80 and tone(1.2, 940) > 1200
    replaced = upload(replacement, 4, "audio/mpeg")
    assert replaced.status_code == 200, replaced.text
    assert replaced.json()["soundtrack"]["settings"]["mode"] == "mix"
    assert client.get(f"{base}/soundtrack?version=5").content == replacement.read_bytes()
    removed = client.delete(f"{base}/soundtrack?version=5")
    assert removed.json()["soundtrack"] is None and removed.json()["version"] == 6
    assert client.get(f"{base}/soundtrack?version=6").status_code == 404
    render(6)
    assert tone(1.2, 440) > 1500 and tone(1.2, 940) < 80


def test_timed_captions_survive_reordering_and_render_at_each_position(video_workspace, tmp_path):
    tools = renderer_tools()
    if not tools:
        pytest.skip("Requires FFmpeg and FFprobe.")
    ffmpeg, _ = tools
    client = video_workspace
    base = "/api/v1/projects/1/video/sequence"
    source = tmp_path / "source.mp4"
    subprocess.run([ffmpeg, "-v", "error", "-f", "lavfi", "-i", "color=blue:s=160x120:r=30:d=2",
                    "-c:v", "libx264", "-threads", "2", str(source)], check=True, timeout=15)
    for version in range(2):
        assert client.post(f"{base}/sources?version={version}", content=source.read_bytes(),
                           headers={"Content-Type": "video/mp4", "X-Video-Filename": "source.mp4"}).status_code == 201
    first, second = client.get(base).json()["clips"]
    first = {**first, "start_ms": 500, "end_ms": 1500}
    second = {**second, "end_ms": 800, "caption": "Intro"}
    lower = {"start_ms": 100, "end_ms": 350, "text": "One & two\nNext line"}
    upper = {"start_ms": 600, "end_ms": 900, "text": "Up <here>", "position": "top"}
    for clip in (
        {**first, "caption_cues": [lower, {**upper, "start_ms": 200}]},
        {**first, "caption_cues": [{**upper, "end_ms": 1100}]},
        {**first, "caption_cues": [{**lower, "end_ms": 150}]},
        {**first, "caption_cues": [{**lower, "text": "Bad\n\nline"}]},
        {**first, "caption_cues": [lower], "caption": "Both"},
        {**first, "caption_cues": [lower] * 7},
    ):
        assert client.put(base, json={"version": 2, "clips": [second, clip]}).status_code == 422
    saved = client.put(base, json={"version": 2, "clips": [second, {**first, "caption_cues": [upper, lower]}]})
    assert saved.status_code == 200, saved.text
    assert saved.json()["clips"][1]["caption_cues"] == [lower, upper]
    assert client.get(f"{base}/captions.vtt?version=2").status_code == 409
    client.cookies.set("indaverse_access_token", "2")
    assert client.get(f"{base}/captions.vtt?version=3").status_code == 404
    client.cookies.set("indaverse_access_token", "1")
    vtt = client.get(f"{base}/captions.vtt?version=3")
    assert vtt.headers["content-type"] == "text/vtt; charset=utf-8"
    assert vtt.headers["cache-control"] == "no-store"
    assert vtt.text == ("WEBVTT\n\n00:00:00.000 --> 00:00:00.800\nIntro\n\n"
                        "00:00:00.900 --> 00:00:01.150\nOne &amp; two\nNext line\n\n"
                        "00:00:01.400 --> 00:00:01.700 line:10%\nUp &lt;here&gt;\n")
    srt = client.get(f"{base}/captions.srt?version=3")
    assert "2\n00:00:00,900 --> 00:00:01,150\nOne &amp; two\nNext line" in srt.text
    assert "line:10%" not in srt.text
    mp4 = client.post(f"{base}/render?version=3&burn_captions=true")
    assert mp4.status_code == 200, mp4.text
    output = tmp_path / "captioned.mp4"
    output.write_bytes(mp4.content)
    for time, low, high in ((1.0, True, False), (1.25, False, False), (1.55, False, True)):
        for y, visible in ((255, low), (12, high)):
            pixels = subprocess.check_output([
                ffmpeg, "-v", "error", "-ss", str(time), "-i", str(output), "-frames:v", "1",
                "-vf", f"crop=480:90:80:{y}", "-pix_fmt", "rgb24", "-f", "rawvideo", "-",
            ], timeout=10)
            assert (sum(min(pixel) > 200 for pixel in struct.iter_unpack("BBB", pixels)) > 50) == visible

    for version in (3, 4):
        assert client.post(f"{base}/sources?version={version}", content=source.read_bytes(),
                           headers={"Content-Type": "video/mp4", "X-Video-Filename": "source.mp4"}).status_code == 201
    limits = [{**cut, "caption": "", "caption_cues": [
        {"start_ms": i * 100, "end_ms": (i + 1) * 100, "text": f"Cue {i + 1}"}
        for i in range(4)
    ]} for cut in client.get(base).json()["clips"]]
    over_limit = [{**limits[0], "caption_cues": [
        *limits[0]["caption_cues"], {"start_ms": 400, "end_ms": 500, "text": "Extra cue"}
    ]}, *limits[1:]]
    assert client.put(base, json={"version": 5, "clips": over_limit}).status_code == 422
    assert client.put(base, json={"version": 5, "clips": limits}).status_code == 200
    result = client.post(f"{base}/render?version=6&burn_captions=true")
    assert result.status_code == 200, result.text


def test_private_delivery_kit_matches_saved_render(video_workspace, tmp_path):
    from hashlib import sha256
    from io import BytesIO
    from zipfile import ZipFile

    from PIL import Image

    tools = renderer_tools()
    if not tools:
        pytest.skip("Requires FFmpeg and FFprobe.")
    ffmpeg, ffprobe = tools
    client = video_workspace
    base = "/api/v1/projects/1/video/sequence"
    for version, color in enumerate(("red", "blue")):
        source = tmp_path / f"{color}.mp4"
        subprocess.run([
            ffmpeg, "-v", "error", "-f", "lavfi", "-i", f"color={color}:s=160x120:r=30:d=1",
            "-c:v", "libx264", "-threads", "2", str(source),
        ], check=True, timeout=15)
        assert client.post(f"{base}/sources?version={version}", content=source.read_bytes(),
                           headers={"Content-Type": "video/mp4", "X-Video-Filename": f"{color}.mp4"}).status_code == 201
    red, blue = client.get(base).json()["clips"]
    saved = client.put(base, json={"version": 2, "clips": [
        {**red, "start_ms": 200}, {**blue, "caption": "Look & listen"},
    ]})
    assert saved.status_code == 200, saved.text
    assert client.post(f"{base}/delivery?version=2").status_code == 409
    assert client.post(f"{base}/delivery?version=3&poster_ms=1800").status_code == 422
    client.cookies.set("indaverse_access_token", "2")
    assert client.post(f"{base}/delivery?version=3").status_code == 404
    client.cookies.set("indaverse_access_token", "1")
    response = client.post(f"{base}/delivery?version=3&preset=vertical&poster_ms=1200&include_srt=false&burn_captions=true")
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-type"] == "application/zip"
    assert "indaverse-1-delivery.zip" in response.headers["content-disposition"]
    with ZipFile(BytesIO(response.content)) as kit:
        manifest = json.loads(kit.read("manifest.json"))
        assert set(kit.namelist()) == {"manifest.json", "video.mp4", "poster.jpg", "timeline.csv",
                                     "captions.vtt", "caption-transcript.txt", "publishing-checklist.txt"}
        assert manifest["schema_version"] == 1
        assert manifest["sequence_version"] == 3
        assert manifest["captions_burned_in"]
        assert manifest["planned_duration_ms"] == 1800 and manifest["poster_requested_ms"] == 1200
        assert set(manifest["files"]) == set(kit.namelist()) - {"manifest.json"}
        for name, info in manifest["files"].items():
            data = kit.read(name)
            assert info["sha256"] == sha256(data).hexdigest()
            assert info["bytes"] == len(data)
        poster = Image.open(BytesIO(kit.read("poster.jpg")))
        assert poster.format == "JPEG" and poster.size == (360, 640)
        red_value, _, blue_value = poster.getpixel((180, 320))
        assert blue_value > 200 and red_value < 40  # The chosen time is in the second clip.
        assert kit.read("timeline.csv").decode().splitlines()[1:] == [
            "1,200,1000,0,800,0", "2,0,1000,800,1800,1",
        ]
        assert b"[0.800 s]\nLook & listen" in kit.read("caption-transcript.txt")
        assert b"00:00:00.800 --> 00:00:01.800\nLook &amp; listen" in kit.read("captions.vtt")
        output = tmp_path / "delivery.mp4"
        output.write_bytes(kit.read("video.mp4"))
    metadata = json.loads(subprocess.check_output([
        ffprobe, "-v", "error", "-show_entries", "format=duration:stream=width,height",
        "-select_streams", "v:0", "-of", "json", str(output),
    ], timeout=10))
    assert metadata["streams"] == [{"width": 360, "height": 640}]
    assert float(metadata["format"]["duration"]) == pytest.approx(1.8, abs=.1)
    subprocess.run([ffmpeg, "-v", "error", "-xerror", "-i", str(output), "-f", "null", "-"], check=True, timeout=10)

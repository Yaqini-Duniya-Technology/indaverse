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
        assert (max(abs(sample) for (sample,) in struct.iter_unpack("<h", pcm)) > 100) == expected_tone
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
    assert client.put(base, json={"version": 4, "clips": [titled[1]]}).json()["version"] == 5
    assert client.get(f"{base}/sources/{blue['source_id']}").status_code == 404

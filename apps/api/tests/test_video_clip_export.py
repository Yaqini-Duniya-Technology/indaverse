import json
import subprocess

import pytest
from sqlalchemy.orm import Session

from app.api.v1.video_clip_export import render_slot
from app.core.config import settings
from app.models import Project
from app.services.clip_export import renderer_tools
from test_creative_workspace import workspace


@pytest.fixture
def video_workspace(workspace, monkeypatch):
    client, engine = workspace
    monkeypatch.setattr(settings, "video_clip_export_enabled", True)
    monkeypatch.setattr(settings, "app_env", "test")
    with Session(engine) as db:
        for pid in (1, 3):
            db.get(Project, pid).project_type = "video"
        db.commit()
    return client


def test_export_permission_and_request_limits(video_workspace, monkeypatch):
    client = video_workspace
    url = "/api/v1/projects/1/video/clip-export"
    assert client.get("/api/v1/projects/3/video/clip-export").status_code == 404
    assert client.post("/api/v1/projects/3/video/clip-export?start=0&end=1").status_code == 404
    assert client.get("/api/v1/projects/2/video/clip-export").status_code == 400
    monkeypatch.setattr(settings, "app_env", "production")
    assert client.get(url).json()["available"] is False
    assert client.post(url + "?start=0&end=1").status_code == 503
    monkeypatch.setattr(settings, "app_env", "test")
    monkeypatch.setattr("app.services.clip_export.renderer_tools", lambda: ("ffmpeg", "ffprobe"))
    assert client.post(url + "?start=0&end=31").status_code == 422
    assert client.post(url + "?start=0&end=1").status_code == 415
    headers = {"Content-Type": "video/mp4"}
    assert client.post(url + "?start=0&end=1", headers={**headers, "Content-Length": "33554433"}).status_code == 413
    monkeypatch.setattr("app.services.clip_export.MAX_BYTES", 8)
    assert client.post(url + "?start=0&end=1", headers={**headers, "Content-Length": "1"},
                       content=b"actual bytes exceed the cap").status_code == 413
    assert render_slot.acquire(blocking=False)
    try:
        assert client.post(url + "?start=0&end=1", headers=headers, content=b"mp4").status_code == 429
    finally:
        render_slot.release()
    client.cookies.clear()
    assert client.get(url).status_code == 401


def test_real_trim_returns_requested_frames_and_audio(video_workspace, tmp_path):
    tools = renderer_tools()
    if not tools:
        pytest.skip("Real export test needs FFmpeg and FFprobe")
    ffmpeg, ffprobe = tools
    source = tmp_path / "fixture.mp4"
    subprocess.run([
        ffmpeg, "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=160x120:r=30:d=3",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-vf",
        "drawbox=x=0:y=0:w=iw:h=ih:c=blue:t=fill:enable='gte(t,1)'",
        "-c:v", "libx264", "-threads", "2", "-c:a", "aac", str(source),
    ], check=True, timeout=15)
    client = video_workspace
    url = "/api/v1/projects/1/video/clip-export?start=1.25&end=2.5"
    headers = {"Content-Type": "video/mp4"}
    assert client.post(url, headers=headers, content=b"not a video").status_code == 422
    response = client.post(url, headers=headers, content=source.read_bytes())
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "video/mp4"
    assert response.headers["content-disposition"] == 'attachment; filename="indaverse-1-clip.mp4"'
    assert response.headers["cache-control"] == "no-store"
    output = tmp_path / "export.mp4"
    output.write_bytes(response.content)
    info = json.loads(subprocess.check_output([
        ffprobe, "-v", "error", "-show_entries", "format=duration:stream=codec_name",
        "-of", "json", str(output),
    ], timeout=10))
    assert float(info["format"]["duration"]) == pytest.approx(1.25, abs=0.08)
    assert {stream["codec_name"] for stream in info["streams"]} == {"h264", "aac"}
    pixels = subprocess.check_output([
        ffmpeg, "-v", "error", "-i", str(output), "-frames:v", "1",
        "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-",
    ], timeout=10)
    assert len(pixels) == 3 and pixels[2] > 200 and pixels[0] < 40
    subprocess.run([ffmpeg, "-v", "error", "-xerror", "-i", str(output), "-f", "null", "-"],
                   check=True, timeout=10)

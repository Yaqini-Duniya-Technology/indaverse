from sqlalchemy.orm import Session

from app.models import Project
from app.models.audio_asset import AudioAsset
from test_creative_workspace import workspace


def test_music_session_preserves_private_track_references_and_version(workspace):
    client, engine = workspace
    with Session(engine) as db:
        db.get(Project, 1).project_type = "music"
        db.get(Project, 3).project_type = "music"
        for asset_id, project_id in ((1, 1), (2, 3)):
            db.add(AudioAsset(id=asset_id, project_id=project_id, original_filename="demo.wav",
                              stored_filename=f"{asset_id}.wav", file_path=f"{asset_id}.wav",
                              mime_type="audio/wav", file_size=500))
        db.commit()
    url = "/api/v1/projects/1/music/session"
    assert client.get(url).json()["version"] == 0
    assert client.get("/api/v1/projects/3/music/session").status_code == 404
    region = {"start_ms": 200, "end_ms": 1200, "offset_ms": 300, "fade_in_ms": 200, "fade_out_ms": 300}
    track = {"asset_id": 1, "duration_ms": 1500, "volume": 65, "mute": False, "solo": True, "regions": [region]}
    lyric = {"name": "Intro", "text": "Welcome", "start_ms": 300, "end_ms": 1300}
    for bad in (
        {"tracks": [{**track, "asset_id": 2}], "lyrics": []},
        {"tracks": [{**track, "regions": [region, region]}], "lyrics": []},
        {"tracks": [{**track, "regions": [{**region, "fade_out_ms": 1000}]}], "lyrics": []},
        {"tracks": [track], "lyrics": [{**lyric, "end_ms": 1500}]},
    ):
        assert client.put(url, json={"version": 0, "data": bad}).status_code == 422
    payload = {"tracks": [track], "lyrics": [lyric]}
    saved = client.put(url, json={"version": 0, "data": payload})
    assert saved.status_code == 200, saved.text
    assert client.get(url).json() == {"version": 1, "data": payload}
    assert client.put(url, json={"version": 0, "data": payload}).status_code == 409
    assert client.put(url, json={"version": 1, "data": payload}).json()["version"] == 1


def test_saved_mix_renders_both_formats_and_transfers_privately(workspace, tmp_path, monkeypatch):
    import json
    import subprocess
    import wave
    from io import BytesIO

    import pytest

    from app.api.v1 import audio_assets
    from app.core.config import settings
    from app.services.clip_export import renderer_tools

    tools = renderer_tools()
    if not tools:
        pytest.skip("FFmpeg tools are required to exercise real export.")
    ffmpeg, ffprobe = tools
    client, engine = workspace
    monkeypatch.setattr(settings, "video_clip_export_enabled", True)
    monkeypatch.setattr(settings, "app_env", "test")
    monkeypatch.setattr(audio_assets, "UPLOAD_DIR", tmp_path / "audio")
    with Session(engine) as db:
        db.get(Project, 1).project_type = "music"
        for project_id in (2, 3):
            db.get(Project, project_id).project_type = "video"
        db.commit()
    source = tmp_path / "tone.wav"
    subprocess.run([ffmpeg, "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                    str(source)], check=True, timeout=15)
    asset = client.post("/api/v1/projects/1/audio", files={"file": ("tone.wav", source.read_bytes(), "audio/wav")})
    assert asset.status_code == 201, asset.text
    session_url = "/api/v1/projects/1/music/session"
    region = {"start_ms": 200, "end_ms": 1200, "offset_ms": 300, "fade_in_ms": 100, "fade_out_ms": 100}
    track = {"asset_id": asset.json()["id"], "duration_ms": 2000, "volume": 100,
             "mute": False, "solo": False, "regions": [region, {**region, "offset_ms": 1500}]}
    assert client.put(session_url, json={"version": 0, "data": {"tracks": [track], "lyrics": []}}).status_code == 200
    wav = client.post(f"{session_url}/mix/wav?version=1")
    assert wav.status_code == 200, wav.text[:100]
    assert wav.headers["cache-control"] == "no-store"
    with wave.open(BytesIO(wav.content), "rb") as decoded:
        assert decoded.getnchannels() == 2 and decoded.getframerate() == 44100
        assert decoded.getnframes() == 110250
        assert not any(decoded.readframes(10000))  # First 0.3 seconds are silent.
        decoded.setpos(30000)
        assert any(decoded.readframes(5000))
    mp3 = client.post(f"{session_url}/mix/mp3?version=1")
    assert mp3.status_code == 200 and mp3.headers["content-type"] == "audio/mpeg"
    output = tmp_path / "mix.mp3"
    output.write_bytes(mp3.content)
    meta = json.loads(subprocess.check_output([ffprobe, "-v", "error", "-show_streams", "-of", "json", str(output)], timeout=10))
    assert meta["streams"][0]["codec_name"] == "mp3"
    assert client.post(f"{session_url}/mix/wav?version=2").status_code == 409
    video = tmp_path / "video.mp4"
    subprocess.run([ffmpeg, "-v", "error", "-f", "lavfi", "-i", "color=blue:s=160x120:r=30:d=1",
                    "-c:v", "libx264", "-threads", "2", str(video)], check=True, timeout=15)
    seq = "/api/v1/projects/2/video/sequence"
    assert client.post(f"{seq}/sources?version=0", content=video.read_bytes(),
                       headers={"Content-Type": "video/mp4", "X-Video-Filename": "blue.mp4"}).status_code == 201
    transfer = {"version": 1, "destination_id": 2, "destination_version": 1, "start_ms": 300, "end_ms": 1100}
    assert client.post(f"{session_url}/send-to-video", json={**transfer, "destination_id": 3}).status_code == 404
    sent = client.post(f"{session_url}/send-to-video", json=transfer)
    assert sent.status_code == 200, sent.text
    assert sent.json()["soundtrack"]["duration_ms"] == 800
    assert client.post(f"{session_url}/send-to-video", json=transfer).status_code == 409
    assert client.post(f"{seq}/render?version=2").status_code == 200

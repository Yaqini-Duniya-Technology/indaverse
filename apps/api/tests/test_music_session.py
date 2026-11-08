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

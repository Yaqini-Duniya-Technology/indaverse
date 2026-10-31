"""Video Studio checks using the isolated API fixture."""

import pytest
from sqlalchemy.orm import Session

from test_refinement_tasks import api
from app.models.project import Project


@pytest.fixture
def video_api(api):
    client, engine = api
    with Session(engine) as db:
        db.get(Project, 1).project_type = "video"
        db.get(Project, 2).project_type = "video"
        db.commit()
    return client, engine


def url(project_id=1):
    return f"/api/v1/projects/{project_id}/video"


def draft(**changes):
    data = {
        "expected_version": 0,
        "title": "The dawn",
        "script": "The sun rises over the village.",
        "aspect_ratio": "16:9",
        "shots": [
            {"id": "shot-1", "title": "Sunrise", "description": "Golden morning",
             "camera_direction": "Slow pan", "duration_seconds": 5, "image_id": None},
            {"id": "shot-2", "title": "Arrival", "description": "",
             "camera_direction": "", "duration_seconds": 8, "image_id": None},
        ],
    }
    data.update(changes)
    return data


def test_create_reload_reorder_and_noop(video_api):
    client, _ = video_api
    assert client.get(url()).status_code == 404
    first = client.put(url(), json=draft())
    assert first.status_code == 200, first.text
    assert first.json()["version"] == 1
    assert client.get(url()).json()["script"] == draft()["script"]

    shots = list(reversed(draft()["shots"]))
    changed = client.put(url(), json=draft(expected_version=1, shots=shots))
    assert changed.status_code == 200, changed.text
    assert changed.json()["version"] == 2
    assert changed.json()["shots"] == shots
    noop = client.put(url(), json=draft(expected_version=2, shots=shots))
    assert noop.status_code == 200, noop.text
    assert noop.json()["version"] == 2


def test_stale_saves_preserve_current_draft(video_api):
    client, _ = video_api
    assert client.put(url(), json=draft()).status_code == 200
    assert client.put(url(), json=draft(title="Repeated creation")).status_code == 409
    assert client.put(url(), json=draft(expected_version=1, title="Latest")).status_code == 200
    assert client.put(url(), json=draft(expected_version=1, title="Stale")).status_code == 409
    assert client.get(url()).json()["title"] == "Latest"


def test_ownership_and_authentication(video_api):
    client, _ = video_api
    assert client.put(url(), json=draft()).status_code == 200
    client.cookies.set("indaverse_access_token", "other")
    assert client.get(url()).status_code == 404
    assert client.put(url(), json=draft()).status_code == 404
    client.cookies.clear()
    assert client.get(url()).status_code == 401
    assert client.put(url(), json=draft()).status_code == 401


def test_wrong_project_type(api):
    client, _ = api
    assert client.get(url()).status_code == 400
    assert client.put(url(), json=draft()).status_code == 400


def test_missing_image_does_not_create_video(video_api):
    client, _ = video_api
    shots = draft()["shots"]
    shots[0]["image_id"] = 999999
    result = client.put(url(), json=draft(shots=shots))
    assert result.status_code == 400, result.text
    assert client.get(url()).status_code == 404


@pytest.mark.parametrize("changes", [
    {"title": "   "},
    {"expected_version": True},
    {"aspect_ratio": "invalid"},
    {"shots": [{"id": "same", "title": "One"}, {"id": "same", "title": "Two"}]},
    {"shots": [{"id": "one", "title": " "}]},
    {"shots": [{"id": "one", "title": "One", "duration_seconds": 0}]},
    {"shots": [{"id": "one", "title": "One", "duration_seconds": True}]},
    {"script": "a" * 100001},
])
def test_invalid_draft_is_not_saved(video_api, changes):
    client, _ = video_api
    result = client.put(url(), json=draft(**changes))
    assert result.status_code == 422, result.text
    assert client.get(url()).status_code == 404

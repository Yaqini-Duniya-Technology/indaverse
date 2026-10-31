import pytest
from sqlalchemy.orm import Session

from test_refinement_tasks import api
from test_story_projects import story_api, draft, url as story_url
from app.models.image_asset import ImageAsset


def url():
    return "/api/v1/projects/1/story/scenes"


def payload(version=0, **changes):
    scene = {
        "id": "arrival", "title": "Arrival", "setting": "Village",
        "summary": "Amina returns home.", "chapter_id": None,
        "character_ids": [], "image_id": None,
    }
    scene.update(changes)
    return {"expected_version": version, "scenes": [scene]}


def test_save_reload_noop_conflict_and_remove(story_api):
    client, _ = story_api
    assert client.get(url()).json()["version"] == 0
    result = client.put(url(), json=payload())
    assert result.status_code == 200, result.text
    assert result.json()["version"] == 1
    assert client.put(url(), json=payload(1)).json()["version"] == 1
    assert client.put(url(), json=payload(1, title="Newer")).json()["version"] == 2
    assert client.put(url(), json=payload(1, title="Stale")).status_code == 409
    assert client.get(url()).json()["scenes"][0]["title"] == "Newer"
    removed = client.put(url(), json={"expected_version": 2, "scenes": []})
    assert removed.status_code == 200
    assert removed.json()["version"] == 3


def test_links_are_project_scoped_and_invalid_save_is_atomic(story_api):
    client, engine = story_api
    assert client.put(story_url(), json=draft()).status_code == 200
    cast_url = story_url() + "/characters"
    assert client.put(cast_url, json={
        "expected_version": 0,
        "characters": [{"id": "amina", "name": "Amina"}],
    }).status_code == 200
    with Session(engine) as db:
        for project_id in (1, 2):
            db.add(ImageAsset(
                id=project_id, project_id=project_id,
                label="Scene", category="scene",
                stored_filename=f"scene-{project_id}.webp",
                mime_type="image/webp", file_size=10, width=1, height=1,
            ))
        db.commit()

    story_before = client.get(story_url()).json()
    cast_before = client.get(cast_url).json()
    valid = payload(chapter_id="chapter-1", character_ids=["amina"], image_id=1)
    assert client.put(url(), json=valid).status_code == 200
    before = client.get(url()).json()
    for changes in (
        {"chapter_id": "missing"},
        {"character_ids": ["missing"]},
        {"image_id": 2},
        {"image_id": 999},
    ):
        result = client.put(url(), json=payload(1, **changes))
        assert result.status_code == 400, result.text
        assert client.get(url()).json() == before
    assert client.get(story_url()).json() == story_before
    assert client.get(cast_url).json() == cast_before

    assert client.put(cast_url, json={
        "expected_version": 1, "characters": [],
    }).status_code == 200
    valid["expected_version"] = 1
    assert client.put(url(), json=valid).status_code == 400
    assert client.get(url()).json() == before


def test_ownership_and_authentication(story_api):
    client, _ = story_api
    assert client.put(url(), json=payload()).status_code == 200
    client.cookies.set("indaverse_access_token", "other")
    assert client.get(url()).status_code == 404
    assert client.put(url(), json=payload(1)).status_code == 404
    client.cookies.clear()
    assert client.get(url()).status_code == 401
    assert client.put(url(), json=payload()).status_code == 401


def test_non_story_project(api):
    client, _ = api
    assert client.get(url()).status_code == 400
    assert client.put(url(), json=payload()).status_code == 400


@pytest.mark.parametrize("changes", [
    {"title": "   "},
    {"character_ids": ["same", "same"]},
    {"image_id": True},
    {"summary": "x" * 10001},
])
def test_validation_preserves_empty_state(story_api, changes):
    client, _ = story_api
    result = client.put(url(), json=payload(**changes))
    assert result.status_code == 422, result.text
    assert client.get(url()).json()["version"] == 0

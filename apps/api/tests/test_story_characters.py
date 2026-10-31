import pytest
from sqlalchemy.orm import Session

from test_refinement_tasks import api
from test_story_projects import story_api, draft, url as story_url
from app.models.image_asset import ImageAsset


def url(project_id=1):
    return f"/api/v1/projects/{project_id}/story/characters"


def payload(version=0, **changes):
    character = {
        "id": "amina", "name": "Amina", "role": "Lead",
        "description": "A determined traveller.", "portrait_image_id": None,
    }
    character.update(changes)
    return {"expected_version": version, "characters": [character]}


def test_character_save_reload_noop_conflict_and_remove(story_api):
    client, _ = story_api
    initial = client.get(url())
    assert initial.status_code == 200
    assert initial.json()["version"] == 0
    assert initial.json()["characters"] == []

    first = client.put(url(), json=payload())
    assert first.status_code == 200, first.text
    assert first.json()["version"] == 1
    assert client.put(url(), json=payload(1)).json()["version"] == 1

    newer = client.put(url(), json=payload(1, description="Newer description"))
    assert newer.status_code == 200, newer.text
    assert newer.json()["version"] == 2
    assert client.put(url(), json=payload(1, name="Stale")).status_code == 409
    assert client.get(url()).json()["characters"][0]["description"] == "Newer description"

    removed = client.put(url(), json={"expected_version": 2, "characters": []})
    assert removed.status_code == 200, removed.text
    assert removed.json()["version"] == 3
    assert removed.json()["characters"] == []


def test_characters_do_not_change_story_or_its_version(story_api):
    client, _ = story_api
    assert client.put(story_url(), json=draft()).status_code == 200
    before = client.get(story_url()).json()
    assert client.put(url(), json=payload()).status_code == 200
    assert client.get(story_url()).json() == before


def test_portrait_ownership_and_invalid_update_are_atomic(story_api):
    client, engine = story_api
    with Session(engine) as db:
        for project_id in (1, 2):
            db.add(ImageAsset(
                id=project_id, project_id=project_id,
                label="Portrait", category="character",
                stored_filename=f"test-{project_id}.webp",
                mime_type="image/webp", file_size=10, width=1, height=1,
            ))
        db.commit()

    assert client.put(url(), json=payload(portrait_image_id=1)).status_code == 200
    before = client.get(url()).json()
    for image_id in (2, 999):
        result = client.put(url(), json=payload(1, portrait_image_id=image_id))
        assert result.status_code == 400, result.text
        assert client.get(url()).json() == before


def test_character_authentication_and_project_ownership(story_api):
    client, _ = story_api
    assert client.put(url(), json=payload()).status_code == 200
    client.cookies.set("indaverse_access_token", "other")
    assert client.get(url()).status_code == 404
    assert client.put(url(), json=payload(1)).status_code == 404
    client.cookies.clear()
    assert client.get(url()).status_code == 401
    assert client.put(url(), json=payload()).status_code == 401


def test_characters_reject_non_story_project(api):
    client, _ = api
    assert client.get(url()).status_code == 400
    assert client.put(url(), json=payload()).status_code == 400


@pytest.mark.parametrize("characters", [
    [{"id": "a", "name": " "}],
    [{"id": "same", "name": "One"}, {"id": "same", "name": "Two"}],
    [{"id": "a", "name": "A", "portrait_image_id": True}],
    [{"id": "a", "name": "A", "description": "x" * 10001}],
])
def test_invalid_characters_do_not_create_profiles(story_api, characters):
    client, _ = story_api
    result = client.put(url(), json={"expected_version": 0, "characters": characters})
    assert result.status_code == 422, result.text
    assert client.get(url()).json()["version"] == 0

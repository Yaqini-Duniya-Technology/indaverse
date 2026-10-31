"""Story API checks using the existing isolated database fixture."""

import pytest
from sqlalchemy.orm import Session

from test_refinement_tasks import api
from app.models.project import Project


@pytest.fixture
def story_api(api):
    client, engine = api
    with Session(engine) as db:
        db.get(Project, 1).project_type = "story"
        db.get(Project, 2).project_type = "story"
        db.commit()
    return client, engine


def url(project_id=1):
    return f"/api/v1/projects/{project_id}/story"


def draft(**changes):
    data = {
        "expected_version": 0,
        "title": "First story",
        "synopsis": "A journey home.",
        "genre": "Adventure",
        "chapters": [
            {"id": "chapter-1", "title": "Arrival", "content": "The journey began."},
            {"id": "chapter-2", "title": "Discovery", "content": ""},
        ],
    }
    data.update(changes)
    return data


def test_story_create_reload_update_reorder_and_noop(story_api):
    client, _ = story_api
    assert client.get(url()).status_code == 404
    first = client.put(url(), json=draft())
    assert first.status_code == 200, first.text
    assert first.json()["version"] == 1
    assert client.get(url()).json()["chapters"] == draft()["chapters"]

    reordered = list(reversed(draft()["chapters"]))
    changed = client.put(url(), json=draft(expected_version=1, chapters=reordered))
    assert changed.status_code == 200, changed.text
    assert changed.json()["version"] == 2
    assert changed.json()["chapters"] == reordered
    noop = client.put(url(), json=draft(expected_version=2, chapters=reordered))
    assert noop.status_code == 200, noop.text
    assert noop.json()["version"] == 2


def test_stale_save_and_repeated_creation_preserve_newer_story(story_api):
    client, _ = story_api
    assert client.put(url(), json=draft()).status_code == 200
    assert client.put(url(), json=draft(title="Old creation")).status_code == 409
    assert client.put(url(), json=draft(expected_version=1, title="Newer title")).status_code == 200
    stale = client.put(url(), json=draft(expected_version=1, title="Stale title"))
    assert stale.status_code == 409
    assert client.get(url()).json()["title"] == "Newer title"


def test_story_ownership_and_authentication(story_api):
    client, _ = story_api
    assert client.put(url(), json=draft()).status_code == 200
    client.cookies.set("indaverse_access_token", "other")
    assert client.get(url()).status_code == 404
    assert client.put(url(), json=draft(expected_version=1)).status_code == 404
    client.cookies.clear()
    assert client.get(url()).status_code == 401
    assert client.put(url(), json=draft()).status_code == 401


def test_story_rejects_non_story_projects(api):
    client, _ = api
    assert client.get(url()).status_code == 400
    assert client.put(url(), json=draft()).status_code == 400


@pytest.mark.parametrize("changes", [
    {"title": "   "},
    {"expected_version": True},
    {"chapters": [
        {"id": "same", "title": "One"},
        {"id": "same", "title": "Two"},
    ]},
    {"chapters": [{"id": "one", "title": " "}]},
    {"chapters": [{"id": "one", "title": "One", "content": "a" * 100001}]},
])
def test_invalid_story_does_not_create_draft(story_api, changes):
    client, _ = story_api
    result = client.put(url(), json=draft(**changes))
    assert result.status_code == 422, result.text
    assert client.get(url()).status_code == 404

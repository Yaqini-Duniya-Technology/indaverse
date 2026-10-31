"""Game blueprint checks using the isolated API database fixture."""

import pytest
from sqlalchemy.orm import Session

from test_refinement_tasks import api
from app.models.project import Project
from app.api.v1.game_projects import router


@pytest.fixture
def game_api(api):
    client, engine = api
    if "/api/v1/projects/{project_id}/game" not in client.app.openapi()["paths"]:
        client.app.include_router(router, prefix="/api/v1")
        client.app.openapi_schema = None
    with Session(engine) as db:
        db.get(Project, 1).project_type = "game"
        db.get(Project, 2).project_type = "game"
        db.commit()
    return client, engine


def url(project_id=1):
    return f"/api/v1/projects/{project_id}/game"


def blueprint(**changes):
    values = {
        "expected_version": 0,
        "title": "River explorer",
        "dimension": "2d",
        "genre": "Adventure",
        "concept": "Explore a river community.",
        "core_loop": "Explore, collect supplies, and unlock routes.",
        "controls": "Arrow keys to move.",
        "characters": [
            {"id": "player", "name": "Explorer", "role": "player", "description": "A curious traveller."},
        ],
        "levels": [
            {"id": "village", "title": "Village", "setting": "Riverside", "objective": "Find supplies", "challenges": "Blocked paths"},
            {"id": "river", "title": "River", "setting": "Open water", "objective": "Reach the island", "challenges": "Strong currents"},
        ],
        "assets": [
            {"id": "boat", "title": "Boat", "kind": "sprite", "description": "A wooden boat."},
        ],
    }
    values.update(changes)
    for collection in ("characters", "levels"):
        for item in values[collection]:
            item.setdefault("image_id", None)
    return values


def test_create_reload_reorder_update_and_noop(game_api):
    client, _ = game_api
    assert client.get(url()).status_code == 404
    first = client.put(url(), json=blueprint())
    assert first.status_code == 200, first.text
    assert first.json()["version"] == 1
    assert client.get(url()).json()["levels"] == blueprint()["levels"]

    levels = list(reversed(blueprint()["levels"]))
    updated = client.put(url(), json=blueprint(expected_version=1, levels=levels))
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == 2
    assert updated.json()["levels"] == levels

    noop = client.put(url(), json=blueprint(expected_version=2, levels=levels))
    assert noop.status_code == 200, noop.text
    assert noop.json()["version"] == 2


def test_stale_save_and_repeated_creation_preserve_latest(game_api):
    client, _ = game_api
    assert client.put(url(), json=blueprint()).status_code == 200
    assert client.put(url(), json=blueprint(title="Repeated creation")).status_code == 409
    assert client.put(
        url(), json=blueprint(expected_version=1, title="Latest game"),
    ).status_code == 200
    assert client.put(
        url(), json=blueprint(expected_version=1, title="Stale game"),
    ).status_code == 409
    saved = client.get(url()).json()
    assert saved["title"] == "Latest game"
    assert saved["version"] == 2


def test_ownership_authentication_and_3d_save(game_api):
    client, _ = game_api
    assert client.put(url(), json=blueprint()).status_code == 200
    assert client.get(url(2)).status_code == 404
    assert client.put(url(2), json=blueprint()).status_code == 404

    client.cookies.set("indaverse_access_token", "other")
    assert client.get(url()).status_code == 404
    assert client.put(url(), json=blueprint(expected_version=1)).status_code == 404
    result = client.put(url(2), json=blueprint(
        dimension="3d",
        assets=[{"id": "boat", "title": "Boat model", "kind": "model", "description": ""}],
    ))
    assert result.status_code == 200, result.text
    assert result.json()["dimension"] == "3d"
    assert client.get(url(2)).json()["assets"][0]["kind"] == "model"

    client.cookies.clear()
    assert client.get(url()).status_code == 401
    assert client.put(url(), json=blueprint()).status_code == 401


def test_rejects_non_game_projects(game_api):
    client, engine = game_api
    with Session(engine) as db:
        db.get(Project, 1).project_type = "story"
        db.commit()
    assert client.get(url()).status_code == 400
    assert client.put(url(), json=blueprint()).status_code == 400


@pytest.mark.parametrize("changes", [
    {"title": " "},
    {"expected_version": True},
    {"dimension": "4d"},
    {"characters": [{"id": "one", "name": " "}]},
    {"characters": [{"id": "one", "name": "One", "role": "unknown"}]},
    {"characters": [{"id": "same", "name": "One"}, {"id": "same", "name": "Two"}]},
    {"levels": [{"id": "one", "title": " "}]},
    {"levels": [{"id": "same", "title": "One"}, {"id": "same", "title": "Two"}]},
    {"assets": [{"id": "one", "title": " "}]},
    {"assets": [{"id": "one", "title": "One", "kind": "unknown"}]},
    {"assets": [{"id": "same", "title": "One"}, {"id": "same", "title": "Two"}]},
    {"concept": "a" * 10001},
    {"unexpected": "field"},
])
def test_invalid_input_does_not_create_game(game_api, changes):
    client, _ = game_api
    result = client.put(url(), json=blueprint(**changes))
    assert result.status_code == 422, result.text
    assert client.get(url()).status_code == 404


def test_invalid_update_preserves_saved_game(game_api):
    client, _ = game_api
    assert client.put(url(), json=blueprint()).status_code == 200
    result = client.put(url(), json=blueprint(expected_version=1, dimension="invalid"))
    assert result.status_code == 422
    saved = client.get(url()).json()
    assert saved["dimension"] == "2d"
    assert saved["version"] == 1


def test_total_content_limit(game_api):
    client, _ = game_api
    levels = [
        {
            "id": f"level-{index}", "title": f"Level {index}",
            "setting": "a" * 5000, "objective": "b" * 5000,
            "challenges": "c" * 5000,
        }
        for index in range(34)
    ]
    result = client.put(url(), json=blueprint(levels=levels))
    assert result.status_code == 422, result.text
    assert client.get(url()).status_code == 404

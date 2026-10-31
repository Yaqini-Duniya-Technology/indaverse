"""Isolated API regression tests for playable level settings."""

from copy import deepcopy

import pytest

from test_game_projects import api, game_api, blueprint, url
from app.api.v1.game_play_settings import router


def settings_url(project_id=1):
    return f"{url(project_id)}/play-settings"


def layout():
    return {
        "spawn": {"x": 35, "y": 336},
        "exit": {"x": 742, "y": 320},
        "platforms": [
            {"id": "ground", "x": 0, "y": 370, "w": 800, "h": 30},
            {"id": "ledge", "x": 150, "y": 290, "w": 130, "h": 16},
        ],
        "collectibles": [
            {"id": "gem-1", "x": 210, "y": 262},
            {"id": "gem-2", "x": 410, "y": 340},
        ],
    }


@pytest.fixture
def play_api(game_api):
    client, engine = game_api
    if settings_url().replace("/1/", "/{project_id}/") not in client.app.openapi()["paths"]:
        client.app.include_router(router, prefix="/api/v1")
        client.app.openapi_schema = None
    assert client.put(url(), json=blueprint()).status_code == 200
    return client, engine


def save(client, version=0, values=None, project_id=1):
    return client.put(settings_url(project_id), json={
        "expected_version": version,
        "layout": values if values is not None else layout(),
    })


def test_create_reload_update_and_noop(play_api):
    client, _ = play_api
    assert client.get(settings_url()).status_code == 404
    first = save(client)
    assert first.status_code == 200, first.text
    assert first.json()["version"] == 1
    assert client.get(settings_url()).json()["layout"] == layout()

    changed = layout()
    changed["collectibles"][1]["x"] = 450
    result = save(client, 1, changed)
    assert result.status_code == 200, result.text
    assert result.json()["version"] == 2
    assert client.get(settings_url()).json()["layout"] == changed
    assert save(client, 2, changed).json()["version"] == 2
    # Play settings have their own version; the design remains unchanged.
    assert client.get(url()).json()["version"] == 1


def test_stale_save_preserves_latest(play_api):
    client, _ = play_api
    assert save(client).status_code == 200
    changed = layout()
    changed["spawn"]["x"] = 60
    assert save(client, 1, changed).status_code == 200
    assert save(client, 1).status_code == 409
    assert save(client, 0).status_code == 409
    assert client.get(settings_url()).json()["layout"] == changed


def test_ownership_and_authentication(play_api):
    client, _ = play_api
    assert save(client).status_code == 200
    assert client.get(settings_url(2)).status_code == 404
    assert save(client, project_id=2).status_code == 404

    client.cookies.set("indaverse_access_token", "other")
    assert client.get(settings_url()).status_code == 404
    assert save(client, 1).status_code == 404
    assert client.put(url(2), json=blueprint()).status_code == 200
    assert save(client, project_id=2).status_code == 200

    client.cookies.clear()
    assert client.get(settings_url()).status_code == 401
    assert save(client).status_code == 401


def test_missing_blueprint_and_non_game_project(game_api):
    client, _ = game_api
    client.app.include_router(router, prefix="/api/v1")
    assert client.get(settings_url()).status_code == 400
    assert save(client).status_code == 400

    from sqlalchemy.orm import Session
    from app.models.project import Project
    with Session(game_api[1]) as db:
        db.get(Project, 1).project_type = "music"
        db.commit()
    assert client.get(settings_url()).status_code == 400
    assert save(client).status_code == 400


def test_3d_rejected_and_existing_settings_retained(play_api):
    client, _ = play_api
    assert save(client).status_code == 200
    assert client.put(url(), json=blueprint(expected_version=1, dimension="3d")).status_code == 200
    assert client.get(settings_url()).status_code == 400
    assert save(client, 1).status_code == 400
    assert client.put(url(), json=blueprint(expected_version=2, dimension="2d")).status_code == 200
    saved = client.get(settings_url()).json()
    assert saved["version"] == 1
    assert saved["layout"] == layout()


@pytest.mark.parametrize("case", [
    "spawn_bounds", "exit_bounds", "platform_bounds", "spawn_overlap",
    "exit_overlap", "collectible_overlap", "duplicate_platform",
    "duplicate_collectible", "duplicate_position", "empty_platforms",
    "empty_collectibles", "boolean_coordinate", "unknown_field",
])
def test_invalid_layout_preserves_saved_settings(play_api, case):
    client, _ = play_api
    assert save(client).status_code == 200
    bad = deepcopy(layout())
    if case == "spawn_bounds":
        bad["spawn"]["x"] = 777
    elif case == "exit_bounds":
        bad["exit"]["y"] = 351
    elif case == "platform_bounds":
        bad["platforms"][1]["x"] = 799
    elif case == "spawn_overlap":
        bad["spawn"]["y"] = 350
    elif case == "exit_overlap":
        bad["exit"]["y"] = 340
    elif case == "collectible_overlap":
        bad["collectibles"][0]["y"] = 295
    elif case == "duplicate_platform":
        bad["platforms"][1]["id"] = "ground"
    elif case == "duplicate_collectible":
        bad["collectibles"][1]["id"] = "gem-1"
    elif case == "duplicate_position":
        bad["collectibles"][1].update(x=210, y=262)
    elif case == "empty_platforms":
        bad["platforms"] = []
    elif case == "empty_collectibles":
        bad["collectibles"] = []
    elif case == "boolean_coordinate":
        bad["spawn"]["x"] = True
    else:
        bad["unexpected"] = "field"

    result = save(client, 1, bad)
    assert result.status_code == 422, result.text
    saved = client.get(settings_url()).json()
    assert saved["version"] == 1
    assert saved["layout"] == layout()


def test_invalid_version_does_not_create_settings(play_api):
    client, _ = play_api
    result = save(client, True)
    assert result.status_code == 422
    assert client.get(settings_url()).status_code == 404

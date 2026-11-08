"""Saved 3D scene API regression tests using the isolated database."""

from copy import deepcopy

import pytest
from sqlalchemy.orm import Session

from test_refinement_tasks import api
from app.api.v1.game_scenes import router
from app.models.game_project import GameProject
from app.models.game_scene import GameScene
from app.models.project import Project


@pytest.fixture
def scene_api(api):
    client, engine = api
    GameScene.__table__.create(engine, checkfirst=True)

    route = "/api/v1/projects/{project_id}/game/scene"
    if route not in client.app.openapi()["paths"]:
        client.app.include_router(router, prefix="/api/v1")
        client.app.openapi_schema = None

    with Session(engine) as db:
        for project_id in (1, 2):
            db.get(Project, project_id).project_type = "game"
            game = db.get(GameProject, project_id)
            if game is None:
                db.add(GameProject(
                    project_id=project_id,
                    title="Scene test",
                    dimension="3d",
                    genre="Adventure",
                    concept="Explore the islands.",
                    core_loop="Collect gems and reach the exit.",
                    controls="WASD and Space",
                    characters=[],
                    levels=[],
                    assets=[],
                    version=1,
                ))
            else:
                game.dimension = "3d"
        db.commit()

    return client, engine


def url(project_id=1):
    return f"/api/v1/projects/{project_id}/game/scene"


def layout():
    return {
        "spawn": {"x": 0, "y": 0, "z": 7},
        "exit": {"x": 0, "y": 0, "z": -15},
        "platforms": [
            {"id": "first", "x": 0, "z": 5, "w": 12, "d": 8, "top": 0},
            {"id": "middle", "x": 0, "z": -4, "w": 12, "d": 8, "top": 0},
            {"id": "last", "x": 0, "z": -13, "w": 12, "d": 8, "top": 0},
            {"id": "raised", "x": 2, "z": -4, "w": 3, "d": 3, "top": 0.8},
        ],
        "collectibles": [
            {"id": "gem-1", "x": -3, "y": 0.8, "z": 4},
            {"id": "gem-2", "x": 2, "y": 1.65, "z": -4},
            {"id": "gem-3", "x": 0, "y": 0.8, "z": -13},
        ],
    }


def payload(version=0, scene=None):
    return {
        "expected_version": version,
        "layout": layout() if scene is None else scene,
    }


def test_create_reload_update_and_noop(scene_api):
    client, _ = scene_api
    assert client.get(url()).status_code == 404

    created = client.put(url(), json=payload())
    assert created.status_code == 200, created.text
    assert created.json()["version"] == 1
    assert client.get(url()).json()["layout"] == layout()

    changed = layout()
    changed["collectibles"][0]["x"] = -2
    saved = client.put(url(), json=payload(1, changed))
    assert saved.status_code == 200, saved.text
    assert saved.json()["version"] == 2
    assert saved.json()["layout"] == changed

    noop = client.put(url(), json=payload(2, changed))
    assert noop.status_code == 200, noop.text
    assert noop.json()["version"] == 2
    assert noop.json()["updated_at"] == saved.json()["updated_at"]


def test_stale_updates_and_repeated_creation_preserve_latest(scene_api):
    client, _ = scene_api
    assert client.put(url(), json=payload()).status_code == 200
    assert client.put(url(), json=payload()).status_code == 409

    changed = layout()
    changed["spawn"]["x"] = 1
    assert client.put(url(), json=payload(1, changed)).status_code == 200

    stale = client.put(url(), json=payload(1))
    assert stale.status_code == 409
    saved = client.get(url()).json()
    assert saved["version"] == 2
    assert saved["layout"] == changed


def test_ownership_and_authentication(scene_api):
    client, _ = scene_api
    assert client.put(url(), json=payload()).status_code == 200
    assert client.get(url(2)).status_code == 404
    assert client.put(url(2), json=payload()).status_code == 404

    client.cookies.set("indaverse_access_token", "other")
    assert client.get(url()).status_code == 404
    assert client.put(url(), json=payload(1)).status_code == 404
    assert client.put(url(2), json=payload()).status_code == 200

    client.cookies.clear()
    assert client.get(url()).status_code == 401
    assert client.put(url(), json=payload(1)).status_code == 401


@pytest.mark.parametrize("mode", ["missing", "2d", "wrong_type"])
def test_requires_saved_3d_game(scene_api, mode):
    client, engine = scene_api
    with Session(engine) as db:
        game = db.get(GameProject, 1)
        if mode == "missing":
            db.delete(game)
        elif mode == "2d":
            game.dimension = "2d"
        else:
            db.get(Project, 1).project_type = "story"
        db.commit()

    expected = 400
    assert client.get(url()).status_code == expected
    assert client.put(url(), json=payload()).status_code == expected


def invalid_scene(case):
    scene = deepcopy(layout())
    if case == "unsupported_spawn":
        scene["spawn"]["x"] = 40
    elif case == "unsupported_exit":
        scene["exit"]["y"] = 5
    elif case == "duplicate_platform_id":
        scene["platforms"][1]["id"] = scene["platforms"][0]["id"]
    elif case == "duplicate_gem_id":
        scene["collectibles"][1]["id"] = scene["collectibles"][0]["id"]
    elif case == "duplicate_gem_position":
        scene["collectibles"][1].update(x=-3, y=0.8, z=4)
    elif case == "platform_outside_world":
        scene["platforms"][0]["x"] = 49
    elif case == "gem_inside_platform":
        scene["collectibles"][0]["y"] = 0.1
    elif case == "boolean_coordinate":
        scene["spawn"]["x"] = True
    elif case == "string_coordinate":
        scene["spawn"]["x"] = "0"
    elif case == "empty_platforms":
        scene["platforms"] = []
    elif case == "empty_collectibles":
        scene["collectibles"] = []
    elif case == "unexpected_field":
        scene["gravity"] = 10
    return scene


@pytest.mark.parametrize("case", [
    "unsupported_spawn", "unsupported_exit",
    "duplicate_platform_id", "duplicate_gem_id",
    "duplicate_gem_position", "platform_outside_world",
    "gem_inside_platform", "boolean_coordinate", "string_coordinate",
    "empty_platforms", "empty_collectibles", "unexpected_field",
])
def test_invalid_scene_preserves_saved_version(scene_api, case):
    client, _ = scene_api
    assert client.put(url(), json=payload()).status_code == 200

    rejected = client.put(url(), json=payload(1, invalid_scene(case)))
    assert rejected.status_code == 422, rejected.text

    saved = client.get(url()).json()
    assert saved["version"] == 1
    assert saved["layout"] == layout()


@pytest.mark.parametrize("version", [True, -1, "1"])
def test_invalid_version_does_not_create_scene(scene_api, version):
    client, _ = scene_api
    result = client.put(url(), json=payload(version))
    assert result.status_code == 422, result.text
    assert client.get(url()).status_code == 404


def test_dimension_switch_preserves_scene(scene_api):
    client, engine = scene_api
    assert client.put(url(), json=payload()).status_code == 200

    with Session(engine) as db:
        db.get(GameProject, 1).dimension = "2d"
        db.commit()
    assert client.get(url()).status_code == 400

    with Session(engine) as db:
        db.get(GameProject, 1).dimension = "3d"
        db.commit()

    restored = client.get(url())
    assert restored.status_code == 200
    assert restored.json()["version"] == 1
    assert restored.json()["layout"] == layout()


def test_scene_recovery_validation_is_read_only(scene_api):
    client, _ = scene_api
    validation_url = url() + "/validate"

    result = client.post(validation_url, json=layout())
    assert result.status_code == 200, result.text
    assert result.json() == layout()
    assert client.get(url()).status_code == 404

    assert client.put(url(), json=payload()).status_code == 200
    before = client.get(url()).json()

    changed = layout()
    changed["collectibles"][0]["x"] = -2
    assert client.post(validation_url, json=changed).status_code == 200
    invalid = invalid_scene("unsupported_spawn")
    assert client.post(validation_url, json=invalid).status_code == 422
    assert client.get(url()).json() == before


def test_scene_recovery_validation_access_and_dimension(scene_api):
    client, engine = scene_api
    assert client.post(url(2) + "/validate", json=layout()).status_code == 404

    client.cookies.set("indaverse_access_token", "other")
    assert client.post(url() + "/validate", json=layout()).status_code == 404

    client.cookies.clear()
    assert client.post(url() + "/validate", json=layout()).status_code == 401

    client.cookies.set("indaverse_access_token", "other")
    with Session(engine) as db:
        db.get(GameProject, 2).dimension = "2d"
        db.commit()
    assert client.post(url(2) + "/validate", json=layout()).status_code == 400


def test_checkpoint_and_required_gems_are_validated_and_saved(scene_api):
    client, _ = scene_api
    scene = layout()
    scene["checkpoint"] = {"x": 0, "y": 0, "z": 4}
    scene["required_gems"] = 1
    response = client.put(url(), json=payload(scene=scene))
    assert response.status_code == 200, response.text
    assert client.get(url()).json()["layout"] == scene
    assert client.put(url(), json=payload(1, {**scene, "required_gems": 4})).status_code == 422
    assert client.put(url(), json=payload(1, {**scene, "checkpoint": {"x": 40, "y": 0, "z": 4}})).status_code == 422
    assert client.get(url()).json()["version"] == 1

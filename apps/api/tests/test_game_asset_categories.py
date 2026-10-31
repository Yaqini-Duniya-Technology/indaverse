"""Asset category compatibility and persistence checks."""

import pytest

from test_refinement_tasks import api
from test_game_projects import game_api, blueprint, url


KINDS = (
    "model", "sprite", "texture", "material", "animation", "vfx",
    "audio", "ui", "environment", "prefab", "shader", "other",
)

LEGACY_KINDS = ("sprite", "model", "texture", "audio", "animation", "ui")


def assets(kinds):
    return [
        {
            "id": f"asset-{kind}",
            "title": f"{kind} requirement",
            "kind": kind,
            "description": f"Specifications for {kind}.",
        }
        for kind in kinds
    ]


@pytest.mark.parametrize("dimension", ["2d", "3d"])
def test_all_categories_save_reload_noop_and_history(game_api, dimension):
    client, _ = game_api
    original_assets = assets(KINDS)
    payload = blueprint(dimension=dimension, assets=original_assets)

    created = client.put(url(), json=payload)
    assert created.status_code == 200, created.text
    assert created.json()["version"] == 1
    assert created.json()["assets"] == original_assets
    assert client.get(url()).json()["assets"] == original_assets

    # Saving an unchanged blueprint must not create another version.
    noop = client.put(url(), json={**payload, "expected_version": 1})
    assert noop.status_code == 200, noop.text
    assert noop.json()["version"] == 1

    reordered = list(reversed(original_assets))
    updated = client.put(
        url(),
        json={**payload, "expected_version": 1, "assets": reordered},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == 2
    assert updated.json()["assets"] == reordered

    # Editing categories and order must preserve all entity identities.
    for collection in ("characters", "levels", "assets"):
        assert sorted(item["id"] for item in updated.json()[collection]) == sorted(
            item["id"] for item in payload[collection]
        )

    history = client.get(url() + "/revisions?limit=10&offset=0")
    assert history.status_code == 200, history.text
    snapshots = {
        item["version"]: item["snapshot"]
        for item in history.json()["items"]
    }
    assert snapshots[1]["assets"] == original_assets
    assert snapshots[2]["assets"] == reordered


def test_legacy_categories_remain_unchanged_when_expanding_blueprint(game_api):
    client, _ = game_api
    legacy_assets = assets(LEGACY_KINDS)
    payload = blueprint(assets=legacy_assets)

    created = client.put(url(), json=payload)
    assert created.status_code == 200, created.text
    assert created.json()["assets"] == legacy_assets

    expanded = legacy_assets + assets(("material", "vfx", "environment", "prefab", "shader", "other"))
    updated = client.put(
        url(),
        json={**payload, "expected_version": 1, "assets": expanded},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["assets"][:len(legacy_assets)] == legacy_assets
    assert client.get(url()).json()["assets"] == expanded


@pytest.mark.parametrize("kind", ["unknown", "", "MODEL"])
def test_invalid_category_preserves_saved_blueprint(game_api, kind):
    client, _ = game_api
    original = blueprint()
    assert client.put(url(), json=original).status_code == 200

    invalid = [{
        "id": "invalid",
        "title": "Invalid category",
        "kind": kind,
        "description": "",
    }]
    result = client.put(
        url(),
        json={**original, "expected_version": 1, "assets": invalid},
    )
    assert result.status_code == 422, result.text

    saved = client.get(url()).json()
    assert saved["version"] == 1
    assert saved["assets"] == original["assets"]

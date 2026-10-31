"""Blueprint import validation must never mutate saved games."""

import pytest

from test_refinement_tasks import api
from test_game_projects import game_api, blueprint, url


def validate_url(project_id=1):
    return url(project_id) + "/validate-import"


def portable(**changes):
    data = blueprint(**changes)
    data.pop("expected_version")
    return {
        "format": "indaverse-game-blueprint",
        "format_version": 1,
        "source_project_id": 999,
        "exported_at": "2026-10-15T12:00:00Z",
        "blueprint": data,
    }


def test_legacy_import_preserves_ids_and_does_not_create_game(game_api):
    client, _ = game_api
    document = {**blueprint(), "project_id": 999, "expected_version": 999}
    result = client.post(validate_url(), json=document)
    assert result.status_code == 200, result.text
    report = result.json()
    assert report["valid"] is True
    assert report["issues"] == []
    assert report["warnings"] == []
    assert "expected_version" not in report["data"]
    assert "project_id" not in report["data"]
    for collection in ("characters", "levels", "assets"):
        assert report["data"][collection] == document[collection]
    assert client.get(url()).status_code == 404


def test_versioned_import_can_be_saved_using_destination_version(game_api):
    client, _ = game_api
    original = blueprint()
    assert client.put(url(), json=original).status_code == 200
    document = portable(
        title="Imported Zamara design",
        dimension="3d",
        assets=[{
            "id": "village-material",
            "title": "Village material",
            "kind": "material",
            "description": "Stone and clay surfaces.",
        }],
    )
    report = client.post(validate_url(), json=document).json()
    assert report["valid"] is True
    assert report["data"] == document["blueprint"]

    # Validation has not changed the saved game or history.
    assert client.get(url()).json()["title"] == original["title"]
    history = client.get(url() + "/revisions").json()
    assert history["total"] == 1

    saved = client.put(
        url(), json={**report["data"], "expected_version": 1},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["title"] == "Imported Zamara design"
    assert saved.json()["version"] == 2
    assert saved.json()["assets"][0]["id"] == "village-material"


def test_import_validation_preserves_concurrency_protection(game_api):
    client, _ = game_api
    assert client.put(url(), json=blueprint()).status_code == 200
    report = client.post(validate_url(), json=portable(title="Imported")).json()
    assert report["valid"] is True

    assert client.put(
        url(), json=blueprint(expected_version=1, title="Newer saved game"),
    ).status_code == 200
    stale = client.put(
        url(), json={**report["data"], "expected_version": 1},
    )
    assert stale.status_code == 409
    assert client.get(url()).json()["title"] == "Newer saved game"


def test_unavailable_images_are_removed_only_from_preview(game_api):
    client, _ = game_api
    document = portable(characters=[{
        "id": "kairo",
        "name": "Kairo",
        "role": "player",
        "description": "Explorer",
        "image_id": 999999,
    }])
    result = client.post(validate_url(), json=document)
    assert result.status_code == 200, result.text
    report = result.json()
    assert report["valid"] is True
    assert report["data"]["characters"][0]["id"] == "kairo"
    assert report["data"]["characters"][0]["image_id"] is None
    assert any("characters[0].image_id" in warning for warning in report["warnings"])
    assert client.get(url()).status_code == 404


@pytest.mark.parametrize("changes, field", [
    ({"title": " "}, "title"),
    ({"characters": [{"id": "kairo", "name": " "}]}, "characters[0].name"),
    ({"levels": [
        {"id": "same", "title": "One"},
        {"id": "same", "title": "Two"},
    ]}, "levels"),
    ({"assets": [{"id": "one", "title": "One", "kind": "invalid"}]}, "assets[0].kind"),
])
def test_invalid_fields_have_readable_paths_and_do_not_save(game_api, changes, field):
    client, _ = game_api
    result = client.post(validate_url(), json=portable(**changes))
    assert result.status_code == 200, result.text
    report = result.json()
    assert report["valid"] is False
    assert report["data"] is None
    assert any(issue["field"] == field for issue in report["issues"])
    assert client.get(url()).status_code == 404


@pytest.mark.parametrize("changes", [
    {"format": "another-format"},
    {"format_version": 2},
    {"format_version": True},
    {"blueprint": []},
    {"unexpected": "field"},
])
def test_rejects_invalid_export_envelopes(game_api, changes):
    client, _ = game_api
    result = client.post(validate_url(), json={**portable(), **changes})
    assert result.status_code == 200, result.text
    assert result.json()["valid"] is False
    assert client.get(url()).status_code == 404


def test_rejects_unknown_nested_fields(game_api):
    client, _ = game_api
    document = portable()
    document["blueprint"]["unexpected"] = "field"
    result = client.post(validate_url(), json=document)
    assert result.status_code == 200
    assert result.json()["valid"] is False


def test_import_validation_requires_project_ownership_and_login(game_api):
    client, _ = game_api
    assert client.post(validate_url(2), json=portable()).status_code == 404
    client.cookies.set("indaverse_access_token", "other")
    assert client.post(validate_url(), json=portable()).status_code == 404
    assert client.post(validate_url(2), json=portable()).json()["valid"] is True
    client.cookies.clear()
    assert client.post(validate_url(), json=portable()).status_code == 401

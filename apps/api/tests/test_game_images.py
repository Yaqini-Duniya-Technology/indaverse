"""Game image references stay inside their project."""

from io import BytesIO

import pytest
from PIL import Image
from sqlalchemy.orm import Session

from test_game_projects import api, game_api, blueprint, url
from app.models.game_project import GameProject


@pytest.fixture
def game_images(game_api, monkeypatch, tmp_path):
    from app.api.v1 import image_assets

    monkeypatch.setattr(image_assets, "UPLOAD_DIR", tmp_path)
    client, engine = game_api
    buffer = BytesIO()
    Image.new("RGB", (16, 16), "purple").save(buffer, format="PNG")
    payload = buffer.getvalue()

    def upload(project_id, label):
        result = client.post(
            f"/api/v1/projects/{project_id}/images",
            data={"label": label, "category": "reference"},
            files={"file": ("reference.png", payload, "image/png")},
        )
        assert result.status_code in (200, 201), result.text
        return result.json()["id"]

    own = upload(1, "Village reference")
    client.cookies.set("indaverse_access_token", "other")
    foreign = upload(2, "Other project reference")
    client.cookies.set("indaverse_access_token", "owner")
    return client, engine, own, foreign


def linked(image_id, **changes):
    data = blueprint(**changes)
    data["characters"][0]["image_id"] = image_id
    data["levels"][0]["image_id"] = image_id
    return data


def test_link_reload_noop_and_remove(game_images):
    client, _, own, _ = game_images
    first = client.put(url(), json=linked(own))
    assert first.status_code == 200, first.text
    assert first.json()["version"] == 1
    saved = client.get(url()).json()
    assert saved["characters"][0]["image_id"] == own
    assert saved["levels"][0]["image_id"] == own

    noop = client.put(url(), json=linked(own, expected_version=1))
    assert noop.status_code == 200, noop.text
    assert noop.json()["version"] == 1

    removed = client.put(url(), json=linked(None, expected_version=1))
    assert removed.status_code == 200, removed.text
    assert removed.json()["version"] == 2
    assert removed.json()["characters"][0]["image_id"] is None
    assert removed.json()["levels"][0]["image_id"] is None


@pytest.mark.parametrize("collection", ["characters", "levels"])
@pytest.mark.parametrize("source", ["foreign", "missing"])
def test_invalid_image_preserves_saved_game(game_images, collection, source):
    client, _, own, foreign = game_images
    assert client.put(url(), json=linked(own)).status_code == 200
    data = linked(own, expected_version=1, title="Should not save")
    data[collection][0]["image_id"] = foreign if source == "foreign" else 999999
    result = client.put(url(), json=data)
    assert result.status_code == 400, result.text
    saved = client.get(url()).json()
    assert saved["title"] == "River explorer"
    assert saved["version"] == 1
    assert saved[collection][0]["image_id"] == own


def test_invalid_image_does_not_create_game(game_images):
    client, _, _, foreign = game_images
    result = client.put(url(), json=linked(foreign))
    assert result.status_code == 400, result.text
    assert client.get(url()).status_code == 404


@pytest.mark.parametrize("image_id", [True, 0, -1, "1"])
def test_invalid_image_id_validation(game_api, image_id):
    client, _ = game_api
    result = client.put(url(), json=linked(image_id))
    assert result.status_code == 422, result.text
    assert client.get(url()).status_code == 404


def test_legacy_json_load_and_noop_preserve_version(game_api):
    client, engine = game_api
    assert client.put(url(), json=blueprint()).status_code == 200
    with Session(engine) as db:
        game = db.get(GameProject, 1)
        game.characters = [
            {key: value for key, value in item.items() if key != "image_id"}
            for item in game.characters
        ]
        game.levels = [
            {key: value for key, value in item.items() if key != "image_id"}
            for item in game.levels
        ]
        db.commit()
    loaded = client.get(url())
    assert loaded.status_code == 200, loaded.text
    assert loaded.json()["characters"][0]["image_id"] is None
    assert loaded.json()["levels"][0]["image_id"] is None
    noop = client.put(url(), json=blueprint(expected_version=1))
    assert noop.status_code == 200, noop.text
    assert noop.json()["version"] == 1

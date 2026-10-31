from io import BytesIO

import pytest
from PIL import Image

from test_refinement_tasks import api
from app.api.v1 import image_assets


@pytest.fixture
def images(api, monkeypatch, tmp_path):
    monkeypatch.setattr(image_assets, "UPLOAD_DIR", tmp_path)
    client, _ = api
    return client, tmp_path


def upload(client, project_id=1):
    buffer = BytesIO()
    Image.new("RGB", (20, 10), "blue").save(buffer, format="PNG")
    return client.post(
        f"/api/v1/projects/{project_id}/images",
        data={"label": "Main character", "category": "character"},
        files={"file": ("character.png", buffer.getvalue(), "image/png")},
    )


def test_upload_list_and_private_content(images):
    client, _ = images
    result = upload(client)
    assert result.status_code == 201, result.text
    asset = result.json()
    assert asset["width"] == 20
    assert asset["mime_type"] == "image/webp"
    base = "/api/v1/projects/1/images"
    assert client.get(base).json()["items"][0]["id"] == asset["id"]
    content = f"{base}/{asset['id']}/content"
    assert client.get(content).status_code == 200
    client.cookies.set("indaverse_access_token", "other")
    assert client.get(content).status_code == 404
    assert client.get(base).status_code == 404
    client.cookies.clear()
    assert client.get(content).status_code == 401


def test_invalid_upload_leaves_no_files(images):
    client, directory = images
    result = client.post(
        "/api/v1/projects/1/images",
        data={"label": "Fake image", "category": "scene"},
        files={"file": ("fake.png", b"not an image", "image/png")},
    )
    assert result.status_code == 400, result.text
    assert list(directory.iterdir()) == []
    assert client.get("/api/v1/projects/1/images").json()["items"] == []


def test_cover_versions_and_cross_project_rejection(images):
    client, _ = images
    own = upload(client).json()
    client.cookies.set("indaverse_access_token", "other")
    foreign = upload(client, 2).json()
    client.cookies.set("indaverse_access_token", "owner")
    url = "/api/v1/projects/1/cover"
    bad = client.put(url, json={"expected_version": 0, "image_id": foreign["id"]})
    assert bad.status_code == 400
    saved = client.put(url, json={"expected_version": 0, "image_id": own["id"]})
    assert saved.status_code == 200, saved.text
    assert saved.json()["cover_image_id"] == own["id"]
    assert saved.json()["cover_version"] == 1
    assert client.put(url, json={"expected_version": 0, "image_id": None}).status_code == 409
    noop = client.put(url, json={"expected_version": 1, "image_id": own["id"]})
    assert noop.json()["cover_version"] == 1
    removed = client.put(url, json={"expected_version": 1, "image_id": None})
    assert removed.json()["cover_image_id"] is None
    assert removed.json()["cover_version"] == 2

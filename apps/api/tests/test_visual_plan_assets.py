"""Project image and video revision links stay scoped to their project."""

from io import BytesIO

import pytest
from PIL import Image
from sqlalchemy.orm import Session

from test_refinement_tasks import (
    api, base, create_review, create_tasks, change_task, current_task,
)
from app.models.video_revision import VideoRevision
from app.api.v1 import image_assets


@pytest.fixture
def visual_assets(api, monkeypatch, tmp_path):
    client, engine = api
    monkeypatch.setattr(image_assets, "UPLOAD_DIR", tmp_path)
    buffer = BytesIO()
    Image.new("RGB", (16, 16), "purple").save(buffer, format="PNG")
    ids = {}
    for project_id, token in ((1, "owner"), (2, "other")):
        client.cookies.set("indaverse_access_token", token)
        result = client.post(
            f"/api/v1/projects/{project_id}/images",
            data={"label": f"Reference {project_id}", "category": "scene"},
            files={"file": ("reference.png", buffer.getvalue(), "image/png")},
        )
        assert result.status_code in (200, 201), result.text
        ids[project_id] = result.json()["id"]
    client.cookies.set("indaverse_access_token", "owner")

    with Session(engine) as db:
        for project_id in (1, 2):
            db.add(VideoRevision(
                id=project_id, project_id=project_id, version=1, reason="saved",
                snapshot={"title": f"Video {project_id}", "script": "Saved script",
                          "aspect_ratio": "16:9", "shots": []},
            ))
        db.commit()
    return client, ids


def links(ids):
    return [{"kind": "image", "id": ids[1]}, {"kind": "video_revision", "id": 1}]


def test_plan_links_save_noop_and_remove(visual_assets):
    client, ids = visual_assets
    step = {"title": "Review visuals", "notes": "", "status": "todo", "assets": links(ids)}
    first = client.put(base(), json={"expected_version": 1, "steps": [step]})
    assert first.status_code == 200, first.text
    assert first.json()["steps"][0]["assets"] == links(ids)
    version = first.json()["version"]
    noop = client.put(base(), json={"expected_version": version, "steps": [step]})
    assert noop.status_code == 200, noop.text
    assert noop.json()["version"] == version
    step["assets"] = []
    removed = client.put(base(), json={"expected_version": version, "steps": [step]})
    assert removed.status_code == 200, removed.text
    assert removed.json()["steps"][0]["assets"] == []


def test_task_evidence_save_preserve_and_stale_protection(visual_assets):
    client, ids = visual_assets
    task = create_tasks(client, create_review(client))[0]
    result = change_task(client, task, evidence=links(ids))
    assert result.status_code == 200, result.text
    saved = result.json()
    assert saved["evidence"] == links(ids)
    legacy = change_task(client, saved, resolution="Reviewed the visual references.")
    assert legacy.status_code == 200, legacy.text
    assert legacy.json()["evidence"] == links(ids)
    assert change_task(client, task, evidence=[]).status_code == 409
    assert current_task(client, task)["evidence"] == links(ids)


@pytest.mark.parametrize("kind", ["image", "video_revision"])
@pytest.mark.parametrize("foreign", [True, False])
def test_foreign_or_missing_links_are_atomic(visual_assets, kind, foreign):
    client, ids = visual_assets
    asset_id = (ids[2] if kind == "image" else 2) if foreign else 999999
    bad = [{"kind": kind, "id": asset_id}]
    task = create_tasks(client, create_review(client))[0]
    result = change_task(client, task, status="in_progress", evidence=bad)
    assert result.status_code == 400, result.text
    assert current_task(client, task)["version"] == task["version"]
    assert current_task(client, task)["evidence"] == []
    before = client.get(base()).json()
    result = client.put(base(), json={
        "expected_version": before["version"],
        "steps": [{"title": "Must not save", "assets": bad}],
    })
    assert result.status_code == 400, result.text
    assert client.get(base()).json() == before


def test_asset_lists_details_and_authentication(visual_assets):
    client, ids = visual_assets
    for kind, asset_id in (("image", ids[1]), ("video_revision", 1)):
        page = client.get(base() + f"/assets?kind={kind}").json()
        assert [item["id"] for item in page["items"]] == [asset_id]
        detail = client.get(base() + f"/assets/{kind}/{asset_id}")
        assert detail.status_code == 200, detail.text
        assert detail.json()["available"] is True
        if kind == "video_revision":
            assert detail.json()["snapshot"]["script"] == "Saved script"
        foreign_id = ids[2] if kind == "image" else 2
        assert client.get(base() + f"/assets/{kind}/{foreign_id}").status_code == 404
        assert client.get(base() + f"/assets/{kind}/999999").status_code == 404
    client.cookies.set("indaverse_access_token", "other")
    assert client.get(base() + "/assets?kind=image").status_code == 404
    assert client.get(base() + "/assets/video_revision/1").status_code == 404
    client.cookies.clear()
    assert client.get(base() + "/assets?kind=video_revision").status_code == 401


def test_missing_image_file_is_reported_without_deleting_link(visual_assets, tmp_path):
    client, ids = visual_assets
    for path in tmp_path.iterdir():
        if path.is_file():
            path.unlink()
    detail = client.get(base() + f"/assets/image/{ids[1]}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["available"] is False


@pytest.mark.parametrize("kind", ["image", "video_revision"])
def test_duplicate_evidence_rejected(visual_assets, kind):
    client, ids = visual_assets
    asset_id = ids[1] if kind == "image" else 1
    task = create_tasks(client, create_review(client))[0]
    duplicate = [{"kind": kind, "id": asset_id}] * 2
    result = change_task(client, task, evidence=duplicate)
    assert result.status_code == 422, result.text
    assert current_task(client, task)["evidence"] == []

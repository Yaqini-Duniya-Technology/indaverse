from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.v1 import dependencies, image_assets
from app.database.connection import Base, get_db
from app.main import app
from app.models import ImageGenerationJob, MusicGenerationJob, Project, StoryCharacters, StoryProject, User


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([User(id=i, email=f"creator{i}@example.test", username=f"creator{i}", hashed_password="test")
                    for i in (1, 2)])
        db.flush()
        db.add_all([Project(id=i, name=f"Project {i}", project_type="story", user_id=1 if i < 3 else 2)
                    for i in (1, 2, 3)])
        db.commit()

    def session():
        with Session(engine) as db:
            yield db

    monkeypatch.setitem(app.dependency_overrides, get_db, session)
    monkeypatch.setattr(dependencies, "decode_access_token", lambda token: {"sub": token})
    monkeypatch.setattr(image_assets, "UPLOAD_DIR", tmp_path / "images")
    with TestClient(app) as client:
        client.cookies.set("indaverse_access_token", "1")
        yield client, engine
    engine.dispose()


def test_archive_and_private_duplicate_preserve_saved_draft(workspace):
    client, engine = workspace
    with Session(engine) as db:
        source = db.get(Project, 1)
        source.visibility = "public"
        source.brief_goal = "Finish the story"
        source.brief_version = 5
        source.cover_image_id = 89
        db.add(StoryProject(project_id=1, title="Saved manuscript", version=8,
                            chapters=[{"title": "Opening", "content": "Original"}]))
        db.add(StoryCharacters(project_id=1, characters=[{"name": "Aya", "portrait_image_id": 89}]))
        db.commit()
    archive = "/api/v1/projects/1/archive"
    response = client.put(archive, json={"archived": True})
    assert response.status_code == 200, response.text
    stamp = response.json()["archived_at"]
    assert stamp and client.put(archive, json={"archived": True}).json()["archived_at"] == stamp
    assert client.get("/api/v1/projects/1").json()["archived_at"] == stamp
    response = client.post("/api/v1/projects/1/duplicate")
    assert response.status_code == 201, response.text
    copy = response.json()
    assert copy["visibility"] == "private"
    assert copy["archived_at"] is None and copy["cover_image_id"] is None
    with Session(engine) as db:
        assert db.get(Project, copy["id"]).brief_goal == "Finish the story"
        assert db.get(StoryProject, copy["id"]).version == 1
        assert db.get(StoryProject, copy["id"]).chapters[0]["content"] == "Original"
        assert db.get(StoryCharacters, copy["id"]).characters[0]["portrait_image_id"] is None
        assert db.get(StoryCharacters, 1).characters[0]["portrait_image_id"] == 89
    assert client.put(archive, json={"archived": False}).json()["archived_at"] is None
    assert client.put("/api/v1/projects/3/archive", json={"archived": True}).status_code == 404
    assert client.post("/api/v1/projects/3/duplicate").status_code == 404


def upload(client, project_id, label):
    content = BytesIO()
    Image.new("RGB", (10, 10), "red").save(content, "PNG")
    response = client.post(f"/api/v1/projects/{project_id}/images",
                           files={"file": ("test.png", content.getvalue(), "image/png")},
                           data={"label": label, "category": "reference"})
    assert response.status_code == 201, response.text
    return response.json()


def test_asset_library_scope_and_copy_real_bytes(workspace):
    client, _ = workspace
    asset = upload(client, 1, "Own image")
    client.cookies.set("indaverse_access_token", "2")
    foreign = upload(client, 3, "Private image")
    client.cookies.set("indaverse_access_token", "1")
    listing = client.get("/api/v1/creative/assets?kind=image&limit=1").json()
    assert [item["name"] for item in listing["items"]] == ["Own image"]
    assert listing["has_more"] is False
    assert "stored_filename" not in listing["items"][0]
    assert client.get("/api/v1/creative/assets?kind=audio").json()["items"] == []
    endpoint = f"/api/v1/projects/1/images/{asset['id']}"
    copy = endpoint + "/copy"
    assert client.post(copy, json={"destination_project_id": 2, "permission_confirmed": False}).status_code == 422
    assert client.post(copy, json={"destination_project_id": 3, "permission_confirmed": True}).status_code == 404
    assert client.post(f"/api/v1/projects/3/images/{foreign['id']}/copy",
                       json={"destination_project_id": 2, "permission_confirmed": True}).status_code == 404
    response = client.post(copy, json={"destination_project_id": 2, "permission_confirmed": True})
    assert response.status_code == 201, response.text
    copied = response.json()
    original = client.get(endpoint + "/content")
    served = client.get(f"/api/v1/projects/2/images/{copied['id']}/content")
    assert served.status_code == original.status_code == 200
    assert served.content == original.content
    with Image.open(BytesIO(served.content)) as image:
        assert image.format == "WEBP" and image.size == (10, 10)
    assert client.get("/api/v1/creative/assets?limit=1").json()["has_more"]
    client.cookies.clear()
    assert client.get("/api/v1/creative/assets").status_code == 401


def test_provider_availability_and_owner_only_job_history(workspace):
    client, engine = workspace
    with Session(engine) as db:
        db.add_all([
            ImageGenerationJob(project_id=1, label="Image", purpose="reference", prompt="private",
                               provider="unavailable", status="unavailable"),
            MusicGenerationJob(project_id=1, user_id=1, prompt="private", provider="unavailable",
                               status="unavailable", output_type="instrumental", language="English"),
        ])
        db.commit()
    caps = client.get("/api/v1/creative/capabilities").json()
    assert caps["manual"] and len(caps["capabilities"]) == 7
    assert all(not row["available"] and row["provider"] is None for row in caps["capabilities"])
    history = "/api/v1/creative/jobs?project_id=1&limit=1"
    first, second = client.get(history).json(), client.get(history + "&offset=1").json()
    assert {first["items"][0]["kind"], second["items"][0]["kind"]} == {"image", "music"}
    assert first["has_more"] and not second["has_more"]
    assert "prompt" not in first["items"][0]
    client.cookies.set("indaverse_access_token", "2")
    assert client.get(history).status_code == 404


def test_additive_archive_migration_preserves_existing_projects():
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text

    from importlib.util import module_from_spec, spec_from_file_location
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / "alembic/versions/41c8a9f52d16_add_project_archive.py"
    spec = spec_from_file_location("archive_migration", path)
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"))
            connection.execute(text("INSERT INTO projects (id, name) VALUES (1, 'Existing project')"))
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
                row = connection.execute(text("SELECT name, archived_at FROM projects")).one()
                assert row == ("Existing project", None)
                migration.downgrade()
            assert connection.execute(text("SELECT name FROM projects")).scalar_one() == "Existing project"
    finally:
        engine.dispose()

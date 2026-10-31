"""API regression tests using an isolated in-memory database.

Test token decoding supplies identities; token cryptography and PostgreSQL
row-lock concurrency are outside this suite.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import app.models
from app.api.v1 import dependencies
from app.api.v1.project_plans import router
from app.database.connection import Base, engine as application_engine, get_db
from app.models.project import Project
from app.models.project_plan import ProjectPlan
from app.models.user import User


@pytest.fixture
def api(monkeypatch):
    # Fail immediately if a test accidentally connects to the application DB.
    def forbid_application_connection(*args):
        raise AssertionError("Tests must not connect to the application database.")

    event.listen(application_engine, "checkout", forbid_application_connection)
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(test_engine, "connect")
    def enable_foreign_keys(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")

    try:
        Base.metadata.create_all(test_engine)
        with Session(test_engine) as db:
            db.add_all([
                User(id=1, email="owner@example.test", username="owner",
                     hashed_password="test-only", is_active=True),
                User(id=2, email="other@example.test", username="other",
                     hashed_password="test-only", is_active=True),
            ])
            db.flush()
            db.add_all([
                Project(id=1, user_id=1, name="Owner project",
                        project_type="music", brief_goal="Make a song", brief_version=1),
                Project(id=2, user_id=2, name="Other project",
                        project_type="music", brief_goal="Another song", brief_version=1),
            ])
            db.flush()
            for project_id in (1, 2):
                db.add(ProjectPlan(
                    project_id=project_id,
                    version=1,
                    brief_version=1,
                    brief_snapshot={"goal": "Make a song"},
                    planner="template-v1",
                    steps=[
                        {"title": "Write chorus", "notes": "", "status": "todo", "assets": []},
                        {"title": "Arrange audio", "notes": "", "status": "todo", "assets": []},
                    ],
                ))
            db.commit()

        def isolated_db():
            with Session(test_engine) as db:
                yield db

        def test_decode(token):
            if token not in ("owner", "other"):
                raise ValueError("Invalid test token")
            return {"sub": "1" if token == "owner" else "2"}

        monkeypatch.setattr(dependencies, "decode_access_token", test_decode)
        test_app = FastAPI()
        test_app.include_router(router, prefix="/api/v1")
        from app.api.v1.story_projects import router as story_router
        test_app.include_router(story_router, prefix="/api/v1")
        from app.api.v1.image_assets import router as image_router
        test_app.include_router(image_router, prefix="/api/v1")
        from app.api.v1.video_projects import router as video_router
        test_app.include_router(video_router, prefix="/api/v1")
        test_app.dependency_overrides[get_db] = isolated_db

        with TestClient(test_app) as client:
            client.cookies.set("indaverse_access_token", "owner")
            yield client, test_engine
    finally:
        test_engine.dispose()
        event.remove(application_engine, "checkout", forbid_application_connection)


def base(project_id=1):
    return f"/api/v1/projects/{project_id}/plan"


def create_review(client, project_id=1, decision="needs_changes"):
    result = client.post(base(project_id) + "/reviews", json={
        "expected_plan_version": 1,
        "expected_brief_version": 1,
        "decision": decision,
        "summary": "Improve the arrangement.",
        "step_feedback": [{"step_number": 1, "note": "Make the chorus clearer."}],
    })
    assert result.status_code == 201, result.text
    return result.json()


def create_tasks(client, review):
    result = client.post(base() + f"/reviews/{review['id']}/tasks")
    assert result.status_code == 200, result.text
    return result.json()


def change_task(client, task, **changes):
    payload = {
        "expected_version": task["version"],
        "status": task["status"],
        "resolution": task["resolution"],
    }
    payload.update(changes)
    return client.patch(base() + f"/tasks/{task['id']}", json=payload)


def test_repeated_creation_keeps_existing_tasks_and_progress(api):
    client, _ = api
    review = create_review(client)
    original = create_tasks(client, review)
    assert len(original) == 2
    changed = change_task(
        client, original[0], status="in_progress", resolution="Started arranging."
    )
    assert changed.status_code == 200, changed.text

    repeated = create_tasks(client, review)
    assert [task["id"] for task in repeated] == [task["id"] for task in original]
    assert repeated[0]["status"] == "in_progress"
    assert repeated[0]["resolution"] == "Started arranging."
    assert repeated[0]["version"] == 2

    listed = client.get(base() + "/tasks").json()
    assert len(listed["items"]) == 2


@pytest.mark.parametrize("note", ["", "   "])
def test_done_requires_a_nonblank_resolution(api, note):
    client, _ = api
    task = create_tasks(client, create_review(client))[0]
    result = change_task(client, task, status="done", resolution=note)
    assert result.status_code == 400, result.text
    saved = client.get(base() + "/tasks").json()["items"]
    current = next(item for item in saved if item["id"] == task["id"])
    assert current["status"] == "todo"
    assert current["version"] == 1


def test_done_persists_resolution_without_changing_plan_or_review(api):
    client, _ = api
    review = create_review(client)
    task = create_tasks(client, review)[0]
    result = change_task(client, task, status="done", resolution="  Improved the arrangement.  ")
    assert result.status_code == 200, result.text
    assert result.json()["resolution"] == "Improved the arrangement."
    assert result.json()["version"] == 2

    plan = client.get(base()).json()
    assert plan["version"] == 1
    assert all(step["status"] == "todo" for step in plan["steps"])
    saved_review = client.get(base() + "/reviews").json()["items"][0]
    assert saved_review["decision"] == "needs_changes"


def test_stale_update_cannot_overwrite_newer_work(api):
    client, _ = api
    task = create_tasks(client, create_review(client))[0]
    first = change_task(client, task, status="in_progress", resolution="Newer work.")
    assert first.status_code == 200, first.text
    stale = change_task(client, task, status="done", resolution="Old tab's work.")
    assert stale.status_code == 409, stale.text

    current = next(
        item for item in client.get(base() + "/tasks").json()["items"]
        if item["id"] == task["id"]
    )
    assert current["version"] == 2
    assert current["resolution"] == "Newer work."
    assert current["status"] == "in_progress"


def test_unchanged_update_does_not_increment_version(api):
    client, _ = api
    task = create_tasks(client, create_review(client))[0]
    result = change_task(client, task)
    assert result.status_code == 200, result.text
    assert result.json()["version"] == task["version"]


def test_other_account_cannot_read_create_or_update_owner_tasks(api):
    client, _ = api
    review = create_review(client)
    task = create_tasks(client, review)[0]
    client.cookies.set("indaverse_access_token", "other")

    assert client.get(base() + "/tasks").status_code == 404
    assert client.post(base() + f"/reviews/{review['id']}/tasks").status_code == 404
    assert change_task(client, task, status="done", resolution="Unauthorized").status_code == 404

    # A valid owned project must not expose another project's review or task.
    assert client.post(base(2) + f"/reviews/{review['id']}/tasks").status_code == 404
    result = client.patch(base(2) + f"/tasks/{task['id']}", json={
        "expected_version": task["version"], "status": "done", "resolution": "Unauthorized",
    })
    assert result.status_code == 404
    assert client.get(base(2) + f"/tasks?review_id={review['id']}").json()["items"] == []

    client.cookies.set("indaverse_access_token", "owner")
    current = next(
        item for item in client.get(base() + "/tasks").json()["items"]
        if item["id"] == task["id"]
    )
    assert current["version"] == 1
    assert current["status"] == "todo"


def test_missing_cookie_rejects_task_routes(api):
    client, _ = api
    review = create_review(client)
    task = create_tasks(client, review)[0]
    client.cookies.clear()
    assert client.get(base() + "/tasks").status_code == 401
    assert client.post(base() + f"/reviews/{review['id']}/tasks").status_code == 401
    assert change_task(client, task).status_code == 401


def test_approved_review_does_not_create_tasks(api):
    client, _ = api
    review = create_review(client, decision="approved")
    result = client.post(base() + f"/reviews/{review['id']}/tasks")
    assert result.status_code == 400, result.text
    assert client.get(base() + "/tasks").json()["items"] == []


def test_tasks_keep_original_feedback_after_plan_edits(api):
    client, _ = api
    review = create_review(client)
    result = client.put(base(), json={
        "expected_version": 1,
        "steps": [
            {"title": "Replacement step", "notes": "", "status": "todo", "assets": []},
        ],
    })
    assert result.status_code == 200, result.text

    tasks = create_tasks(client, review)
    step_task = next(task for task in tasks if task["source_number"] == 1)
    assert step_task["title"] == "Refine step 1: Write chorus"
    assert step_task["source_feedback"] == "Make the chorus clearer."


def test_review_filter_and_pagination(api):
    client, _ = api
    first_review = create_review(client)
    first_tasks = create_tasks(client, first_review)
    second_review = create_review(client)
    create_tasks(client, second_review)

    result = client.get(
        base() + f"/tasks?review_id={first_review['id']}&limit=1&offset=0"
    )
    assert result.status_code == 200, result.text
    page_one = result.json()
    assert len(page_one["items"]) == 1
    assert page_one["has_more"] is True

    page_two = client.get(
        base() + f"/tasks?review_id={first_review['id']}&limit=1&offset=1"
    ).json()
    assert page_two["has_more"] is False
    ids = {page_one["items"][0]["id"], page_two["items"][0]["id"]}
    assert ids == {task["id"] for task in first_tasks}


def test_task_status_filters(api):
    client, _ = api
    review = create_review(client)
    tasks = create_tasks(client, review)
    result = change_task(client, tasks[0], status="done", resolution="Finished the changes.")
    assert result.status_code == 200, result.text

    open_page = client.get(base() + "/tasks?task_status=open").json()
    assert [item["id"] for item in open_page["items"]] == [tasks[1]["id"]]
    done_page = client.get(base() + "/tasks?task_status=done").json()
    assert [item["id"] for item in done_page["items"]] == [tasks[0]["id"]]
    assert client.get(base() + "/tasks?task_status=in_progress").json()["items"] == []

    result = change_task(client, tasks[1], status="in_progress")
    assert result.status_code == 200, result.text
    assert client.get(base() + "/tasks?task_status=todo").json()["items"] == []
    assert len(client.get(base() + "/tasks?task_status=in_progress").json()["items"]) == 1
    assert len(client.get(base() + "/tasks").json()["items"]) == 2


def test_invalid_task_status_filter_is_rejected(api):
    client, _ = api
    assert client.get(base() + "/tasks?task_status=unknown").status_code == 422


def test_status_filter_keeps_project_ownership_scope(api):
    client, _ = api
    create_tasks(client, create_review(client))
    client.cookies.set("indaverse_access_token", "other")
    assert client.get(base() + "/tasks?task_status=open").status_code == 404
    assert client.get(base(2) + "/tasks?task_status=open").json()["items"] == []



def seed_task_evidence(test_engine):
    from app.models.audio_asset import AudioAsset
    from app.models.music_revision import MusicRevision

    with Session(test_engine) as db:
        for project_id in (1, 2):
            db.add(AudioAsset(
                id=project_id,
                project_id=project_id,
                original_filename=f"test-{project_id}.wav",
                stored_filename=f"test-{project_id}.wav",
                file_path=f"test-only/test-{project_id}.wav",
                mime_type="audio/wav",
                file_size=10,
            ))
            db.add(MusicRevision(
                id=project_id,
                project_id=project_id,
                reason="saved",
                snapshot={"title": f"Test song {project_id}"},
            ))
        db.commit()


def current_task(client, task):
    return next(
        item for item in client.get(base() + "/tasks").json()["items"]
        if item["id"] == task["id"]
    )


def test_evidence_save_preserve_noop_and_remove(api):
    client, test_engine = api
    seed_task_evidence(test_engine)
    task = create_tasks(client, create_review(client))[0]
    assert task["evidence"] == []
    links = [
        {"kind": "audio", "id": 1},
        {"kind": "song_revision", "id": 1},
    ]

    result = change_task(client, task, evidence=links)
    assert result.status_code == 200, result.text
    saved = result.json()
    assert saved["evidence"] == links
    assert saved["version"] == task["version"] + 1
    assert current_task(client, task)["evidence"] == links

    unchanged = change_task(client, saved, evidence=links)
    assert unchanged.status_code == 200, unchanged.text
    assert unchanged.json()["version"] == saved["version"]

    # Older clients omit evidence; this must keep existing references.
    legacy = change_task(client, saved, resolution="New change note")
    assert legacy.status_code == 200, legacy.text
    assert legacy.json()["evidence"] == links

    removed = change_task(client, legacy.json(), evidence=[])
    assert removed.status_code == 200, removed.text
    assert removed.json()["evidence"] == []
    assert removed.json()["version"] == legacy.json()["version"] + 1


@pytest.mark.parametrize("kind", ["audio", "song_revision"])
@pytest.mark.parametrize("asset_id", [2, 999])
def test_foreign_or_missing_evidence_is_atomic(api, kind, asset_id):
    client, test_engine = api
    seed_task_evidence(test_engine)
    task = create_tasks(client, create_review(client))[0]
    result = change_task(
        client, task, status="in_progress", resolution="Must not persist",
        evidence=[{"kind": kind, "id": asset_id}],
    )
    assert result.status_code == 400, result.text
    saved = current_task(client, task)
    assert saved["version"] == task["version"]
    assert saved["status"] == task["status"]
    assert saved["resolution"] == task["resolution"]
    assert saved["evidence"] == []


def test_stale_evidence_save_keeps_newer_links(api):
    client, test_engine = api
    seed_task_evidence(test_engine)
    task = create_tasks(client, create_review(client))[0]
    links = [{"kind": "song_revision", "id": 1}]
    first = change_task(client, task, evidence=links)
    assert first.status_code == 200, first.text
    stale = change_task(client, task, evidence=[])
    assert stale.status_code == 409, stale.text
    saved = current_task(client, task)
    assert saved["evidence"] == links
    assert saved["version"] == first.json()["version"]


@pytest.mark.parametrize("evidence", [
    [{"kind": "audio", "id": 1}, {"kind": "audio", "id": 1}],
    [{"kind": "video", "id": 1}],
    [{"kind": "audio", "id": 0}],
    [{"kind": "audio", "id": True}],
    [{"kind": "audio", "id": n} for n in range(1, 22)],
    None,
])
def test_invalid_evidence_request_cannot_change_task(api, evidence):
    client, _ = api
    task = create_tasks(client, create_review(client))[0]
    result = change_task(client, task, evidence=evidence)
    assert result.status_code == 422, result.text
    assert current_task(client, task)["version"] == task["version"]

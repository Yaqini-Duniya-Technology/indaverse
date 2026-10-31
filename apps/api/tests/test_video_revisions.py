"""Saved video history checks using the isolated database."""

from sqlalchemy.orm import Session

from test_refinement_tasks import api
from test_video_projects import video_api, draft, url
from app.models.video_project import VideoProject


def history(project_id=1):
    return f"{url(project_id)}/revisions"


def test_changed_saves_record_immutable_history_and_noops_do_not(video_api):
    client, _ = video_api
    assert client.get(history()).json()["total"] == 0
    assert client.put(url(), json=draft()).status_code == 200
    first = client.get(history()).json()["items"][0]
    assert first["version"] == 1
    assert first["reason"] == "created"
    assert first["snapshot"]["shots"] == draft()["shots"]

    shots = list(reversed(draft()["shots"]))
    result = client.put(url(), json=draft(expected_version=1, title="Changed", shots=shots))
    assert result.status_code == 200, result.text
    page = client.get(history()).json()
    assert page["total"] == 2
    assert [item["version"] for item in page["items"]] == [2, 1]
    assert page["items"][0]["snapshot"]["shots"] == shots
    assert page["items"][1]["snapshot"]["title"] == "The dawn"

    assert client.put(url(), json=draft(expected_version=2, title="Changed", shots=shots)).status_code == 200
    assert client.get(history()).json()["total"] == 2
    assert client.get(f"{history()}/{first['id']}").json() == first


def test_legacy_draft_gets_baseline_before_first_changed_save(video_api):
    client, engine = video_api
    values = draft()
    values.pop("expected_version")
    with Session(engine) as db:
        db.add(VideoProject(project_id=1, version=4, **values))
        db.commit()

    result = client.put(url(), json=draft(expected_version=4, script="New script"))
    assert result.status_code == 200, result.text
    items = client.get(history()).json()["items"]
    assert [item["version"] for item in items] == [5, 4]
    assert items[1]["reason"] == "baseline"
    assert items[1]["snapshot"]["script"] == draft()["script"]


def test_rejected_save_creates_no_revision(video_api):
    client, _ = video_api
    assert client.put(url(), json=draft()).status_code == 200
    assert client.put(url(), json=draft(title="Stale creation")).status_code == 409
    shots = draft()["shots"]
    shots[0]["image_id"] = 999999
    assert client.put(url(), json=draft(expected_version=1, shots=shots)).status_code == 400
    assert client.get(history()).json()["total"] == 1
    assert client.get(url()).json()["version"] == 1


def test_history_is_scoped_and_requires_authentication(video_api):
    client, _ = video_api
    assert client.put(url(), json=draft()).status_code == 200
    revision_id = client.get(history()).json()["items"][0]["id"]
    assert client.get(f"{history(2)}/{revision_id}").status_code == 404

    client.cookies.set("indaverse_access_token", "other")
    assert client.get(history()).status_code == 404
    assert client.get(f"{history()}/{revision_id}").status_code == 404
    assert client.get(history(2)).json()["total"] == 0
    assert client.get(f"{history(2)}/{revision_id}").status_code == 404

    client.cookies.clear()
    assert client.get(history()).status_code == 401
    assert client.get(f"{history()}/{revision_id}").status_code == 401


def test_pagination_and_parameter_validation(video_api):
    client, _ = video_api
    assert client.put(url(), json=draft()).status_code == 200
    assert client.put(url(), json=draft(expected_version=1, title="Second")).status_code == 200
    page = client.get(history() + "?limit=1&offset=1").json()
    assert page["total"] == 2
    assert page["limit"] == 1
    assert page["offset"] == 1
    assert page["items"][0]["version"] == 1
    assert client.get(history() + "?offset=100").json()["items"] == []
    assert client.get(history() + "?limit=0").status_code == 422
    assert client.get(history() + "?offset=-1").status_code == 422
    assert client.get(f"{history()}/999999").status_code == 404


def test_history_rejects_wrong_project_type(api):
    client, _ = api
    assert client.get(history()).status_code == 400
    assert client.get(f"{history()}/1").status_code == 400

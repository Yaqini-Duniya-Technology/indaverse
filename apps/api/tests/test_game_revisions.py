"""Saved game revision regression tests using the isolated API fixture."""

from sqlalchemy import delete
from sqlalchemy.orm import Session

from test_game_projects import api, game_api, blueprint, url
from test_game_images import game_images, linked
from app.models.game_project import GameProject
from app.models.game_revision import GameRevision


def history(project_id=1):
    return f"{url(project_id)}/revisions"


def test_creation_changed_save_noop_and_immutable_snapshots(game_api):
    client, _ = game_api
    assert client.get(history()).json()["total"] == 0
    assert client.put(url(), json=blueprint()).status_code == 200
    first = client.get(history()).json()["items"][0]
    assert first["version"] == 1
    assert first["reason"] == "created"

    data = blueprint(expected_version=1, title="Updated game")
    data["characters"][0]["description"] = "Changed character."
    data["levels"] = list(reversed(data["levels"]))
    changed = client.put(url(), json=data)
    assert changed.status_code == 200, changed.text
    assert changed.json()["version"] == 2

    rows = client.get(history()).json()["items"]
    assert [row["version"] for row in rows] == [2, 1]
    assert rows[0]["reason"] == "saved"
    assert rows[0]["snapshot"]["levels"] == data["levels"]

    original = client.get(f"{history()}/{first['id']}")
    assert original.status_code == 200
    assert original.json()["snapshot"] == first["snapshot"]
    assert original.json()["snapshot"]["characters"][0]["description"] != "Changed character."

    data["expected_version"] = 2
    assert client.put(url(), json=data).json()["version"] == 2
    assert client.get(history()).json()["total"] == 2


def test_legacy_baseline_before_first_changed_save(game_api):
    client, engine = game_api
    assert client.put(url(), json=blueprint()).status_code == 200
    with Session(engine) as db:
        db.execute(delete(GameRevision))
        game = db.get(GameProject, 1)
        game.version = 4
        game.characters = [
            {key: value for key, value in item.items() if key != "image_id"}
            for item in game.characters
        ]
        game.levels = [
            {key: value for key, value in item.items() if key != "image_id"}
            for item in game.levels
        ]
        db.commit()

    assert client.put(url(), json=blueprint(expected_version=4)).json()["version"] == 4
    assert client.get(history()).json()["total"] == 0

    changed = client.put(url(), json=blueprint(expected_version=4, title="New direction"))
    assert changed.status_code == 200, changed.text
    rows = client.get(history()).json()["items"]
    assert [row["version"] for row in rows] == [5, 4]
    assert rows[1]["reason"] == "baseline"
    assert rows[1]["snapshot"]["title"] == "River explorer"
    assert rows[1]["snapshot"]["characters"][0]["image_id"] is None


def test_rejected_saves_add_no_history(game_images):
    client, _, own, foreign = game_images
    assert client.put(url(), json=linked(own)).status_code == 200
    before = client.get(history()).json()
    assert client.put(url(), json=linked(own)).status_code == 409
    assert client.put(url(), json=linked(own, expected_version=1, title=" ")).status_code == 422
    assert client.put(url(), json=linked(foreign, expected_version=1)).status_code == 400
    assert client.get(history()).json() == before
    assert client.get(url()).json()["version"] == 1


def test_history_ownership_authentication_and_revision_scope(game_api):
    client, _ = game_api
    assert client.put(url(), json=blueprint()).status_code == 200
    revision_id = client.get(history()).json()["items"][0]["id"]

    client.cookies.set("indaverse_access_token", "other")
    assert client.get(history()).status_code == 404
    assert client.get(f"{history()}/{revision_id}").status_code == 404
    assert client.put(url(2), json=blueprint(title="Other game")).status_code == 200
    assert client.get(history(2)).json()["total"] == 1
    assert client.get(f"{history(2)}/{revision_id}").status_code == 404

    client.cookies.clear()
    assert client.get(history()).status_code == 401
    assert client.get(f"{history()}/{revision_id}").status_code == 401


def test_pagination_missing_revision_and_wrong_project_type(game_api):
    client, engine = game_api
    for index in range(3):
        result = client.put(
            url(), json=blueprint(expected_version=index, title=f"Game {index}"),
        )
        assert result.status_code == 200, result.text

    page = client.get(f"{history()}?limit=1&offset=1").json()
    assert page["total"] == 3
    assert page["limit"] == 1
    assert page["offset"] == 1
    assert page["items"][0]["version"] == 2
    assert client.get(f"{history()}?offset=99").json()["items"] == []
    assert client.get(f"{history()}?limit=0").status_code == 422
    assert client.get(f"{history()}?limit=51").status_code == 422
    assert client.get(f"{history()}?offset=-1").status_code == 422
    assert client.get(f"{history()}/999999").status_code == 404

    with Session(engine) as db:
        db.get(GameProject, 1)
        from app.models.project import Project
        db.get(Project, 1).project_type = "music"
        db.commit()
    assert client.get(history()).status_code == 400
    assert client.get(f"{history()}/999999").status_code == 400


def test_restore_snapshot_as_new_save_preserves_history(game_api):
    client, _ = game_api
    assert client.put(url(), json=blueprint()).status_code == 200
    old = client.get(history()).json()["items"][0]
    assert client.put(
        url(), json=blueprint(expected_version=1, title="Different direction"),
    ).status_code == 200

    restored = client.put(
        url(), json={"expected_version": 2, **old["snapshot"]},
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["version"] == 3
    assert restored.json()["title"] == "River explorer"
    assert client.get(history()).json()["total"] == 3
    assert client.get(f"{history()}/{old['id']}").json()["snapshot"] == old["snapshot"]

"""Software blueprint API regression tests using an isolated database."""

import pytest
from sqlalchemy.orm import Session

from test_refinement_tasks import api
from app.models.project import Project
from app.api.v1.software_projects import router


@pytest.fixture
def software_api(api):
    client, engine = api
    # Register on the isolated test app when its fixture omits this router.
    if "/api/v1/projects/{project_id}/software" not in client.app.openapi()["paths"]:
        client.app.include_router(router, prefix="/api/v1")
        client.app.openapi_schema = None
    with Session(engine) as db:
        db.get(Project, 1).project_type = "website"
        db.get(Project, 2).project_type = "app"
        db.commit()
    return client, engine


def url(project_id=1):
    return f"/api/v1/projects/{project_id}/software"


def blueprint(**changes):
    data = {
        "expected_version": 0,
        "title": "Community website",
        "description": "A place to discover local activities.",
        "platform": "web",
        "pages": [
            {
                "id": "home",
                "name": "Home",
                "path": "/",
                "sections": [
                    {
                        "id": "welcome",
                        "kind": "hero",
                        "heading": "Welcome",
                        "content": "Discover your community.",
                    },
                ],
            },
            {"id": "about", "name": "About", "path": "/about", "sections": []},
        ],
        "features": [
            {
                "id": "search",
                "title": "Activity search",
                "description": "Find activities by topic.",
                "priority": "must_have",
            },
        ],
    }
    data.update(changes)
    return data


def test_create_reload_update_reorder_and_noop(software_api):
    client, _ = software_api
    assert client.get(url()).status_code == 404
    first = client.put(url(), json=blueprint())
    assert first.status_code == 200, first.text
    assert first.json()["version"] == 1
    assert client.get(url()).json()["pages"] == blueprint()["pages"]

    pages = list(reversed(blueprint()["pages"]))
    updated = client.put(
        url(), json=blueprint(expected_version=1, pages=pages, title="Updated website"),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == 2
    assert updated.json()["pages"] == pages

    noop = client.put(
        url(), json=blueprint(expected_version=2, pages=pages, title="Updated website"),
    )
    assert noop.status_code == 200, noop.text
    assert noop.json()["version"] == 2


def test_stale_save_and_repeated_creation_preserve_latest(software_api):
    client, _ = software_api
    assert client.put(url(), json=blueprint()).status_code == 200
    assert client.put(url(), json=blueprint(title="Repeated creation")).status_code == 409
    assert client.put(
        url(), json=blueprint(expected_version=1, title="Latest title"),
    ).status_code == 200
    stale = client.put(
        url(), json=blueprint(expected_version=1, title="Stale title"),
    )
    assert stale.status_code == 409
    assert client.get(url()).json()["title"] == "Latest title"
    assert client.get(url()).json()["version"] == 2


def test_ownership_authentication_and_app_support(software_api):
    client, _ = software_api
    assert client.put(url(), json=blueprint()).status_code == 200
    assert client.get(url(2)).status_code == 404
    assert client.put(url(2), json=blueprint()).status_code == 404

    client.cookies.set("indaverse_access_token", "other")
    assert client.get(url()).status_code == 404
    assert client.put(url(), json=blueprint(expected_version=1)).status_code == 404
    app = client.put(url(2), json=blueprint(platform="web_and_mobile"))
    assert app.status_code == 200, app.text
    assert app.json()["platform"] == "web_and_mobile"

    client.cookies.clear()
    assert client.get(url()).status_code == 401
    assert client.put(url(), json=blueprint()).status_code == 401


def test_rejects_other_project_types(software_api):
    client, engine = software_api
    with Session(engine) as db:
        db.get(Project, 1).project_type = "music"
        db.commit()
    assert client.get(url()).status_code == 400
    assert client.put(url(), json=blueprint()).status_code == 400


@pytest.mark.parametrize("changes", [
    {"title": "   "},
    {"expected_version": True},
    {"platform": "desktop"},
    {"pages": [
        {"id": "same", "name": "One", "path": "/"},
        {"id": "same", "name": "Two", "path": "/two"},
    ]},
    {"pages": [
        {"id": "one", "name": "One", "path": "/"},
        {"id": "two", "name": "Two", "path": "/"},
    ]},
    {"pages": [{"id": "home", "name": " ", "path": "/"}]},
    {"pages": [{"id": "home", "name": "Home", "path": "https://example.com"}]},
    {"pages": [{
        "id": "home", "name": "Home", "path": "/",
        "sections": [{"id": "same"}, {"id": "same"}],
    }]},
    {"pages": [{
        "id": "home", "name": "Home", "path": "/",
        "sections": [{"id": "intro", "content": "a" * 10001}],
    }]},
    {"features": [
        {"id": "same", "title": "One"},
        {"id": "same", "title": "Two"},
    ]},
    {"features": [{"id": "one", "title": "   "}]},
    {"unexpected": "field"},
])
def test_invalid_input_does_not_create_blueprint(software_api, changes):
    client, _ = software_api
    result = client.put(url(), json=blueprint(**changes))
    assert result.status_code == 422, result.text
    assert client.get(url()).status_code == 404


def test_invalid_update_preserves_saved_blueprint(software_api):
    client, _ = software_api
    assert client.put(url(), json=blueprint()).status_code == 200
    result = client.put(
        url(), json=blueprint(expected_version=1, title=" "),
    )
    assert result.status_code == 422
    saved = client.get(url()).json()
    assert saved["title"] == "Community website"
    assert saved["version"] == 1

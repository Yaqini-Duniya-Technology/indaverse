from io import BytesIO
import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from zipfile import ZipFile

from PIL import Image
from sqlalchemy.orm import Session

from app.models import GameScene, Project, VideoSequence, VideoSequenceSource
from app.services import creative_pilot
from test_creative_workspace import upload, workspace

BASE = "/api/v1/projects"


def test_static_site_escapes_content_and_links_portably(workspace):
    client, engine = workspace
    with Session(engine) as db:
        db.get(Project, 1).project_type = "website"
        db.commit()
    base = f"{BASE}/1/software"
    data = {"expected_version": 0, "title": "Launch", "pages": [
        {"id": "home", "name": "Home", "path": "/", "nav_label": "Home",
         "seo_title": "Launch & learn", "seo_description": "Our site", "social_title": "Social preview",
         "sections": [{"id": "cta", "content": "<script>bad</script>", "link_path": "/missing"}]},
        {"id": "about", "name": "About", "path": "/team/about", "nav_label": "About", "sections": []},
    ]}
    assert client.put(base, json=data).status_code == 200
    assert "does not match" in client.get(base + "/site-check?version=1").json()["issues"][0]
    assert client.get(base + "/site.zip?version=1").status_code == 422
    data["expected_version"] = 1
    data["pages"][0]["sections"][0]["link_path"] = "/team/about"
    assert client.put(base, json=data).json()["version"] == 2
    assert client.get(base + "/site.zip?version=1").status_code == 409
    result = client.get(base + "/site.zip?version=2")
    assert result.status_code == 200 and result.headers["cache-control"] == "no-store"
    with ZipFile(BytesIO(result.content)) as archive:
        assert sorted(archive.namelist()) == ["index.html", "team/about/index.html"]
        home = archive.read("index.html").decode()
        assert "Launch &amp; learn" in home and 'property="og:title" content="Social preview"' in home
        assert "&lt;script&gt;bad" in home and 'href="team/about/index.html"' in home
        assert 'href="../../index.html"' in archive.read("team/about/index.html").decode()
    client.cookies.set("indaverse_access_token", "2")
    assert client.get(base + "/site.zip?version=2").status_code == 404


def test_playtest_and_versioned_portable_scene(workspace):
    client, engine = workspace
    base = f"{BASE}/1/game"
    with Session(engine) as db:
        db.get(Project, 1).project_type = "game"
        db.commit()
    assert client.put(base, json={"title": "Zamara", "dimension": "3d", "expected_version": 0}).status_code == 200
    layout = json.loads((Path(__file__).resolve().parents[1] / "app/demo/zamara-scene.json").read_text())
    assert client.put(base + "/scene", json={"expected_version": 0, "layout": layout}).status_code == 200
    report = {"scene_version": 1, "gems": 3, "falls": 2, "resets": 1, "checkpoint": False, "completed": True}
    assert client.post(base + "/playtests", json={**report, "gems": 0}).status_code == 422
    result = client.post(base + "/playtests", json={**report, "note": "Keyboard run."})
    assert result.status_code == 201, result.text
    assert client.get(base + "/playtests").json()["items"] == [result.json()]
    response = client.get(base + "/browser-build.html?version=1")
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    assert "village-courtyard" in response.text and 'script src=' not in response.text
    with Session(engine) as db:
        db.get(GameScene, 1).version = 2
        db.commit()
    assert client.post(base + "/playtests", json=report).status_code == 409
    assert client.get(base + "/browser-build.html?version=1").status_code == 409
    client.cookies.set("indaverse_access_token", "2")
    assert client.get(base + "/playtests").status_code == 404


def test_preview_and_derivative_preserve_original_bytes(workspace):
    client, _ = workspace
    asset = upload(client, 1, "Original")
    base = f"{BASE}/1/images/{asset['id']}"
    original = client.get(base + "/content").content
    transform = {"label": "Rotated", "rotation": 90, "crop_width": 8, "crop_height": 4, "max_edge": 4}
    preview = client.post(base + "/derivative-preview", json=transform)
    assert preview.status_code == 200, preview.text
    assert preview.headers["cache-control"] == "no-store"
    assert Image.open(BytesIO(preview.content)).size == (2, 4)
    assert len(client.get(f"{BASE}/1/images").json()["items"]) == 1
    assert client.post(base + "/derivatives", json={**transform, "x": 9}).status_code == 422
    saved = client.post(base + "/derivatives", json=transform)
    assert saved.status_code == 201, saved.text
    copy = saved.json()
    assert copy["id"] != asset["id"]
    assert client.get(f"{BASE}/1/images/{copy['id']}/content").content == preview.content
    assert client.get(base + "/content").content == original
    client.cookies.set("indaverse_access_token", "2")
    assert client.post(base + "/derivative-preview", json=transform).status_code == 404


def test_campaign_handoff_requires_owned_assets_and_saved_version(workspace):
    client, engine = workspace
    image = upload(client, 1, "Own image")
    video = "2" * 32
    with Session(engine) as db:
        db.get(Project, 2).project_type = "video"
        db.add(VideoSequence(project_id=2, clips=[], version=1))
        db.flush()
        db.add(VideoSequenceSource(id=video, project_id=2, name="Trailer", duration_ms=1000, content=b"PRIVATEVIDEO"))
        db.commit()
    base = f"{BASE}/1/campaign"
    post = {"id": "a", "copy": "Launch soon", "channel": "instagram", "status": "ready",
            "scheduled_local": "2026-11-20T09:00", "timezone": "Africa/Lagos", "notes": "Manual review",
            "landing_url": "https://example.test/launch?x=keep&utm_source=old#preview",
            "utm_source": "IndaVerse Studio", "utm_campaign": "launch",
            "assets": [{"kind": "image", "project_id": 1, "id": str(image["id"])},
                       {"kind": "video", "project_id": 2, "id": video}]}
    data = {"version": 0, "name": "Launch campaign", "posts": [post]}
    assert client.put(base, json={**data, "posts": [{**post, "assets": [
        {"kind": "video", "project_id": 3, "id": video}]}]}).status_code == 404
    assert client.put(base, json={**data, "posts": [{**post, "landing_url": "javascript:alert(1)"}]}).status_code == 422
    saved = client.put(base, json=data)
    assert saved.status_code == 200, saved.text
    assert client.get(base).json() == saved.json()
    assert client.put(base, json=data).status_code == 409
    result = client.get(base + "/handoff.json?version=1")
    assert result.status_code == 200 and result.headers["cache-control"] == "no-store"
    assert "PRIVATEVIDEO" not in result.text
    assert result.json()["delivery"] == "manual"
    exported = result.json()["posts"][0]
    assert exported["assets"] == post["assets"]
    assert exported["scheduled_local"] == post["scheduled_local"]
    url = urlsplit(exported["tracked_url"])
    assert url.fragment == "preview"
    assert parse_qs(url.query) == {"x": ["keep"], "utm_source": ["IndaVerse Studio"], "utm_campaign": ["launch"]}


def test_adapter_consent_quota_and_mocked_output(workspace, monkeypatch):
    client, _ = workspace
    base = f"{BASE}/1/creative-pilot"
    prompt = {"provider": "fixture", "prompt": "Launch Zamara", "consent": True}
    calls = []

    class Adapter:
        def suggest(self, brief):
            calls.append(brief)
            return ["x" * 401] if len(calls) == 1 else ["Mock suggestion"]

    monkeypatch.setitem(creative_pilot.ADAPTERS, "fixture", Adapter())
    assert client.post(base, json={**prompt, "consent": False}).status_code == 422
    assert client.post(base, json={**prompt, "provider": "unknown"}).status_code == 422
    assert not calls
    assert client.post(base, json=prompt).status_code == 502
    for remaining in reversed(range(5)):
        result = client.post(base, json=prompt)
        assert result.json()["drafts"] == ["Mock suggestion"]
        assert result.json()["remaining_today"] == remaining
        assert result.json()["review_required"] is True
    assert client.post(base, json=prompt).status_code == 429
    assert len(calls) == 6

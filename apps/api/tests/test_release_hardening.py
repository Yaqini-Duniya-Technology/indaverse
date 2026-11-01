"""Release boundary tests: authentication, media privacy, validation and readiness."""
from pathlib import Path
from unittest.mock import MagicMock

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.orm import Session

from test_refinement_tasks import api
from app.core.config import Settings, settings
from app.core.security import create_access_token, decode_access_token, verify_password
from app.core.http_security import HttpSecurityMiddleware
from app.schemas.auth import UserLogin, UserRegister
from app.schemas.project import ProjectCreate
from app.schemas.creative_brief import CreativeBriefUpdate
from app.schemas.project_plan import PlanCreate, PlanUpdate, PlanReview


def configured(**changes):
    values = dict(database_url="sqlite://", redis_url="redis://localhost/0", secret_key="s" * 48)
    values.update(changes)
    return Settings(_env_file=None, **values)


@pytest.mark.parametrize("changes", [
    {"cors_origins": ["*"]}, {"cors_origins": []},
    {"cors_origins": ["https://app.test/path"]},
    {"cors_origins": ["https://user:pass@app.test"]},
    {"allowed_hosts": ["*"]}, {"allowed_hosts": []},
    {"access_token_expire_minutes": 1}, {"access_token_expire_minutes": 1441},
    {"app_env": "production"},
])
def test_invalid_config(changes):
    with pytest.raises(ValidationError):
        configured(**changes)


def test_production_configuration():
    values = dict(app_env="production", cookie_secure=True, api_url="https://api.test",
        app_url="https://app.test", cors_origins=["https://app.test"], allowed_hosts=["api.test"])
    assert configured(**values).cookie_secure
    with pytest.raises(ValidationError):
        configured(**values, secret_key="REPLACE_WITH_RANDOM_SECRET")


def test_tokens_require_expiry_and_subject():
    assert decode_access_token(create_access_token("1"))["sub"] == "1"
    for payload in ({"sub": "1"}, {"exp": 9999999999}):
        token = jwt.encode(payload, settings.secret_key, algorithm="HS256")
        with pytest.raises(jwt.InvalidTokenError):
            decode_access_token(token)


def test_invalid_password_hash_is_rejected():
    assert verify_password("test-password", "not-a-valid-hash") is False


def test_project_input_normalization():
    data = ProjectCreate(name="  Zamara  ", project_type="game", description="   ")
    assert data.name == "Zamara"
    assert data.description is None


@pytest.mark.parametrize("values", [
    {"name": "   "}, {"description": "a" * 5001}, {"unexpected": True},
])
def test_invalid_project_input(values):
    data = {"name": "Zamara", "project_type": "game", **values}
    with pytest.raises(ValidationError):
        ProjectCreate(**data)


def test_auth_inputs():
    assert UserRegister(email="a@example.com", username="  kairo  ", password="long-pass").username == "kairo"
    for username in ("   ", " a "):
        with pytest.raises(ValidationError):
            UserRegister(email="a@example.com", username=username, password="long-pass")
    for password in ("", "x" * 129):
        with pytest.raises(ValidationError):
            UserLogin(email="a@example.com", password=password)
    with pytest.raises(ValidationError):
        UserLogin(email="a@example.com", password="ok", admin=True)


@pytest.mark.parametrize("model,values", [
    (CreativeBriefUpdate, dict(expected_version=True, goal="", audience="", style="", constraints="")),
    (PlanCreate, dict(expected_brief_version=True)),
    (PlanUpdate, dict(expected_version=True, steps=[{"title": "Step"}])),
    (PlanReview, dict(expected_version=True, expected_brief_version=0)),
])
def test_versions_reject_boolean(model, values):
    with pytest.raises(ValidationError):
        model(**values)


def test_http_boundaries():
    app = FastAPI()
    app.add_middleware(HttpSecurityMiddleware)
    @app.get("/api/test")
    def read():
        return {"ok": True}
    @app.post("/api/test")
    def write():
        return {"ok": True}
    with TestClient(app) as client:
        response = client.get("/api/test")
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-frame-options"] == "DENY"
        assert response.headers["referrer-policy"] == "no-referrer"
        assert len(response.headers["x-request-id"]) == 32
        assert client.get("/api/test").headers["x-request-id"] != response.headers["x-request-id"]
        assert client.post("/api/test", headers={"origin": "https://evil.test"}).status_code == 403
        assert client.post("/api/test", headers={"sec-fetch-site": "cross-site"}).status_code == 403
        assert client.post("/api/test", headers={"origin": settings.cors_origins[0]}).status_code == 200
        assert client.post("/api/test").status_code == 200


def test_audio_privacy_and_upload_cleanup(api, monkeypatch, tmp_path):
    from app.api.v1 import audio_assets as module
    from app.models.audio_asset import AudioAsset
    client, engine = api
    client.app.include_router(module.router, prefix="/api/v1")
    monkeypatch.setattr(module, "UPLOAD_DIR", tmp_path)
    base = "/api/v1/projects/1/audio"
    assert client.post(base, files={"file": ("empty.mp3", b"", "audio/mpeg")}).status_code == 400
    assert not list(tmp_path.iterdir())
    monkeypatch.setattr(module, "MAX_FILE_SIZE", 4)
    assert client.post(base, files={"file": ("large.mp3", b"12345", "audio/mpeg")}).status_code == 413
    assert not list(tmp_path.iterdir())
    monkeypatch.setattr(module, "MAX_FILE_SIZE", 100)
    response = client.post(base, files={"file": ("demo.mp3", b"audio", "audio/mpeg")})
    assert response.status_code == 201, response.text
    asset = response.json()
    assert str(tmp_path) not in asset["file_path"]
    url = f'{base}/{asset["id"]}/content'
    assert client.get(url).content == b"audio"
    assert client.get(url, headers={"range": "bytes=0-1"}).status_code == 206
    assert client.get(base).json()[0]["file_path"] == asset["file_path"]
    client.cookies.set("indaverse_access_token", "other")
    assert client.get(url).status_code == 403
    client.cookies.clear()
    assert client.get(url).status_code == 401
    client.cookies.set("indaverse_access_token", "owner")
    with Session(engine) as db:
        row = db.get(AudioAsset, asset["id"])
        row.stored_filename = "../outside.mp3"
        db.commit()
    assert client.get(url).status_code == 404
    assert client.delete(f'{base}/{asset["id"]}').status_code == 404


def test_project_pagination(api):
    from app.api.v1.projects import router
    client, engine = api
    client.app.include_router(router, prefix="/api/v1")
    response = client.get("/api/v1/projects/page?limit=1")
    assert response.status_code == 200, response.text
    assert len(response.json()["items"]) == 1
    assert response.json()["items"][0]["user_id"] == 1
    assert client.get("/api/v1/projects/page?limit=101").status_code == 422
    assert client.get("/api/v1/projects/page?offset=-1").status_code == 422
    assert client.get("/api/v1/projects/page?project_type=invalid").status_code == 422
    assert client.get("/api/v1/projects/page?search=%25").json()["items"] == []
    assert client.get("/api/v1/projects/page?project_type=game").json()["items"] == []


def test_readiness_does_not_expose_errors(monkeypatch):
    from app.api.v1 import health
    engine = MagicMock()
    engine.connect.side_effect = RuntimeError("private-password")
    redis = MagicMock()
    redis.from_url.side_effect = RuntimeError("private-redis-url")
    monkeypatch.setattr(health, "engine", engine)
    monkeypatch.setattr(health, "Redis", redis)
    response = health.readiness_check()
    assert response.status_code == 503
    assert b"private" not in response.body
    engine.connect.side_effect = None
    redis.from_url.side_effect = None
    assert health.readiness_check().status_code == 200


def test_application_has_no_public_upload_mount():
    from app.main import app
    assert not any(getattr(route, "path", "") == "/uploads" for route in app.routes)


def test_auth_cookie_settings(api, monkeypatch):
    from app.api.v1 import auth
    from app.models.user import User
    client, engine = api
    client.app.include_router(auth.router, prefix="/api/v1")
    monkeypatch.setattr(auth, "verify_password", lambda *args: True)
    monkeypatch.setattr(settings, "cookie_secure", True)
    with Session(engine) as db:
        user = db.get(User, 1)
        user.email = "owner@example.com"
        db.commit()
        email = user.email
    response = client.post("/api/v1/auth/login", json={"email": email, "password": "test"})
    assert response.status_code == 200, response.text
    cookie = response.headers["set-cookie"].lower()
    assert "secure" in cookie and "httponly" in cookie and "samesite=lax" in cookie
    assert f"max-age={settings.access_token_expire_minutes * 60}" in cookie
    deleted = client.post("/api/v1/auth/logout").headers["set-cookie"].lower()
    assert "secure" in deleted and "max-age=0" in deleted
    with Session(engine) as db:
        db.get(User, 1).is_active = False
        db.commit()
    assert client.post("/api/v1/auth/login", json={"email": email, "password": "test"}).status_code == 403


def test_registration_conflict_rolls_back():
    from sqlalchemy.exc import IntegrityError
    from fastapi import HTTPException
    from app.services.auth_service import create_user
    db = MagicMock()
    db.commit.side_effect = IntegrityError("insert", {}, Exception("duplicate"))
    with pytest.raises(HTTPException) as raised:
        create_user(db, UserRegister(email="a@example.com", username="tester", password="long-pass"))
    assert raised.value.status_code == 409
    db.rollback.assert_called_once()


def test_audio_database_failure_cleans_file(api, monkeypatch, tmp_path):
    from app.api.v1 import audio_assets as module
    from app.database.connection import get_db
    client, _ = api
    client.app.include_router(module.router, prefix="/api/v1")
    monkeypatch.setattr(module, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(module, "get_owned_project", lambda *args: None)
    db = MagicMock()
    db.commit.side_effect = RuntimeError("database unavailable")
    # Keep authentication from using the mocked database.
    from app.api.v1.dependencies import get_current_user
    from types import SimpleNamespace
    client.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    client.app.dependency_overrides[get_db] = lambda: db
    with pytest.raises(RuntimeError, match="database unavailable"):
        client.post("/api/v1/projects/1/audio", files={"file": ("demo.mp3", b"audio", "audio/mpeg")})
    db.rollback.assert_called_once()
    assert not list(tmp_path.iterdir())

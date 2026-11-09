from datetime import timedelta
from hashlib import sha256
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.connection import Base, get_db
from app.main import app
from app.models.beta_access import BetaAccess, BetaInvite
from app.services.beta_access import issue_invite, now


PASSWORD = "fixture-pass-only"
EMAIL = "creator@example.com"


@pytest.fixture
def beta_client(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'beta.sqlite'}")
    Base.metadata.create_all(engine)

    def session():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = session
    try:
        with TestClient(app) as client:
            yield client, engine
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()


def register(client, code=None, *, email=EMAIL, username="creator"):
    return client.post("/api/v1/auth/register", json={
        "email": email, "username": username, "password": PASSWORD, "invite_code": code,
    })


def invite(engine, email=EMAIL):
    with Session(engine) as db, db.begin():
        return issue_invite(db, email, 24)


def test_signup_and_existing_session_require_active_grant(beta_client, monkeypatch):
    client, engine = beta_client
    assert client.get("/api/v1/auth/registration-policy").json() == {"invite_required": False}
    assert register(client, email="existing@example.com", username="existing").status_code == 201
    assert client.post("/api/v1/auth/login", json={
        "email": "existing@example.com", "password": PASSWORD,
    }).status_code == 200
    monkeypatch.setattr(settings, "private_beta", True)
    assert client.get("/api/v1/projects").status_code == 403
    assert client.get("/api/v1/auth/registration-policy").json() == {"invite_required": True}
    assert register(client).status_code == 403
    code = invite(engine)
    denied = register(client, code, email="wrong@example.com")
    assert denied.status_code == 403
    assert code not in denied.text
    response = register(client, code)
    assert response.status_code == 201
    assert "invite_code" not in response.json()
    user_id = response.json()["id"]

    assert client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD}).status_code == 200
    assert client.get("/api/v1/projects").status_code == 200
    with Session(engine) as db, db.begin():
        invite_record = db.get(BetaInvite, sha256(code.encode()).hexdigest())
        assert invite_record.redeemed_at is not None
        assert db.get(BetaInvite, code) is None
        db.get(BetaAccess, user_id).revoked_at = now()
    assert client.get("/api/v1/projects").status_code == 403
    assert client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD}).status_code == 403


@pytest.mark.parametrize("field,value", [("expires_at", now() - timedelta(seconds=1)), ("revoked_at", now())])
def test_expired_and_revoked_invites_are_rejected(beta_client, monkeypatch, field, value):
    client, engine = beta_client
    monkeypatch.setattr(settings, "private_beta", True)
    code = invite(engine)
    with Session(engine) as db, db.begin():
        setattr(db.get(BetaInvite, sha256(code.encode()).hexdigest()), field, value)
    assert register(client, code).status_code == 403


def test_concurrent_redemption_has_one_winner(beta_client, monkeypatch):
    client, engine = beta_client
    monkeypatch.setattr(settings, "private_beta", True)
    code = invite(engine)
    barrier = Barrier(2)

    def attempt(username):
        barrier.wait(timeout=5)
        return register(client, code, username=username).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(attempt, ["first", "second"]))
    assert outcomes.count(201) == 1
    assert all(code in (201, 403, 409) for code in outcomes)
    with Session(engine) as db:
        assert db.query(BetaAccess).count() == 1

"""Real concurrent PUTs must serialize on the parent project row."""
import os
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace
from urllib.parse import urlsplit
import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'apps/api'))
URL=os.environ.get('INDAVERSE_PG_TEST_URL','')
pytestmark=pytest.mark.skipif(not URL,reason='Run scripts/test_postgres.py with an explicit local test service.')


def test_concurrent_blueprint_saves_reject_stale_writer():
    parsed=urlsplit(URL)
    assert parsed.hostname in ('127.0.0.1','localhost') and parsed.path.startswith('/indaverse_test_')
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine,select
    from sqlalchemy.orm import Session
    import app.models
    from app.database.connection import Base,get_db
    from app.api.v1.dependencies import get_current_user
    from app.api.v1.game_projects import router
    from app.models.user import User
    from app.models.project import Project
    from app.models.game_project import GameProject
    from app.models.game_revision import GameRevision
    engine=create_engine(URL.replace('postgresql://','postgresql+psycopg://',1),connect_args={'options':'-c lock_timeout=5000 -c statement_timeout=10000'})
    Base.metadata.create_all(engine)
    data=dict(title='Original',dimension='3d',genre='',concept='',core_loop='',controls='',characters=[],levels=[],assets=[])
    try:
        with Session(engine) as db:
            db.add(User(id=1,email='locks@example.com',username='locks',hashed_password='fixture',is_active=True))
            db.flush()
            db.add(Project(id=1,user_id=1,name='Concurrent fixture',project_type='game'))
            db.flush()
            db.add(GameProject(project_id=1,version=1,**data))
            db.commit()
        app=FastAPI()
        app.include_router(router,prefix='/api/v1')
        def isolated():
            with Session(engine) as db: yield db
        app.dependency_overrides[get_db]=isolated
        app.dependency_overrides[get_current_user]=lambda:SimpleNamespace(id=1)
        barrier=Barrier(2)
        def save(title):
            with TestClient(app) as client:
                barrier.wait(timeout=5)
                return client.put('/api/v1/projects/1/game',json={**data,'title':title,'expected_version':1})
        with ThreadPoolExecutor(max_workers=2) as pool:
            first=pool.submit(save,'Writer A')
            second=pool.submit(save,'Writer B')
            responses=[first.result(timeout=20),second.result(timeout=20)]
        assert sorted(response.status_code for response in responses)==[200,409]
        winner=next(response.json()['title'] for response in responses if response.status_code==200)
        with Session(engine) as db:
            saved=db.get(GameProject,1)
            assert saved.version==2 and saved.title==winner
            revisions=list(db.scalars(select(GameRevision).order_by(GameRevision.version)))
            assert [row.version for row in revisions]==[1,2]
            assert revisions[0].snapshot['title']=='Original'
    finally:
        engine.dispose()


def test_video_render_uses_one_version_and_does_not_hold_write_lock(monkeypatch):
    from threading import Event

    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    import app.models
    from app.api.v1 import video_sequence
    from app.api.v1.dependencies import get_current_user
    from app.database.connection import Base, get_db
    from app.models.project import Project
    from app.models.user import User
    from app.models.video_sequence import VideoSequence, VideoSequenceSoundtrack, VideoSequenceSource

    parsed = urlsplit(URL)
    assert parsed.hostname in ("127.0.0.1", "localhost") and parsed.path.startswith("/indaverse_test_")
    engine = create_engine(URL.replace("postgresql://", "postgresql+psycopg://", 1),
                           connect_args={"options": "-c lock_timeout=5000 -c statement_timeout=10000"})
    Base.metadata.create_all(engine)
    source_id = "b" * 32
    cut = {"source_id": source_id, "start_ms": 0, "end_ms": 1000, "title": "Original"}
    music = video_sequence.SoundtrackSettings(start_ms=0, end_ms=1000).model_dump()
    in_renderer, resume_render = Event(), Event()
    captured = []

    def hold_render(_tools, _directory, items, *, soundtrack, **_options):
        captured.append((items, soundtrack))
        in_renderer.set()
        assert resume_render.wait(timeout=15), "Render was not released."
        return b"snapshot fixture"

    monkeypatch.setattr(video_sequence, "available_tools", lambda: ("ffmpeg", "ffprobe"))
    monkeypatch.setattr(video_sequence.export, "render", hold_render)
    app = FastAPI()
    app.include_router(video_sequence.router, prefix="/api/v1")

    def isolated():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = isolated
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=2)
    base = "/api/v1/projects/2/video/sequence"
    barrier = Barrier(2)

    def render(version):
        with TestClient(app) as client:
            return client.post(f"{base}/render?version={version}")

    def save(title, volume):
        with TestClient(app) as client:
            barrier.wait(timeout=5)
            return client.put(base, json={
                "version": 1, "clips": [{**cut, "title": title}],
                "soundtrack_settings": {**music, "volume_percent": volume},
            })

    try:
        with Session(engine) as db:
            db.add(User(id=2, email="video-locks@example.invalid", username="video-locks",
                        hashed_password="fixture", is_active=True))
            db.flush()
            db.add(Project(id=2, user_id=2, name="Video lock fixture", project_type="video"))
            db.flush()
            db.add(VideoSequence(project_id=2, version=1, clips=[cut]))
            db.flush()
            db.add(VideoSequenceSource(id=source_id, project_id=2, name="clip.mp4",
                                       duration_ms=1000, content=b"source fixture"))
            db.add(VideoSequenceSoundtrack(project_id=2, name="music.wav", format="wav",
                                           duration_ms=1000, settings=music, content=b"music fixture"))
            db.commit()
        with ThreadPoolExecutor(max_workers=3) as pool:
            pending_render = pool.submit(render, 1)
            try:
                assert in_renderer.wait(timeout=10)
                a, b = pool.submit(save, "Writer A", 21), pool.submit(save, "Writer B", 83)
                responses = [a.result(timeout=12), b.result(timeout=12)]
                assert sorted(response.status_code for response in responses) == [200, 409]
                winner = next(response.json() for response in responses if response.status_code == 200)
                assert winner["version"] == 2
                assert winner["soundtrack"]["settings"]["volume_percent"] == (
                    21 if winner["clips"][0]["title"] == "Writer A" else 83)
            finally:
                resume_render.set()
            assert pending_render.result(timeout=8).status_code == 200
        assert captured == [([(cut, b"source fixture")], ("wav", music, b"music fixture"))]
        assert render(1).status_code == 409
    finally:
        engine.dispose()

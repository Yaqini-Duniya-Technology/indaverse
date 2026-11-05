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

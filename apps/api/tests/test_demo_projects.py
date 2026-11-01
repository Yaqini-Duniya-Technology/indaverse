from sqlalchemy import func, select
from sqlalchemy.orm import Session
from test_refinement_tasks import api
from app.api.v1.demo_projects import router
from app.models.project import Project
from app.models.game_project import GameProject
from app.models.game_scene import GameScene
from app.models.game_revision import GameRevision


def test_demo_is_private_owned_and_does_not_overwrite(api):
    client, engine = api
    client.app.include_router(router, prefix='/api/v1')
    first = client.post('/api/v1/projects/demo/zamara')
    assert first.status_code == 201
    project = first.json()
    assert project['user_id'] == 1 and project['visibility'] == 'private'
    with Session(engine) as db:
        assert db.get(Project, 1).name == 'Owner project'
        assert db.get(GameProject, project['id']).dimension == '3d'
        assert len(db.get(GameScene, project['id']).layout['collectibles']) == 3
        assert db.scalar(select(func.count()).select_from(GameRevision).where(GameRevision.project_id == project['id'])) == 1
    second = client.post('/api/v1/projects/demo/zamara')
    assert second.status_code == 201 and second.json()['id'] != project['id']
    client.cookies.clear()
    assert client.post('/api/v1/projects/demo/zamara').status_code == 401


def test_demo_rolls_back_if_scene_write_fails(api, monkeypatch):
    import pytest
    from app.services.demo_project import create_zamara_demo
    _, engine = api
    with Session(engine) as db:
        count = db.scalar(select(func.count()).select_from(Project))
        def fail():
            raise RuntimeError('simulated commit failure')
        monkeypatch.setattr(db, 'commit', fail)
        with pytest.raises(RuntimeError):
            create_zamara_demo(db, 1)
        assert db.scalar(select(func.count()).select_from(Project)) == count

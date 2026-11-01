"""Portable imports validate drafts without writing to a studio."""
import pytest
from sqlalchemy.orm import Session
from test_refinement_tasks import api
from app.api.v1.studio_draft_imports import router
from app.models.project import Project
from app.models.story_project import StoryProject
from app.services.studio_draft_import import validate_studio_draft


@pytest.mark.parametrize('studio', ['story', 'video', 'software'])
def test_valid_drafts_keep_entity_ids_and_drop_save_metadata(studio):
    result = validate_studio_draft(studio, {'title': 'Portable', 'project_id': 999, 'expected_version': 77})
    assert result['valid']
    assert 'expected_version' not in result['data']
    assert 'project_id' not in result['data']
    assert result['warnings']


@pytest.mark.parametrize('change', [
    {'format': 'other'}, {'format_version': True}, {'format_version': 2},
    {'studio': 'video'}, {'source_project_id': -1}, {'exported_at': 'bad'},
    {'unknown': 1}, {'data': []}, {'data': {'title': 'A', 'version': 3}},
])
def test_invalid_envelopes(change):
    doc = dict(format='indaverse-studio-draft', format_version=1, studio='story', data={'title': 'A'})
    doc.update(change)
    result = validate_studio_draft('story', doc)
    assert not result['valid'] and result['issues'] and result['data'] is None


def test_entity_validation():
    chapter = {'id': 'chapter_1', 'title': 'First', 'content': 'Text'}
    valid = validate_studio_draft('story', {'title': 'A', 'chapters': [chapter]})
    assert valid['data']['chapters'][0] == chapter
    assert not validate_studio_draft('story', {'title': 'A', 'chapters': [chapter, chapter]})['valid']
    result = validate_studio_draft('software', {'title': 'A', 'pages': [{'id': 'a', 'name': 'Home', 'path': 'bad'}]})
    assert not result['valid'] and 'pages' in result['issues'][0]['field']


def test_endpoint_is_owned_bounded_and_read_only(api):
    client, engine = api
    client.app.include_router(router, prefix='/api/v1')
    with Session(engine) as db:
        db.get(Project, 1).project_type = 'story'
        db.commit()
    url = '/api/v1/projects/1/story/validate-import'
    result = client.post(url, json={'title': 'Imported'}).json()
    assert result['valid']
    with Session(engine) as db:
        assert db.get(StoryProject, 1) is None
    assert client.post(url, content='{').status_code == 400
    assert client.post(url, content='x' * (2 * 1024 * 1024 + 1)).status_code == 413
    assert not client.post(url, json=[]).json()['valid']
    assert client.post('/api/v1/projects/2/story/validate-import', json={'title': 'A'}).status_code == 404
    assert client.post('/api/v1/projects/1/video/validate-import', json={'title': 'A'}).status_code == 400
    client.cookies.clear()
    assert client.post(url, json={'title': 'A'}).status_code == 401


def test_video_import_keeps_only_destination_image_links(api):
    from datetime import datetime
    from app.models.image_asset import ImageAsset
    client, engine = api
    client.app.include_router(router, prefix='/api/v1')
    with Session(engine) as db:
        db.get(Project, 1).project_type = 'video'
        for image_id, project_id in [(1, 1), (2, 2)]:
            db.add(ImageAsset(id=image_id, project_id=project_id, label='Ref', category='reference',
                stored_filename=f'import-{image_id}.png', mime_type='image/png', file_size=20,
                width=10, height=10, created_at=datetime.now()))
        db.commit()
    shots = [{'id': f'shot_{i}', 'title': 'Shot', 'image_id': i} for i in (1, 2, 99)]
    response = client.post('/api/v1/projects/1/video/validate-import', json={'title': 'Storyboard', 'shots': shots})
    assert response.status_code == 200
    result = response.json()
    assert result['valid']
    assert [shot['image_id'] for shot in result['data']['shots']] == [1, None, None]
    assert [shot['id'] for shot in result['data']['shots']] == ['shot_1', 'shot_2', 'shot_99']
    assert any('Removed 2' in warning for warning in result['warnings'])

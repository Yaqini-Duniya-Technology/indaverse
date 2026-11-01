"""Image filtering must preserve ownership and literal-search semantics."""
from datetime import datetime
from sqlalchemy.orm import Session
from test_refinement_tasks import api
from app.models.image_asset import ImageAsset


def test_image_search_category_order_and_pagination(api):
    client, engine = api
    with Session(engine) as db:
        for index, (project, label, category) in enumerate([
            (1, 'Zamara Village', 'scene'), (1, 'Amina', 'character'),
            (1, '100% original', 'reference'), (2, 'Private village', 'scene'),
        ], start=1):
            db.add(ImageAsset(id=index, project_id=project, label=label,
                category=category, stored_filename=f'{index}.png', mime_type='image/png',
                file_size=20, width=10, height=10, created_at=datetime.now()))
        db.commit()
    base = '/api/v1/projects/1/images'
    assert [x['label'] for x in client.get(base + '?sort=label').json()['items']] == ['100% original', 'Amina', 'Zamara Village']
    assert len(client.get(base + '?category=scene').json()['items']) == 1
    assert client.get(base + '?search=village').json()['items'][0]['label'] == 'Zamara Village'
    assert len(client.get(base + '?search=%25').json()['items']) == 1
    assert client.get(base + '?sort=oldest&limit=1').json()['items'][0]['id'] == 1
    assert client.get(base + '?limit=1').json()['has_more'] is True
    assert client.get(base + '?offset=3').json()['items'] == []
    assert client.get(base + '?category=invalid').status_code == 422
    assert client.get(base + '?sort=invalid').status_code == 422
    assert client.get('/api/v1/projects/2/images?search=village').status_code == 404
    client.cookies.clear()
    assert client.get(base).status_code == 401

"""Private project reports, campaign handoffs and the adapter sandbox."""
from datetime import UTC, datetime
import json
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.api.v1.game_projects import owned_game_project
from app.api.v1.game_scenes import require_3d_blueprint
from app.api.v1.image_assets import owned
from app.database.connection import get_db
from app.models.creator_delivery import CreatorDelivery
from app.models.game_scene import GameScene
from app.models.image_asset import ImageAsset
from app.models.user import User
from app.models.video_sequence import VideoSequenceSource
from app.schemas.creator_delivery import CampaignSave, PilotRequest, PlaytestReport
from app.schemas.game_scene import SceneLayout
from app.services import creative_pilot
from app.services.export_response import metered_download
from app.services.playable_scene import build_scene

from app.services.export_response import guard_download_origin

router = APIRouter(prefix="/projects/{project_id}", tags=["Creator Delivery"])


def row_for(db, project_id, kind):
    return db.get(CreatorDelivery, (project_id, kind), populate_existing=True)


def store(db, project_id, kind, row, data):
    if row is None:
        row = CreatorDelivery(project_id=project_id, kind=kind, version=1, data=data)
        db.add(row)
    elif row.data != data:
        row.version += 1
        row.data = data
    version = row.version
    db.commit()
    return version


def saved_scene(db, project_id, version):
    require_3d_blueprint(db, project_id)
    scene = db.get(GameScene, project_id)
    if scene is None or scene.version != version:
        raise HTTPException(409, "Open the latest saved scene and try again.")
    return SceneLayout.model_validate(scene.layout)


@router.get("/game/playtests")
def reports(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owned_game_project(db, project_id, user.id)
    row = row_for(db, project_id, "playtest")
    return {"items": row.data["items"] if row else []}


@router.post("/game/playtests", status_code=201)
def record_report(project_id: int, data: PlaytestReport, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    owned_game_project(db, project_id, user.id, lock=True)
    layout = saved_scene(db, project_id, data.scene_version)
    goal = layout.required_gems if layout.required_gems is not None else len(layout.collectibles)
    if (data.gems > len(layout.collectibles) or (data.completed and data.gems < goal)
            or (data.checkpoint and layout.checkpoint is None)):
        raise HTTPException(422, "Playtest results do not match the saved objective.")
    row = row_for(db, project_id, "playtest")
    result = {**data.model_dump(), "required_gems": goal, "id": uuid4().hex,
              "saved_at": datetime.now(UTC).isoformat()}
    store(db, project_id, "playtest", row, {"items": [result, *(row.data["items"] if row else [])][:30]})
    return result


@router.get("/game/browser-build.html", dependencies=[Depends(guard_download_origin)])
def game_download(project_id: int, version: int, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    owned_game_project(db, project_id, user.id)
    layout = saved_scene(db, project_id, version)
    return metered_download(db, user.id, build_scene(layout), media_type="text/html", filename=f"indaverse-playable-v{version}.html")


def check_assets(db, user_id, posts):
    projects, assets = set(), set()
    for post in posts:
        for asset in post["assets"]:
            key = (asset["kind"], asset["project_id"], asset["id"])
            if key in assets:
                continue
            if asset["project_id"] not in projects:
                owned(db, asset["project_id"], user_id)
                projects.add(asset["project_id"])
            obj = (db.get(ImageAsset, int(asset["id"])) if asset["kind"] == "image"
                   else db.get(VideoSequenceSource, asset["id"]))
            if obj is None or obj.project_id != asset["project_id"]:
                raise HTTPException(422, "A referenced asset is no longer available in its project.")
            assets.add(key)


def tracked_url(post):
    if not post["landing_url"]:
        return ""
    url = urlsplit(post["landing_url"])
    tracking = {key: post[key] for key in ("utm_source", "utm_medium", "utm_campaign") if post[key]}
    query = [(key, value) for key, value in parse_qsl(url.query, keep_blank_values=True) if key not in tracking]
    query.extend(tracking.items())
    return urlunsplit((url.scheme, url.netloc, url.path, urlencode(query), url.fragment))


@router.get("/campaign")
def get_campaign(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = owned(db, project_id, user.id)
    row = row_for(db, project_id, "campaign")
    return {"version": row.version, **row.data} if row else {"version": 0, "name": project.name, "posts": []}


@router.put("/campaign")
def save_campaign(project_id: int, data: CampaignSave, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    owned(db, project_id, user.id, lock=True)
    row = row_for(db, project_id, "campaign")
    if data.version != (row.version if row else 0):
        raise HTTPException(409, "The campaign changed in another tab. Reload before saving.")
    payload = data.model_dump(exclude={"version"}, by_alias=True)
    check_assets(db, user.id, payload["posts"])
    return {"version": store(db, project_id, "campaign", row, payload), **payload}


@router.get("/campaign/handoff.json", dependencies=[Depends(guard_download_origin)])
def campaign_handoff(project_id: int, version: int, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    owned(db, project_id, user.id)
    row = row_for(db, project_id, "campaign")
    if row is None or row.version != version:
        raise HTTPException(409, "Reload the saved campaign before exporting.")
    check_assets(db, user.id, row.data["posts"])
    posts = [{**post, "tracked_url": tracked_url(post)} for post in row.data["posts"]]
    payload = {"schema_version": 1, "name": row.data["name"], "campaign_version": row.version,
               "posts": posts, "delivery": "manual", "assets": "Private references only; no media included."}
    return metered_download(db, user.id, (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode(),
                            media_type="application/json", filename=f"campaign-v{version}.json")


@router.post("/creative-pilot")
def run_pilot(project_id: int, data: PilotRequest, user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    owned(db, project_id, user.id, lock=True)
    day = datetime.now(UTC).date().isoformat()
    row = row_for(db, project_id, "pilot")
    used = row.data["used"] if row and row.data["day"] == day else 0
    if used >= creative_pilot.DAILY_LIMIT:
        raise HTTPException(429, "This project has reached its daily sandbox limit.")
    try:
        drafts = creative_pilot.review_drafts(data.provider, data.prompt)
    except ValueError as exc:
        raise HTTPException(502, "The adapter did not return a usable draft.") from exc
    store(db, project_id, "pilot", row, {"day": day, "used": used + 1})
    return {"provider": data.provider, "mode": "local_fixture", "review_required": True,
            "remaining_today": creative_pilot.DAILY_LIMIT - used - 1, "drafts": drafts}

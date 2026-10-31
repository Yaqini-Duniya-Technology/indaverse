from copy import deepcopy

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.database.connection import get_db
from app.models.game_project import GameProject
from app.models.game_revision import GameRevision
from app.models.image_asset import ImageAsset
from app.models.project import Project
from app.models.user import User
from app.schemas.game_project import GameCharacter, GameLevel, GameResponse, GameSave
from app.schemas.game_revision import GameRevisionPage, GameRevisionResponse


router = APIRouter(prefix="/projects/{project_id}/game", tags=["Game Studio"])


def owned_game_project(db: Session, project_id: int, user_id: int, lock=False):
    query = select(Project).where(
        Project.id == project_id, Project.user_id == user_id,
    ).execution_options(populate_existing=True)
    if lock:
        query = query.with_for_update()
    project = db.scalar(query)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    if project.project_type != "game":
        raise HTTPException(status_code=400, detail="Open Game Studio from a game project.")
    return project


def record_revision(db: Session, draft: GameProject, reason: str) -> None:
    fields = (
        "title", "dimension", "genre", "concept", "core_loop", "controls",
        "characters", "levels", "assets",
    )
    db.add(GameRevision(
        project_id=draft.project_id,
        version=draft.version,
        reason=reason,
        snapshot=deepcopy({field: getattr(draft, field) for field in fields}),
    ))


@router.get("", response_model=GameResponse)
def get_game(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_game_project(db, project_id, user.id)
    draft = db.get(GameProject, project_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="No game blueprint saved yet.")
    return draft


@router.put("", response_model=GameResponse)
def save_game(
    project_id: int,
    data: GameSave,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        owned_game_project(db, project_id, user.id, lock=True)
        draft = db.get(GameProject, project_id, populate_existing=True)
        current_version = draft.version if draft is not None else 0
        if data.expected_version != current_version:
            raise HTTPException(
                status_code=409,
                detail="This game blueprint changed in another tab. Your draft was not saved. Export it before loading the latest blueprint.",
            )
        requested = {
            item.image_id
            for item in [*data.characters, *data.levels]
            if item.image_id is not None
        }
        if requested:
            available = set(db.scalars(
                select(ImageAsset.id).where(
                    ImageAsset.project_id == project_id,
                    ImageAsset.id.in_(requested),
                )
            ).all())
            if requested != available:
                raise HTTPException(
                    status_code=400,
                    detail="A game image is unavailable or belongs to another project. Remove its link before saving.",
                )

        values = data.model_dump(exclude={"expected_version"})
        # Normalize legacy JSON without rewriting it during a no-op save.
        current = None
        if draft is not None:
            current = {
                field: getattr(draft, field) for field in values
            }
            current["characters"] = [
                GameCharacter.model_validate(item).model_dump()
                for item in draft.characters
            ]
            current["levels"] = [
                GameLevel.model_validate(item).model_dump()
                for item in draft.levels
            ]
        if draft is None:
            draft = GameProject(project_id=project_id, version=1, **values)
            db.add(draft)
            record_revision(db, draft, "created")
        elif current != values:
            existing = db.scalar(
                select(GameRevision.id).where(
                    GameRevision.project_id == project_id,
                    GameRevision.version == draft.version,
                )
            )
            if existing is None:
                record_revision(db, draft, "baseline")
            for field, value in values.items():
                setattr(draft, field, value)
            draft.version += 1
            record_revision(db, draft, "saved")
        db.commit()
        db.refresh(draft)
        return draft
    except Exception:
        db.rollback()
        raise


@router.get("/revisions", response_model=GameRevisionPage)
def list_game_revisions(
    project_id: int,
    limit: int = Query(default=10, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_game_project(db, project_id, user.id)
    total = db.scalar(
        select(func.count()).select_from(GameRevision)
        .where(GameRevision.project_id == project_id)
    ) or 0
    items = db.scalars(
        select(GameRevision)
        .where(GameRevision.project_id == project_id)
        .order_by(GameRevision.version.desc(), GameRevision.id.desc())
        .offset(offset).limit(limit)
    ).all()
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/revisions/{revision_id}", response_model=GameRevisionResponse)
def get_game_revision(
    project_id: int,
    revision_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_game_project(db, project_id, user.id)
    revision = db.scalar(
        select(GameRevision).where(
            GameRevision.id == revision_id,
            GameRevision.project_id == project_id,
        )
    )
    if revision is None:
        raise HTTPException(status_code=404, detail="Game revision not found.")
    return revision



@router.post("/validate-import")
def validate_game_blueprint_import(
    project_id: int,
    document: dict = Body(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.game_blueprint_import import validate_import

    owned_game_project(db, project_id, user.id)
    result = validate_import(document)
    if not result["valid"]:
        return result

    # Image files are not embedded in blueprint exports.
    # Keep only image references accessible within the destination project.
    data = result["data"]
    requested = {
        item["image_id"]
        for collection in ("characters", "levels")
        for item in data[collection]
        if item.get("image_id") is not None
    }
    available = set()
    if requested:
        available = set(db.scalars(
            select(ImageAsset.id).where(
                ImageAsset.project_id == project_id,
                ImageAsset.id.in_(requested),
            )
        ).all())

    for collection in ("characters", "levels"):
        for index, item in enumerate(data[collection]):
            image_id = item.get("image_id")
            if image_id is not None and image_id not in available:
                item["image_id"] = None
                result["warnings"].append(
                    f"{collection}[{index}].image_id: image reference removed "
                    "from the import preview because it is unavailable in this project. "
                    "Upload or select an image after importing."
                )

    return result

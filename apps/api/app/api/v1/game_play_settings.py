from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.api.v1.game_projects import owned_game_project
from app.database.connection import get_db
from app.models.game_project import GameProject
from app.models.game_play_settings import GamePlaySettings
from app.models.user import User
from app.schemas.game_play_settings import PlaySettingsResponse, PlaySettingsSave


router = APIRouter(
    prefix="/projects/{project_id}/game/play-settings",
    tags=["Game Play Settings"],
)


def require_2d_blueprint(db: Session, project_id: int):
    game = db.get(GameProject, project_id, populate_existing=True)
    if game is None:
        raise HTTPException(status_code=400, detail="Save a game blueprint first.")
    if game.dimension != "2d":
        raise HTTPException(status_code=400, detail="Playable settings currently support 2D games only.")


@router.get("", response_model=PlaySettingsResponse)
def get_play_settings(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_game_project(db, project_id, user.id)
    require_2d_blueprint(db, project_id)
    saved = db.get(GamePlaySettings, project_id)
    if saved is None:
        raise HTTPException(status_code=404, detail="No playable level settings saved yet.")
    return saved


@router.put("", response_model=PlaySettingsResponse)
def save_play_settings(
    project_id: int,
    data: PlaySettingsSave,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        owned_game_project(db, project_id, user.id, lock=True)
        require_2d_blueprint(db, project_id)
        saved = db.get(GamePlaySettings, project_id, populate_existing=True)
        current_version = saved.version if saved is not None else 0
        if data.expected_version != current_version:
            raise HTTPException(
                status_code=409,
                detail="The playable settings changed in another tab. Your draft was not saved.",
            )
        layout = data.layout.model_dump()
        if saved is None:
            saved = GamePlaySettings(project_id=project_id, layout=layout, version=1)
            db.add(saved)
        elif layout != saved.layout:
            saved.layout = layout
            saved.version += 1
        db.commit()
        db.refresh(saved)
        return saved
    except Exception:
        db.rollback()
        raise

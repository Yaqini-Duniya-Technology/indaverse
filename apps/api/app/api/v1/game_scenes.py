from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.api.v1.game_projects import owned_game_project
from app.database.connection import get_db
from app.models.game_project import GameProject
from app.models.game_scene import GameScene
from app.models.user import User
from app.schemas.game_scene import SceneLayout, SceneResponse, SceneSave


router = APIRouter(
    prefix="/projects/{project_id}/game/scene",
    tags=["3D Game Scenes"],
)


def require_3d_blueprint(db: Session, project_id: int):
    game = db.get(GameProject, project_id, populate_existing=True)
    if game is None:
        raise HTTPException(status_code=400, detail="Save a game blueprint first.")
    if game.dimension != "3d":
        raise HTTPException(
            status_code=400,
            detail="Open the 3D scene editor from a saved 3D game blueprint.",
        )


@router.get("", response_model=SceneResponse)
def get_scene(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_game_project(db, project_id, user.id)
    require_3d_blueprint(db, project_id)
    scene = db.get(GameScene, project_id)
    if scene is None:
        raise HTTPException(status_code=404, detail="No 3D scene saved yet.")
    return scene


@router.put("", response_model=SceneResponse)
def save_scene(
    project_id: int,
    data: SceneSave,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        owned_game_project(db, project_id, user.id, lock=True)
        require_3d_blueprint(db, project_id)
        scene = db.get(GameScene, project_id, populate_existing=True)
        version = scene.version if scene is not None else 0

        if data.expected_version != version:
            raise HTTPException(
                status_code=409,
                detail="The 3D scene changed in another tab. Your draft was not saved.",
            )

        layout = data.layout.model_dump()
        if scene is None:
            scene = GameScene(project_id=project_id, layout=layout, version=1)
            db.add(scene)
        elif scene.layout != layout:
            scene.layout = layout
            scene.version += 1

        db.commit()
        db.refresh(scene)
        return scene
    except Exception:
        db.rollback()
        raise


@router.post("/validate", response_model=SceneLayout)
def validate_scene_recovery(
    project_id: int,
    data: SceneLayout,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_game_project(db, project_id, user.id)
    require_3d_blueprint(db, project_id)
    return data

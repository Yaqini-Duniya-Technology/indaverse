"""Create a new private example, never alter an existing project."""
import json
from pathlib import Path
from sqlalchemy.orm import Session
from app.models.project import Project
from app.models.game_project import GameProject
from app.models.game_scene import GameScene
from app.models.game_revision import GameRevision
from app.schemas.game_project import GameSave
from app.schemas.game_scene import SceneLayout

DEMO_DIR = Path(__file__).resolve().parents[1] / "demo"


def create_zamara_demo(db: Session, user_id: int) -> Project:
    blueprint = GameSave.model_validate({
        **json.loads((DEMO_DIR / "zamara-blueprint.json").read_text()), "expected_version": 0,
    }).model_dump(exclude={"expected_version"})
    scene = SceneLayout.model_validate(json.loads((DEMO_DIR / "zamara-scene.json").read_text())).model_dump()
    try:
        project = Project(
            user_id=user_id, name="Legends of Zamara — demo", project_type="game", visibility="private",
            description="Curated design example and a separate three-gem courtyard prototype. No AI assets or quests are generated.",
            brief_goal="Test movement, collect three beacon fragments and reach the courtyard exit.",
            brief_audience="Creators exploring the IndaVerse prototype workflow.",
            brief_style="A hopeful fictional West African-inspired adventure design.",
            brief_constraints="Browser prototype only. No dialogue, quests, generated models or complete game export.", brief_version=1,
        )
        db.add(project)
        db.flush()
        db.add(GameProject(project_id=project.id, version=1, **blueprint))
        db.add(GameScene(project_id=project.id, layout=scene, version=1))
        db.add(GameRevision(project_id=project.id, version=1, reason="created", snapshot=blueprint))
        db.commit()
        db.refresh(project)
        return project
    except Exception:
        db.rollback()
        raise

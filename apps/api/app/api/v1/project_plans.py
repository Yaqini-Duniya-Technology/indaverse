from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.database.connection import get_db
from app.models.project import Project
from app.models.project_plan import ProjectPlan
from app.models.audio_asset import AudioAsset
from app.models.music_revision import MusicRevision
from app.models.image_asset import ImageAsset
from app.models.video_revision import VideoRevision
from typing import Literal
from app.models.user import User
from app.schemas.project_plan import PlanCreate, PlanResponse, PlanUpdate, PlanReview
from app.services.project_planning import build_steps, snapshot

router = APIRouter(prefix="/projects/{project_id}/plan", tags=["Project Plans"])

ASSET_MODELS = {
    "audio": AudioAsset,
    "song_revision": MusicRevision,
    "image": ImageAsset,
    "video_revision": VideoRevision,
}



def owned_project(db: Session, project_id: int, user_id: int, lock=False):
    query = select(Project).where(
        Project.id == project_id, Project.user_id == user_id,
    ).execution_options(populate_existing=True)
    if lock:
        query = query.with_for_update()
    project = db.scalar(query)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


def response(plan: ProjectPlan, project: Project) -> PlanResponse:
    return PlanResponse(
        project_id=plan.project_id,
        version=plan.version,
        brief_version=plan.brief_version,
        current_brief_version=project.brief_version,
        stale=plan.brief_version != project.brief_version,
        planner=plan.planner,
        brief_snapshot=plan.brief_snapshot,
        steps=plan.steps,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


@router.get("", response_model=PlanResponse)
def get_plan(
    project_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = owned_project(db, project_id, user.id)
    plan = db.get(ProjectPlan, project_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Project plan not found.")
    return response(plan, project)


@router.post("", response_model=PlanResponse, status_code=201)
def create_plan(
    project_id: int,
    data: PlanCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        project = owned_project(db, project_id, user.id, lock=True)
        if db.get(ProjectPlan, project_id) is not None:
            raise HTTPException(status_code=409, detail="A plan already exists. Load it to continue.")
        if project.brief_version != data.expected_brief_version:
            raise HTTPException(status_code=409, detail="The brief changed. Load the latest brief before creating a plan.")
        if not (project.brief_goal or "").strip():
            raise HTTPException(status_code=400, detail="Save a creative goal in the brief before creating a plan.")
        plan = ProjectPlan(
            project_id=project_id,
            version=1,
            brief_version=project.brief_version,
            brief_snapshot=snapshot(project),
            planner="template-v1",
            steps=build_steps(project),
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)
        return response(plan, project)
    except Exception:
        db.rollback()
        raise


@router.put("", response_model=PlanResponse)
def save_plan(
    project_id: int,
    data: PlanUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        project = owned_project(db, project_id, user.id, lock=True)
        plan = db.get(ProjectPlan, project_id, populate_existing=True)
        if plan is None:
            raise HTTPException(status_code=404, detail="Project plan not found.")
        if plan.version != data.expected_version:
            raise HTTPException(status_code=409, detail="The plan changed in another tab. Your draft has not been saved.")
        for kind, model in ASSET_MODELS.items():
            requested = {
                asset.id for step in data.steps for asset in step.assets
                if asset.kind == kind
            }
            if requested:
                available = set(db.scalars(
                    select(model.id).where(
                        model.project_id == project_id,
                        model.id.in_(requested),
                    )
                ).all())
                if requested != available:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "A linked asset is unavailable or belongs to another project. "
                            "Remove the unavailable link before saving."
                        ),
                    )
        steps = [step.model_dump() for step in data.steps]
        if steps != plan.steps:
            plan.steps = steps
            plan.version += 1
        db.commit()
        db.refresh(plan)
        return response(plan, project)
    except Exception:
        db.rollback()
        raise


@router.post("/review", response_model=PlanResponse)
def review_plan(
    project_id: int,
    data: PlanReview,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        project = owned_project(db, project_id, user.id, lock=True)
        plan = db.get(ProjectPlan, project_id, populate_existing=True)
        if plan is None:
            raise HTTPException(status_code=404, detail="Project plan not found.")
        if plan.version != data.expected_version:
            raise HTTPException(
                status_code=409,
                detail="The plan changed in another tab. Load the saved plan before reviewing.",
            )
        if project.brief_version != data.expected_brief_version:
            raise HTTPException(
                status_code=409,
                detail="The brief changed during review. Refresh and compare the latest brief.",
            )

        if plan.brief_version != project.brief_version:
            plan.brief_snapshot = snapshot(project)
            plan.brief_version = project.brief_version
            plan.version += 1

        db.commit()
        db.refresh(plan)
        return response(plan, project)
    except Exception:
        db.rollback()
        raise


def asset_label(kind, asset):
    if kind == "audio":
        return asset.original_filename
    if kind == "image":
        return asset.label
    title = asset.snapshot.get("title") or "Untitled"
    if kind == "video_revision":
        return f"Video version {asset.version}: {title}"
    return f"Song revision #{asset.id}: {title} ({asset.reason})"


@router.get("/assets")
def list_plan_assets(
    project_id: int,
    kind: Literal["audio", "song_revision", "image", "video_revision"],
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_project(db, project_id, user.id)
    model = ASSET_MODELS[kind]
    rows = db.scalars(
        select(model)
        .where(model.project_id == project_id)
        .order_by(model.id.desc())
        .offset(offset)
        .limit(limit + 1)
    ).all()
    return {
        "items": [
            {
                "kind": kind,
                "id": row.id,
                "label": asset_label(kind, row),
                "created_at": row.created_at,
            }
            for row in rows[:limit]
        ],
        "has_more": len(rows) > limit,
        "limit": limit,
        "offset": offset,
    }


@router.get("/assets/{kind}/{asset_id}")
def get_plan_asset_detail(
    project_id: int,
    kind: Literal["audio", "song_revision", "image", "video_revision"],
    asset_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_project(db, project_id, user.id)
    model = ASSET_MODELS[kind]
    asset = db.scalar(
        select(model).where(model.id == asset_id, model.project_id == project_id)
    )
    if asset is None:
        raise HTTPException(status_code=404, detail="Linked asset is no longer available.")

    if kind in {"audio", "image"}:
        if kind == "audio":
            from app.api.v1.audio_assets import UPLOAD_DIR
        else:
            from app.api.v1.image_assets import UPLOAD_DIR

        root = UPLOAD_DIR.resolve()
        stored = (root / asset.stored_filename).resolve()
        available = stored.is_relative_to(root) and stored.is_file()
        return {
            "kind": kind,
            "id": asset.id,
            "label": asset_label(kind, asset),
            "created_at": asset.created_at,
            "available": available,
            "file_size": getattr(asset, "file_size", None),
            "snapshot": None,
        }

    return {
        "kind": kind,
        "id": asset.id,
        "label": asset_label(kind, asset),
        "created_at": asset.created_at,
        "available": True,
        "file_size": None,
        "snapshot": asset.snapshot,
    }


# Reviews record human feedback against an exact saved plan.
from copy import deepcopy
from app.models.project_review import ProjectReview
from app.schemas.project_review import ReviewCreate, ReviewPage, ReviewResponse


@router.post("/reviews", response_model=ReviewResponse, status_code=201)
def create_project_review(
    project_id: int,
    data: ReviewCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        project = owned_project(db, project_id, user.id, lock=True)
        plan = db.get(ProjectPlan, project_id, populate_existing=True)
        if plan is None:
            raise HTTPException(status_code=404, detail="Project plan not found.")
        if (
            plan.version != data.expected_plan_version
            or project.brief_version != data.expected_brief_version
        ):
            raise HTTPException(
                status_code=409,
                detail="The saved plan or brief changed. Your feedback was not saved. Load the latest plan and compare before submitting again.",
            )
        if plan.brief_version != project.brief_version:
            raise HTTPException(
                status_code=409,
                detail="Review the plan against the latest brief before recording feedback.",
            )
        if any(item.step_number > len(plan.steps) for item in data.step_feedback):
            raise HTTPException(status_code=400, detail="Feedback refers to an unknown step.")

        review = ProjectReview(
            project_id=project_id,
            reviewer_id=user.id,
            plan_version=plan.version,
            brief_version=project.brief_version,
            decision=data.decision,
            summary=data.summary,
            step_feedback=[item.model_dump() for item in data.step_feedback],
            plan_snapshot=deepcopy({
                "brief": plan.brief_snapshot,
                "steps": plan.steps,
            }),
        )
        db.add(review)
        db.commit()
        db.refresh(review)
        return review
    except Exception:
        db.rollback()
        raise


@router.get("/reviews", response_model=ReviewPage)
def list_project_reviews(
    project_id: int,
    limit: int = Query(default=10, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_project(db, project_id, user.id)
    rows = db.scalars(
        select(ProjectReview)
        .where(ProjectReview.project_id == project_id)
        .order_by(ProjectReview.id.desc())
        .offset(offset)
        .limit(limit + 1)
    ).all()
    return {
        "items": rows[:limit],
        "has_more": len(rows) > limit,
        "limit": limit,
        "offset": offset,
    }

from app.models.refinement_task import RefinementTask
from app.schemas.refinement_task import (
    RefinementTaskPage,
    RefinementTaskResponse,
    RefinementTaskUpdate,
)


@router.post("/reviews/{review_id}/tasks", response_model=list[RefinementTaskResponse])
def create_review_tasks(
    project_id: int,
    review_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create missing tasks once per feedback source, including on retries."""
    try:
        owned_project(db, project_id, user.id, lock=True)
        review = db.scalar(
            select(ProjectReview).where(
                ProjectReview.id == review_id,
                ProjectReview.project_id == project_id,
            )
        )
        if review is None:
            raise HTTPException(status_code=404, detail="Review not found.")
        if review.decision != "needs_changes":
            raise HTTPException(
                status_code=400,
                detail="Refinement tasks can be created from a needs-changes review.",
            )

        existing = set(db.scalars(
            select(RefinementTask.source_number).where(
                RefinementTask.project_id == project_id,
                RefinementTask.review_id == review_id,
            )
        ).all())
        sources = [(0, "Review overall feedback", review.summary)]
        for feedback in review.step_feedback:
            number = feedback["step_number"]
            saved_step = review.plan_snapshot["steps"][number - 1]
            sources.append((
                number,
                f"Refine step {number}: {saved_step['title']}",
                feedback["note"],
            ))

        for number, title, feedback in sources:
            if number not in existing:
                db.add(RefinementTask(
                    project_id=project_id,
                    review_id=review_id,
                    source_number=number,
                    title=title,
                    source_feedback=feedback,
                    status="todo",
                    resolution="",
                    version=1,
                ))
        db.commit()
        return list(db.scalars(
            select(RefinementTask)
            .where(
                RefinementTask.project_id == project_id,
                RefinementTask.review_id == review_id,
            )
            .order_by(RefinementTask.source_number)
        ).all())
    except Exception:
        db.rollback()
        raise


@router.get("/tasks", response_model=RefinementTaskPage)
def list_refinement_tasks(
    project_id: int,
    review_id: int | None = Query(default=None, ge=1),
    task_status: Literal["open", "todo", "in_progress", "done"] | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_project(db, project_id, user.id)
    query = select(RefinementTask).where(RefinementTask.project_id == project_id)
    if review_id is not None:
        query = query.where(RefinementTask.review_id == review_id)
    if task_status == "open":
        query = query.where(RefinementTask.status.in_(("todo", "in_progress")))
    elif task_status is not None:
        query = query.where(RefinementTask.status == task_status)
    rows = db.scalars(
        query.order_by(RefinementTask.id.desc()).offset(offset).limit(limit + 1)
    ).all()
    return {
        "items": rows[:limit],
        "has_more": len(rows) > limit,
        "limit": limit,
        "offset": offset,
    }


@router.patch("/tasks/{task_id}", response_model=RefinementTaskResponse)
def update_refinement_task(
    project_id: int,
    task_id: int,
    data: RefinementTaskUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        owned_project(db, project_id, user.id, lock=True)
        task = db.scalar(
            select(RefinementTask)
            .where(
                RefinementTask.id == task_id,
                RefinementTask.project_id == project_id,
            )
            .execution_options(populate_existing=True)
        )
        if task is None:
            raise HTTPException(status_code=404, detail="Refinement task not found.")
        if task.version != data.expected_version:
            raise HTTPException(
                status_code=409,
                detail="This task changed in another tab. Your changes were not saved.",
            )
        if data.status == "done" and not data.resolution:
            raise HTTPException(
                status_code=400,
                detail="Describe what you changed before marking the task done.",
            )
        # Omitted evidence preserves links from newer clients.
        evidence = task.evidence
        if "evidence" in data.model_fields_set:
            evidence = [item.model_dump() for item in data.evidence]
            for kind, model in ASSET_MODELS.items():
                requested = {
                    item["id"] for item in evidence if item["kind"] == kind
                }
                if requested:
                    available = set(db.scalars(
                        select(model.id).where(
                            model.project_id == project_id,
                            model.id.in_(requested),
                        )
                    ).all())
                    if requested != available:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                "Evidence is unavailable or belongs to another project. "
                                "Remove the unavailable link before saving."
                            ),
                        )

        if (
            task.status != data.status
            or task.resolution != data.resolution
            or task.evidence != evidence
        ):
            task.status = data.status
            task.resolution = data.resolution
            task.evidence = evidence
            task.version += 1
        db.commit()
        db.refresh(task)
        return task
    except Exception:
        db.rollback()
        raise

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.v1.dependencies import get_current_user
from app.database.connection import get_db
from app.models.user import User
from app.schemas.project import ProjectResponse
from app.services.demo_project import create_zamara_demo

router = APIRouter(prefix="/projects/demo", tags=["Demo projects"])


@router.post("/zamara", response_model=ProjectResponse, status_code=201)
def create_demo(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return create_zamara_demo(db, user.id)

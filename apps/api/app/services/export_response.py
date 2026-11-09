"""Download contract for private, generated exports."""
import re

from fastapi import HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.credits import record_download


def private_download(content: bytes, *, media_type: str, filename: str) -> Response:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}", filename):
        raise ValueError("Invalid export filename")
    return Response(content, media_type=media_type, headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    })

def metered_download(db: Session, user_id: int, content: bytes, *, media_type: str, filename: str,
                     premium: bool = False, edge: int | None = None) -> Response:
    response = private_download(content, media_type=media_type, filename=filename)
    record_download(db, user_id, premium=premium, edge=edge)
    return response

def guard_download_origin(request: Request):
    """Legacy GET exports consume quota; prevent other sites consuming it via navigation."""
    if not settings.credit_enforcement:
        return
    origin = request.headers.get("origin")
    if origin in settings.cors_origins:
        return
    if origin or request.headers.get("sec-fetch-site") in {"same-site", "cross-site"}:
        raise HTTPException(403, "Open the export from the IndaVerse workspace.")

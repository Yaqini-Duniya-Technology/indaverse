"""Security headers and cookie-write origin checks; no request bodies are logged."""
from uuid import uuid4
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.core.config import settings


class HttpSecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = uuid4().hex
        request.state.request_id = request_id
        origin = request.headers.get("origin")
        writing = request.method not in {"GET", "HEAD", "OPTIONS"}
        # Non-browser clients may omit Origin; browsers also supply Fetch Metadata.
        foreign = origin is not None and origin not in settings.cors_origins
        cross_site = request.headers.get("sec-fetch-site") == "cross-site" and origin is None
        if writing and (foreign or cross_site):
            response = JSONResponse({"detail": "This request origin is not allowed."}, status_code=403)
        else:
            response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

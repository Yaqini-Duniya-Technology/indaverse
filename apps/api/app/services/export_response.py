"""Download contract for private, generated exports."""
import re

from fastapi import Response


def private_download(content: bytes, *, media_type: str, filename: str) -> Response:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}", filename):
        raise ValueError("Invalid export filename")
    return Response(content, media_type=media_type, headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    })

"""Validate portable game blueprints without saving database records."""

from pydantic import ValidationError

from app.schemas.game_project import GameSave


FIELDS = {
    "title", "dimension", "genre", "concept", "core_loop", "controls",
    "characters", "levels", "assets",
}
LEGACY_METADATA = {"project_id", "expected_version"}
FORMAT = "indaverse-game-blueprint"


def invalid(field: str, message: str) -> dict:
    return {
        "valid": False,
        "data": None,
        "issues": [{"field": field, "message": message}],
        "warnings": [],
    }


def field_path(location) -> str:
    result = ""
    for part in location:
        if isinstance(part, int):
            result += f"[{part}]"
        else:
            result += ("." if result else "") + str(part)
    return result or "blueprint"


def validate_import(document: dict) -> dict:
    if "format" in document:
        if document.get("format") != FORMAT:
            return invalid("format", "This is not an IndaVerse game blueprint export.")
        if type(document.get("format_version")) is not int or document["format_version"] != 1:
            return invalid("format_version", "This export format version is not supported.")
        unknown = set(document) - {
            "format", "format_version", "source_project_id", "exported_at", "blueprint",
        }
        if unknown:
            return invalid("document", f"Unexpected export fields: {', '.join(sorted(unknown))}.")
        payload = document.get("blueprint")
        if not isinstance(payload, dict):
            return invalid("blueprint", "The export must contain a blueprint object.")
        unknown = set(payload) - FIELDS
        if unknown:
            return invalid("blueprint", f"Unexpected blueprint fields: {', '.join(sorted(unknown))}.")
    else:
        # Original draft exports contain project_id and expected_version.
        # Neither may replace the destination project's identity or version.
        unknown = set(document) - FIELDS - LEGACY_METADATA
        if unknown:
            return invalid("document", f"Unexpected fields: {', '.join(sorted(unknown))}.")
        payload = {key: value for key, value in document.items() if key in FIELDS}

    try:
        parsed = GameSave.model_validate({**payload, "expected_version": 0})
    except ValidationError as exc:
        return {
            "valid": False,
            "data": None,
            "issues": [
                {
                    "field": field_path(error["loc"]),
                    "message": error["msg"],
                }
                for error in exc.errors(include_url=False, include_input=False)
            ],
            "warnings": [],
        }

    return {
        "valid": True,
        "data": parsed.model_dump(exclude={"expected_version"}),
        "issues": [],
        "warnings": [],
    }

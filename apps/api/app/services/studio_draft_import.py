"""Validate portable studio drafts. This module never saves a project."""
from datetime import datetime
from pydantic import ValidationError
from app.schemas.story_project import StorySave
from app.schemas.video_project import VideoSave
from app.schemas.software_project import SoftwareSave
from app.services.game_blueprint_import import field_path

SCHEMAS = {"story": StorySave, "video": VideoSave, "software": SoftwareSave}
FORMAT = "indaverse-studio-draft"


def invalid(field, message):
    return {"valid": False, "data": None, "issues": [{"field": field, "message": message}], "warnings": []}


def validate_studio_draft(studio: str, document: object) -> dict:
    if not isinstance(document, dict):
        return invalid("document", "Choose a JSON object containing a studio draft.")
    schema = SCHEMAS[studio]
    fields = set(schema.model_fields) - {"expected_version"}
    warnings = []
    if "format" in document:
        if document.get("format") != FORMAT:
            return invalid("format", "This is not an IndaVerse studio draft export.")
        if type(document.get("format_version")) is not int or document["format_version"] != 1:
            return invalid("format_version", "This export version is not supported.")
        if document.get("studio") != studio:
            return invalid("studio", "Open this draft in its matching studio.")
        unknown = set(document) - {"format", "format_version", "studio", "source_project_id", "exported_at", "data"}
        if unknown:
            return invalid("document", "Unexpected export metadata: " + ", ".join(sorted(unknown)))
        source = document.get("source_project_id")
        if source is not None and (type(source) is not int or source < 1):
            return invalid("source_project_id", "Source project must be a positive integer.")
        timestamp = document.get("exported_at")
        if timestamp is not None:
            try:
                if not isinstance(timestamp, str):
                    raise ValueError()
                datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            except ValueError:
                return invalid("exported_at", "Export timestamp must be an ISO datetime.")
        payload = document.get("data")
    else:
        unknown = set(document) - fields - {"project_id", "expected_version"}
        if unknown:
            return invalid("document", "Unexpected draft fields: " + ", ".join(sorted(unknown)))
        payload = {key: value for key, value in document.items() if key in fields}
        warnings.append("Legacy draft imported. Source identity and save version are ignored.")
    if not isinstance(payload, dict):
        return invalid("data", "The export must contain a draft object.")
    if set(payload) - fields:
        return invalid("data", "Unexpected fields: " + ", ".join(sorted(set(payload) - fields)))
    try:
        parsed = schema.model_validate({**payload, "expected_version": 0})
    except ValidationError as exc:
        return {"valid": False, "data": None, "issues": [
            {"field": field_path(error["loc"]), "message": error["msg"]}
            for error in exc.errors(include_input=False, include_url=False)
        ], "warnings": warnings}
    return {"valid": True, "data": parsed.model_dump(exclude={"expected_version"}), "issues": [], "warnings": warnings}

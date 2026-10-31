from app.models.project import Project


TEMPLATES = {
    "music": [
        "Define the song concept and structure",
        "Write and revise lyrics or instrumental sections",
        "Develop the arrangement and audio",
        "Review the song against the creative brief",
        "Prepare the final audio and credits",
    ],
    "video": [
        "Write the concept and script",
        "Plan scenes and required assets",
        "Create or gather footage and audio",
        "Edit and review the video",
        "Prepare the final video and credits",
    ],
    "music_video": [
        "Confirm the song and video concept",
        "Build a storyboard and shot list",
        "Create or gather footage and visual assets",
        "Edit and synchronize visuals with the song",
        "Review and prepare the final music video",
    ],
    "voice": [
        "Write and review the spoken script",
        "Define language, pronunciation, and delivery",
        "Record or create the voice audio",
        "Review clarity, pacing, and audio quality",
        "Prepare the final recording and transcript",
    ],
    "story": [
        "Outline the premise and characters",
        "Plan chapters or scenes",
        "Write the first draft",
        "Revise structure, continuity, and language",
        "Prepare the final manuscript",
    ],
    "game": [
        "Define the core gameplay and scope",
        "Plan mechanics, levels, and assets",
        "Build a playable prototype",
        "Test gameplay and resolve issues",
        "Prepare a reviewed playable build",
    ],
    "website": [
        "Define pages and user journeys",
        "Plan content and visual design",
        "Build the website",
        "Test accessibility, responsiveness, and functionality",
        "Prepare deployment and release notes",
    ],
    "app": [
        "Define requirements and user journeys",
        "Plan architecture, screens, and data",
        "Build the core application",
        "Test functionality and resolve issues",
        "Prepare deployment and release notes",
    ],
}


def snapshot(project: Project) -> dict[str, str]:
    return {
        field: getattr(project, f"brief_{field}") or ""
        for field in ("goal", "audience", "style", "constraints")
    }


def build_steps(project: Project) -> list[dict]:
    brief = snapshot(project)
    direction = "\n".join(
        f"{field.capitalize()}: {value}"
        for field, value in brief.items() if value.strip()
    )
    titles = TEMPLATES.get(project.project_type)
    if titles is None:
        raise ValueError("No planning template exists for this project type.")
    return [
        {
            "title": title,
            "notes": direction if index == 0 else "",
            "status": "todo",
        }
        for index, title in enumerate(titles)
    ]

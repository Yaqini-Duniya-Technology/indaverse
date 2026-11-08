"""Review-only creative adapter contract. The registered adapter is offline."""
from typing import Protocol


class Adapter(Protocol):
    def suggest(self, brief: str) -> list[str]: ...


class Fixture:
    def suggest(self, brief: str) -> list[str]:
        topic = " ".join(brief.split())[:180]
        return [
            f"Introduce {topic} and show one detail from the project.",
            f"Share a work-in-progress example about {topic}, then invite one question.",
        ]


ADAPTERS: dict[str, Adapter] = {"fixture": Fixture()}
DAILY_LIMIT = 5


def review_drafts(provider: str, brief: str) -> list[str]:
    drafts = ADAPTERS[provider].suggest(brief)
    if not isinstance(drafts, list) or not 1 <= len(drafts) <= 3 or any(
        not isinstance(text, str) or not text.strip() or len(text) > 400 for text in drafts
    ):
        raise ValueError("Adapter returned an invalid draft.")
    return drafts

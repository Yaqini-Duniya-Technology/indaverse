"""Server-side boundary for future creative generation adapters."""
from dataclasses import dataclass
from typing import Literal, Protocol, get_args

Capability = Literal["text", "image", "video", "music", "speech", "transcription", "code"]
JobState = Literal["pending", "processing", "completed", "failed", "cancelled"]


@dataclass(frozen=True)
class ProviderJob:
    reference: str
    status: JobState
    progress: int | None = None


class CreativeProvider(Protocol):
    name: str

    def available(self) -> bool: ...
    def submit(self, capability: Capability, prompt: str) -> ProviderJob: ...
    def status(self, reference: str) -> ProviderJob: ...


# Only server-configured, reviewed adapters should be registered here.
PROVIDERS: dict[Capability, CreativeProvider] = {}


def capabilities():
    result = []
    for capability in get_args(Capability):
        provider = PROVIDERS.get(capability)
        available = provider is not None and provider.available()
        result.append({"kind": capability, "available": available,
                       "provider": provider.name if available else None})
    return result

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class MusicGenerationRequest:
    """
    Provider-independent request for music generation.
    """

    prompt: str

    output_type: str = "vocal"

    language: str = "English"

    genre: str | None = None

    mood: str | None = None

    bpm: int | None = None


@dataclass
class MusicGenerationResult:
    """
    Provider-independent result returned by a
    music generation provider.
    """

    provider: str

    provider_job_id: str

    status: str

    audio_url: str | None = None

    duration_seconds: float | None = None

    title: str | None = None

    error_message: str | None = None


class MusicProvider(ABC):
    """
    Base contract that every IndaVerse music
    generation provider must implement.
    """

    @abstractmethod
    def generate(
        self,
        request: MusicGenerationRequest,
    ) -> MusicGenerationResult:
        """
        Start a music generation request.
        """
        raise NotImplementedError

    @abstractmethod
    def get_status(
        self,
        provider_job_id: str,
    ) -> MusicGenerationResult:
        """
        Check the status of an existing
        generation job.
        """
        raise NotImplementedError

    @abstractmethod
    def is_available(self) -> bool:
        """
        Return whether this provider is
        currently configured and available.
        """
        raise NotImplementedError

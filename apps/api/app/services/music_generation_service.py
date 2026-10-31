from app.providers.music import (
    MusicGenerationRequest,
    MusicGenerationResult,
    MusicProvider,
)


class MusicGenerationService:
    """
    Provider-independent orchestration layer
    for IndaVerse music generation.
    """

    def __init__(self, provider: MusicProvider):
        self.provider = provider

    def generate(
        self,
        request: MusicGenerationRequest,
    ) -> MusicGenerationResult:
        """
        Start a music generation job through
        the configured provider.
        """

        if not self.provider.is_available():
            raise RuntimeError(
                "Music generation provider is not available."
            )

        return self.provider.generate(request)

    def get_status(
        self,
        provider_job_id: str,
    ) -> MusicGenerationResult:
        """
        Retrieve the status of an existing
        music generation job.
        """

        if not self.provider.is_available():
            raise RuntimeError(
                "Music generation provider is not available."
            )

        return self.provider.get_status(
            provider_job_id
        )

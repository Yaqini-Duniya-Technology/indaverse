from app.providers.music import (
    MusicGenerationRequest,
    MusicGenerationResult,
    MusicProvider,
)


class UnavailableMusicProvider(MusicProvider):
    """
    Safe fallback provider used when no real
    AI music provider has been configured.
    """

    def generate(
        self,
        request: MusicGenerationRequest,
    ) -> MusicGenerationResult:
        return MusicGenerationResult(
            provider="unavailable",
            provider_job_id="",
            status="unavailable",
            error_message=(
                "Music generation is not connected "
                "to an AI provider yet."
            ),
        )

    def get_status(
        self,
        provider_job_id: str,
    ) -> MusicGenerationResult:
        return MusicGenerationResult(
            provider="unavailable",
            provider_job_id=provider_job_id,
            status="unavailable",
            error_message=(
                "Music generation is not connected "
                "to an AI provider yet."
            ),
        )

    def is_available(self) -> bool:
        return False

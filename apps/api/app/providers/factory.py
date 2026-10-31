from app.providers.music import MusicProvider
from app.providers.unavailable_music import UnavailableMusicProvider


def get_music_provider() -> MusicProvider:
    """
    Return the configured music generation provider.

    Until a real AI provider is configured, IndaVerse
    safely uses the unavailable provider.
    """

    return UnavailableMusicProvider()

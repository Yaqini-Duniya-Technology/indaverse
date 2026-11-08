"""Start and reap a real launcher child in an isolated CI checkout."""
import importlib.util
import os
from pathlib import Path
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.skipif(os.environ.get("INDAVERSE_LAUNCHER_SMOKE") != "1",
                    reason="Run only in an isolated checkout with port 8002 free.")
def test_launcher_starts_the_real_api(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location("launcher_smoke", ROOT / "scripts/local_services.py")
    launcher = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(launcher)
    assert not launcher.occupied(8002), "Launcher fixture needs an unused port 8002."
    monkeypatch.setattr(launcher, "RUNTIME", tmp_path)
    for key, value in {
        "DATABASE_URL": "sqlite://", "REDIS_URL": "redis://127.0.0.1:6379/15",
        "APP_ENV": "test", "SECRET_KEY": "isolated-launcher-fixture-only",
        "ALLOWED_HOSTS": '["127.0.0.1"]', "COOKIE_SECURE": "false",
    }.items():
        monkeypatch.setenv(key, value)
    popen = subprocess.Popen
    launched = []

    def capture(*args, **kwargs):
        process = popen(*args, **kwargs)
        launched.append(process)
        return process

    monkeypatch.setattr(launcher.subprocess, "Popen", capture)
    try:
        launcher.start("api", timeout=25)
        assert len(launched) == 1
        assert launcher.identity("http://127.0.0.1:8002/api/v1/health", "api")
        launcher.start("api", timeout=5)
        assert len(launched) == 1
    finally:
        for child in launched:
            child.terminate()
            child.wait(timeout=10)

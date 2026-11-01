"""Run isolated API tests from any working directory; never uses the local .env DB."""
import os
from pathlib import Path
import secrets
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
api = root / "apps" / "api"
os.chdir(api)
sys.path.insert(0, str(api))
os.environ.update(
    DATABASE_URL="sqlite://", REDIS_URL="redis://localhost:6379/15",
    SECRET_KEY=secrets.token_urlsafe(48), APP_ENV="test",
)
import pytest
with tempfile.TemporaryDirectory(prefix="indaverse-tests-") as temporary:
    raise SystemExit(pytest.main([
        "tests", "-q", "--tb=short", "--basetemp", str(Path(temporary) / "work"),
        *sys.argv[1:],
    ]))

"""Fail on known private/generated tracked paths; print names, never secret values."""
from pathlib import PurePosixPath
import subprocess
import sys

files = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")
bad = []
for name in filter(None, files):
    path = PurePosixPath(name)
    if (any(p in {"uploads", "backups", ".local-run", ".venv", "node_modules", ".next", ".next-dev", ".next-e2e", "playwright-report", "test-results", "__pycache__"} for p in path.parts)
            or (path.name.startswith(".env") and not path.name.endswith(".example"))
            or ".before-repair" in name):
        bad.append(name)
for name in bad:
    print("Unexpected tracked file:", name)
print(f"Repository path check: {len(bad)} issues. This is not a content secret scanner.")
sys.exit(bool(bad))

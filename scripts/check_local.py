"""Read-only local preflight. Never print configuration values or credentials."""
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api'))


def check():
    issues = []
    if not (ROOT / '.env').is_file():
        issues.append('Root .env is missing; run Setup-Local.ps1.')
    try:
        from app.core.config import settings
        for field in ('database_url', 'redis_url', 'secret_key'):
            value = getattr(settings, field)
            if not value or 'REPLACE_' in value:
                issues.append(f'{field}: configure a real local value.')
        if len(settings.secret_key) < 32:
            issues.append('secret_key: use at least 32 random characters.')
        database = urlsplit(settings.database_url)
        if database.scheme not in ('postgresql+psycopg', 'postgresql'):
            issues.append('Local startup expects PostgreSQL; isolated tests use their own configuration.')
        if urlsplit(settings.redis_url).scheme not in ('redis', 'rediss'):
            issues.append('redis_url: use redis:// or rediss://.')
        if 'http://localhost:3000' not in settings.cors_origins:
            issues.append('cors_origins: allow the documented local browser origin.')
        if settings.cookie_secure:
            issues.append('cookie_secure must be false for the documented local HTTP workflow.')
    except Exception as error:
        # Pydantic error strings can contain input values. Do not print the exception.
        issues.append(f'Backend configuration could not load ({type(error).__name__}). Check required variables against .env.example.')
    web_env = ROOT / 'apps/web/.env.local'
    if web_env.is_file():
        from dotenv import dotenv_values
        url = dotenv_values(web_env).get('NEXT_PUBLIC_API_URL')
        if url not in ('http://localhost:8002', 'http://127.0.0.1:8002'):
            issues.append('Web NEXT_PUBLIC_API_URL must point to the local API on port 8002; rebuild after changing it.')
    else:
        issues.append('apps/web/.env.local is missing; run Setup-Local.ps1.')
    if not (ROOT / 'apps/web/node_modules/next/dist/bin/next').is_file():
        issues.append('Web dependencies are missing; run npm.cmd --prefix apps/web ci.')
    return {'ready': not issues, 'issues': issues}


if __name__ == '__main__':
    result = check()
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result['ready'] else 1)

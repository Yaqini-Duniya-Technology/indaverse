"""Create an isolated, random PostgreSQL database for row-lock regression tests.

Requires explicit INDAVERSE_PG_TEST_ADMIN_URL on localhost. Never uses .env.
"""
import os
from pathlib import Path
import secrets
import subprocess
import sys
import uuid
from urllib.parse import urlsplit, urlunsplit


def main():
    import psycopg
    from psycopg import sql
    admin = os.environ.get('INDAVERSE_PG_TEST_ADMIN_URL', '')
    parsed = urlsplit(admin)
    if parsed.scheme != 'postgresql' or parsed.hostname not in ('localhost','127.0.0.1'):
        print('Set an explicit localhost PostgreSQL test-admin URL. Application .env is never used.')
        return 1
    name = 'indaverse_test_' + uuid.uuid4().hex
    with psycopg.connect(admin, autocommit=True) as connection:
        connection.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
        try:
            test_url = urlunsplit(parsed._replace(path='/' + name))
            environment = {**os.environ, 'INDAVERSE_PG_TEST_URL':test_url,
                'DATABASE_URL':'sqlite://', 'REDIS_URL':'redis://127.0.0.1:6379/15',
                'SECRET_KEY':secrets.token_urlsafe(48), 'APP_ENV':'test'}
            return subprocess.run([sys.executable,'-m','pytest','integration/test_postgres_locks.py','-q','--tb=short'],
                cwd=Path(__file__).resolve().parents[1],env=environment).returncode
        finally:
            connection.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(name)))


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('PostgreSQL check could not complete. Test connection details were not printed. Inspect the test service locally.')
        raise SystemExit(1)

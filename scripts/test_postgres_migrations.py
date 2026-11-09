"""Restore a synthetic release database and rehearse the expansion migrations."""
from contextlib import contextmanager
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

import psycopg
from psycopg import sql

API = Path(__file__).resolve().parents[1] / "apps/api"
RELEASE = "0e93a61da7e8"
SEQUENCES = "60739eacde21"
EXPANSION_HEAD = "86db3e0928a1"


@contextmanager
def fixture_database(connection, parsed):
    name = "indaverse_test_" + uuid4().hex
    database = sql.Identifier(name)
    connection.execute(sql.SQL("CREATE DATABASE {}").format(database))
    try:
        yield name, urlunsplit(parsed._replace(path="/" + name, query="", fragment=""))
    finally:
        connection.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(database))


def migrate(url, direction, revision):
    environment = {
        **os.environ, "APP_ENV": "test", "SECRET_KEY": "isolated-migration-fixture-only",
        "REDIS_URL": "redis://127.0.0.1:6379/15",
        "DATABASE_URL": url.replace("postgresql://", "postgresql+psycopg://", 1),
    }
    subprocess.run([sys.executable, "-m", "alembic", direction, revision], cwd=API,
                   env=environment, timeout=60, check=True)


def release_rows(conn):
    return conn.execute("""SELECT users.email, projects.name, projects.visibility
                           FROM projects JOIN users ON projects.user_id=users.id
                           ORDER BY projects.id""").fetchall()


def main():
    admin = os.environ.get("INDAVERSE_PG_TEST_ADMIN_URL", "")
    container = os.environ.get("INDAVERSE_PG_TEST_CONTAINER", "")
    parsed = urlsplit(admin)
    if (parsed.scheme != "postgresql" or parsed.hostname not in ("localhost", "127.0.0.1")
            or parsed.query or parsed.fragment or not re.fullmatch(r"[a-f0-9]{12,64}", container)):
        raise RuntimeError("Use the isolated localhost PostgreSQL fixture and its Docker container ID.")
    with psycopg.connect(admin, autocommit=True) as connection:
        with fixture_database(connection, parsed) as (old_name, old_url):
            migrate(old_url, "upgrade", RELEASE)
            with psycopg.connect(old_url) as old:
                old.execute("""INSERT INTO users (id,email,username,hashed_password,is_active,is_verified,created_at,updated_at)
                               VALUES (1,'fixture@example.invalid','fixture','fixture',true,false,now(),now())""")
                old.execute("""INSERT INTO projects (id,user_id,name,project_type,visibility,created_at,updated_at)
                               VALUES (1,1,'Saved fixture','video','private',now(),now())""")
                baseline = release_rows(old)
            dump = subprocess.check_output(
                ["docker", "exec", container, "pg_dump", "-U", "postgres", "-Fc", old_name], timeout=30)
            with fixture_database(connection, parsed) as (restored_name, restored_url):
                subprocess.run(["docker", "exec", "-i", container, "pg_restore", "-U", "postgres",
                                "--exit-on-error", "--no-owner", "-d", restored_name],
                               input=dump, timeout=30, check=True)
                with psycopg.connect(restored_url) as restored:
                    assert release_rows(restored) == baseline
                    assert restored.execute("SELECT version_num FROM alembic_version").fetchone() == (RELEASE,)
                migrate(restored_url, "upgrade", SEQUENCES)
                with psycopg.connect(restored_url) as restored:
                    assert release_rows(restored) == baseline
                    assert restored.execute("SELECT archived_at FROM projects WHERE id=1").fetchone() == (None,)
                    restored.execute("INSERT INTO video_sequences VALUES (1,7,'[]')")
                    restored.execute("""INSERT INTO video_sequence_sources
                                        (id,project_id,name,duration_ms,content) VALUES (%s,1,'clip.mp4',1000,%s)""",
                                     ("a" * 32, b"synthetic source bytes"))
                migrate(restored_url, "upgrade", "head")
                with psycopg.connect(restored_url) as restored:
                    assert restored.execute("SELECT version_num FROM alembic_version").fetchone() == (EXPANSION_HEAD,)
                    assert restored.execute("SELECT count(*) FROM beta_invites").fetchone() == (0,)
                    assert restored.execute("SELECT count(*) FROM beta_access").fetchone() == (0,)
                    assert restored.execute("SELECT count(*) FROM creator_delivery").fetchone() == (0,)
                    restored.execute("""INSERT INTO creator_delivery (project_id,kind,version,data)
                                        VALUES (1,'campaign',1,'{"name":"Fixture","posts":[]}')""")
                    assert restored.execute("SELECT data ->> 'name' FROM creator_delivery").fetchone() == ("Fixture",)
                    assert restored.execute("SELECT count(*) FROM music_sessions").fetchone() == (0,)
                    assert restored.execute("SELECT count(*) FROM video_sequence_revisions").fetchone() == (0,)
                    assert restored.execute("SELECT version FROM video_sequences").fetchone() == (7,)
                    assert restored.execute("SELECT content FROM video_sequence_sources").fetchone() == (b"synthetic source bytes",)
                    restored.execute("""INSERT INTO video_sequence_soundtracks
                                        (project_id,name,format,duration_ms,settings,content)
                                        VALUES (1,'music.wav','wav',1000,'{}',%s)""", (b"synthetic audio",))
                migrate(restored_url, "downgrade", SEQUENCES)
                with psycopg.connect(restored_url) as restored:
                    assert restored.execute("SELECT to_regclass('video_sequence_soundtracks')").fetchone() == (None,)
                    assert restored.execute("SELECT to_regclass('video_sequence_revisions')").fetchone() == (None,)
                    assert restored.execute("SELECT to_regclass('creator_delivery')").fetchone() == (None,)
                    assert restored.execute("SELECT to_regclass('beta_access')").fetchone() == (None,)
                    assert restored.execute("SELECT to_regclass('beta_invites')").fetchone() == (None,)
                    assert restored.execute("SELECT to_regclass('music_sessions')").fetchone() == (None,)
                    assert restored.execute("SELECT version FROM video_sequences").fetchone() == (7,)
                migrate(restored_url, "downgrade", RELEASE)
                with psycopg.connect(restored_url) as restored:
                    assert restored.execute("SELECT to_regclass('video_sequences')").fetchone() == (None,)
                    assert restored.execute("SELECT to_regclass('video_sequence_sources')").fetchone() == (None,)
                    assert release_rows(restored) == baseline
            with psycopg.connect(old_url) as old:
                assert release_rows(old) == baseline
                assert old.execute("SELECT version_num FROM alembic_version").fetchone() == (RELEASE,)
    print("PostgreSQL fixture restore, expansion upgrade, and rollback passed.")


if __name__ == "__main__":
    main()

"""Exercise backup/restore tooling using synthetic data in disposable containers."""
import json
from pathlib import Path
import subprocess
import tempfile
import uuid
from backup_manifest import create
from verify_backup import verify, run


def main():
    name='indaverse-backup-fixture-'+uuid.uuid4().hex
    created=False
    try:
        run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16'])
        created=True
        import time
        for _ in range(60):
            result=subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True)
            if result.returncode==0: break
            time.sleep(1)
        else: raise RuntimeError('Fixture PostgreSQL unavailable')
        run(['docker','exec',name,'psql','-U','postgres','-c',
            "CREATE TABLE users (id integer PRIMARY KEY); CREATE TABLE projects (id integer PRIMARY KEY, user_id integer REFERENCES users(id)); CREATE TABLE alembic_version (version_num text); INSERT INTO users VALUES(1); INSERT INTO projects VALUES(1,1);"])
        with tempfile.TemporaryDirectory(prefix='indaverse-backup-test-') as directory:
            root=Path(directory)
            with (root/'database.dump').open('wb') as dump:
                result=subprocess.run(['docker','exec',name,'pg_dump','-U','postgres','-Fc','postgres'],stdout=dump,stderr=subprocess.PIPE)
                if result.returncode: raise RuntimeError('Fixture dump failed')
            (root/'uploads').mkdir()
            (root/'uploads'/'synthetic.txt').write_text('Synthetic media integrity fixture')
            create(root)
            report=verify(root)
            assert report['database_restore']=='passed' and report['file_integrity']=='passed'
        print('Synthetic backup restore and media integrity drill passed. No application database was used.')
    finally:
        if created: subprocess.run(['docker','rm','-f',name],capture_output=True)


if __name__=='__main__': main()

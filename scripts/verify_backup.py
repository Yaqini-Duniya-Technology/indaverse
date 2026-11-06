"""Restore a backup into a disposable, network-isolated PostgreSQL container.

Never accepts a live target database. Always removes the test container.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time
import uuid


def run(command):
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        # Database dumps and docker errors may contain private details.
        raise RuntimeError('Backup verification command failed. Inspect Docker locally; no live database was modified.')
    return result.stdout.strip()


def validate_manifest(directory):
    manifest = json.loads((directory / 'manifest.json').read_text())
    if manifest.get('format') != 'indaverse-backup-v1':
        raise ValueError('Unsupported backup manifest.')
    listed = set()
    for record in manifest['files']:
        relative = Path(record['path'])
        path = (directory / relative).resolve()
        if relative.is_absolute() or directory.resolve() not in path.parents or path.is_symlink():
            raise ValueError('Unsafe backup manifest path.')
        if record['path'] in listed:
            raise ValueError('Duplicate manifest entry.')
        listed.add(record['path'])
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if path.stat().st_size != record['size'] or digest != record['sha256']:
            raise ValueError('Backup integrity verification failed; keep the original archive.')
    if 'database.dump' not in listed:
        raise ValueError('Manifest does not include database.dump.')
    return manifest


def verify(directory, docker='docker'):
    directory = Path(directory).resolve()
    validate_manifest(directory)
    name = 'indaverse-restore-check-' + uuid.uuid4().hex
    created = False
    try:
        run([docker, 'run', '-d', '--name', name, '--network', 'none', '--tmpfs', '/var/lib/postgresql/data',
             '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16'])
        created = True
        for _ in range(60):
            probe = subprocess.run([docker, 'exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], capture_output=True)
            if probe.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Disposable PostgreSQL did not become ready.')
        run([docker, 'cp', str(directory / 'database.dump'), name + ':/tmp/database.dump'])
        run([docker, 'exec', name, 'pg_restore', '--exit-on-error', '--single-transaction', '--no-owner',
             '--no-privileges', '-U', 'postgres', '-d', 'postgres', '/tmp/database.dump'])
        present = run([docker, 'exec', name, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc',
            "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','projects','alembic_version')"])
        if present != '3':
            raise RuntimeError('Restored database is missing expected application tables.')
        report = {'database_restore':'passed','file_integrity':'passed','live_database_modified':False,
                  'limits':'Media hashes checked; media playback and PostgreSQL row counts were not compared to a live snapshot.'}
        (directory / 'restore-check.json').write_text(json.dumps(report, indent=2)+'\n')
        return report
    finally:
        if created:
            subprocess.run([docker,'rm','-f',name],capture_output=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory')
    parser.add_argument('--docker', default='docker')
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.directory, args.docker), indent=2))
    except (OSError, ValueError, RuntimeError, KeyError):
        parser.exit(1, 'Restore check failed. Keep the backup unchanged; verify its manifest and Docker availability. No live database was targeted.\n')

"""Write portable relative checksums. No configuration files are included."""
import hashlib
import json
from pathlib import Path
import sys


def create(directory):
    directory = Path(directory).resolve()
    paths = [directory / 'database.dump']
    uploads = directory / 'uploads'
    if uploads.exists():
        paths.extend(path for path in uploads.rglob('*') if path.is_file())
    files = []
    for path in paths:
        if path.is_symlink() or directory not in path.resolve().parents:
            raise ValueError('Backup must not contain symlinks outside the archive.')
        files.append({'path':path.relative_to(directory).as_posix(),'size':path.stat().st_size,
                      'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    result = {'format':'indaverse-backup-v1','files':files}
    (directory/'manifest.json').write_text(json.dumps(result,indent=2)+'\n')
    return result


if __name__ == '__main__':
    create(sys.argv[1])
    print('Portable backup manifest created. No credentials were included.')

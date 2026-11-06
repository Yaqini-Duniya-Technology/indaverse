import importlib.util
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]

def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT/'scripts'/f'{name}.py')
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def test_wait_reports_early_exit_without_timeout():
    services = module('local_services')
    class Exited:
        def poll(self): return 2
    with pytest.raises(RuntimeError, match='exited with code 2'):
        services.wait_ready(Exited(), 'http://127.0.0.1:1', 'api', 1)


def test_port_identity_failure_never_stops_or_starts_foreign_process(monkeypatch):
    services = module('local_services')
    monkeypatch.setattr(services,'identity',lambda *args: False)
    monkeypatch.setattr(services,'occupied',lambda *args: True)
    monkeypatch.setattr(services.subprocess,'Popen',lambda *args,**kwargs: pytest.fail('must not launch'))
    with pytest.raises(RuntimeError,match='No process was stopped'):
        services.start('web')


def test_backup_manifest_detects_mutated_media(tmp_path):
    manifest = module('backup_manifest')
    verify = module('verify_backup')
    (tmp_path/'database.dump').write_bytes(b'dump')
    (tmp_path/'uploads').mkdir()
    image=tmp_path/'uploads'/'reference.png'
    image.write_bytes(b'original')
    manifest.create(tmp_path)
    verify.validate_manifest(tmp_path)
    image.write_bytes(b'changed')
    with pytest.raises(ValueError,match='integrity'):
        verify.validate_manifest(tmp_path)


def test_restore_drill_cleans_up_container_on_failure(tmp_path, monkeypatch):
    manifest = module('backup_manifest')
    verify = module('verify_backup')
    (tmp_path/'database.dump').write_bytes(b'dump')
    manifest.create(tmp_path)
    commands=[]
    def run(command):
        commands.append(command)
        if 'pg_restore' in command: raise RuntimeError('restore failed')
        return ''
    monkeypatch.setattr(verify,'run',run)
    class Result: returncode=0
    monkeypatch.setattr(verify.subprocess,'run',lambda command,**kwargs:(commands.append(command) or Result()))
    with pytest.raises(RuntimeError): verify.verify(tmp_path)
    start=commands[0]
    assert '--network' in start and 'none' in start and '--tmpfs' in start
    assert not any('-v' in command or '--volume' in command or '--publish' in command for command in commands)
    assert commands[-1][1:3] == ['rm','-f']


def test_manifest_rejects_parent_path(tmp_path):
    import json
    verify=module('verify_backup')
    (tmp_path/'manifest.json').write_text(json.dumps({'format':'indaverse-backup-v1','files':[{'path':'../private','size':0,'sha256':''}]}))
    with pytest.raises(ValueError,match='Unsafe'): verify.validate_manifest(tmp_path)


def test_preflight_accepts_valid_fixture_without_printing_secrets(tmp_path, monkeypatch):
    import sys
    from types import SimpleNamespace
    preflight=module('check_local')
    monkeypatch.setattr(preflight,'ROOT',tmp_path)
    (tmp_path/'.env').write_text('')
    (tmp_path/'apps/web/node_modules/next/dist/bin').mkdir(parents=True)
    (tmp_path/'apps/web/node_modules/next/dist/bin/next').write_text('')
    (tmp_path/'apps/web/.env.local').write_text('NEXT_PUBLIC_API_URL=http://localhost:8002\n')
    private='private-value-that-must-never-be-printed-123'
    settings=SimpleNamespace(database_url='postgresql+psycopg://u:p@localhost/db',redis_url='redis://localhost:6379/0',secret_key=private,cors_origins=['http://localhost:3000'],cookie_secure=False)
    monkeypatch.setitem(sys.modules,'app.core.config',SimpleNamespace(settings=settings))
    result=preflight.check()
    assert result['ready'] and private not in str(result)
    (tmp_path/'apps/web/.env.local').write_text('NEXT_PUBLIC_API_URL=http://localhost:9999\n')
    result=preflight.check()
    assert not result['ready'] and private not in str(result)

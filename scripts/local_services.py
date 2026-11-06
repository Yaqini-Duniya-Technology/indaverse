"""Start local services with independent lifetimes and private diagnostic logs.

No arbitrary process is terminated. Existing listeners must prove their identity.
"""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.local-run'


def identity(url, kind):
    try:
        with urllib.request.urlopen(url, timeout=3) as response:
            if kind == 'api':
                return json.load(response).get('service') == 'indaverse-api'
            return response.headers.get('X-IndaVerse-Web') == '1'
    except (OSError, ValueError, urllib.error.URLError):
        return False


def occupied(port):
    with socket.socket() as connection:
        connection.settimeout(.5)
        return connection.connect_ex(('127.0.0.1', port)) == 0


def wait_ready(process, url, kind, timeout, output=print):
    end = time.monotonic() + timeout
    attempt = 0
    while time.monotonic() < end:
        code = process.poll()
        if code is not None:
            raise RuntimeError(f'{kind} exited with code {code}; inspect .local-run/{kind}.log locally.')
        if identity(url, kind):
            return
        if attempt % 5 == 0:
            output(f'Waiting for {kind}; diagnostic log: .local-run/{kind}.log', flush=True)
        attempt += 1
        time.sleep(1)
    raise RuntimeError(f'{kind} startup timed out; inspect its private log. The process was left running for diagnosis.')


def start(kind, mode='development', timeout=180):
    port = 8002 if kind == 'api' else 3000
    url = f'http://127.0.0.1:{port}/api/v1/health' if kind == 'api' else f'http://127.0.0.1:{port}/login'
    if identity(url, kind):
        print(f'{kind} is already ready on port {port}.')
        return
    if occupied(port):
        raise RuntimeError(f'Port {port} is occupied but {kind} identity could not be verified. No process was stopped.')
    if kind == 'api':
        command = [sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', str(port)]
        cwd = ROOT / 'apps/api'
    else:
        node = __import__('shutil').which('node')
        if not node:
            raise RuntimeError('Node.js was not found on PATH.')
        if mode == 'production' and not (ROOT / 'apps/web/.next/BUILD_ID').is_file():
            raise RuntimeError('Production build is missing; run Verify-Release.ps1 first.')
        command = [node, str(ROOT / 'apps/web/node_modules/next/dist/bin/next'), 'start' if mode == 'production' else 'dev', '--hostname', '127.0.0.1', '--port', str(port)]
        cwd = ROOT / 'apps/web'
    RUNTIME.mkdir(exist_ok=True)
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    with (RUNTIME / f'{kind}.log').open('ab') as log:
        process = subprocess.Popen(command, cwd=cwd, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
            creationflags=flags, start_new_session=os.name != 'nt', close_fds=True)
    (RUNTIME / f'{kind}.json').write_text(json.dumps({'pid': process.pid, 'mode': mode, 'started_at': time.time()}))
    wait_ready(process, url, kind, timeout)
    print(f'{kind} ready on port {port}; it does not depend on keeping this terminal open.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('service', choices=['api', 'web'])
    parser.add_argument('--mode', choices=['development', 'production'], default='development')
    args = parser.parse_args()
    try:
        start(args.service, args.mode)
    except (OSError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)

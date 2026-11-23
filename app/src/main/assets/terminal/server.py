"""Authenticated, loopback-only PTY transport for the Android Sandbox bridge."""
import argparse
import base64
import fcntl
import hmac
import json
import os
from pathlib import Path
import pty
import signal
import shutil
import stat
import struct
import termios
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit
import uuid

BUFFER_SIZE = 1024 * 1024
FILE_LIMIT = 32768
PAGE_SIZE = 100


def workspace_path(body, default_root):
    root_name, name = body.get('root', default_root), body.get('path', '')
    if not isinstance(root_name, str) or not isinstance(name, str) or len(root_name) > 4096 or len(name) > 4096:
        raise ValueError('Invalid workspace path')
    root = Path(root_name).expanduser().resolve(strict=True)
    if not root.is_dir():
        raise ValueError('Workspace root must be a folder')
    path = (root / name).resolve(strict=True)
    if not path.is_relative_to(root):
        raise ValueError('Path is outside the workspace folder')
    return root, path


def list_files(body, default_root):
    root, path = workspace_path(body, default_root)
    if not path.is_dir():
        raise ValueError('Select a folder')
    offset = body.get('offset', 0)
    if type(offset) is not int or offset < 0:
        raise ValueError('Invalid file offset')
    entries = []
    with os.scandir(path) as directory:
        for item in directory:
            # Do not follow links outside the selected workspace.
            try:
                target = Path(item.path).resolve(strict=True)
                allowed = target.is_relative_to(root)
                kind = 'folder' if allowed and target.is_dir() else 'file'
                readable = allowed and (target.is_dir() or target.is_file())
            except (OSError, RuntimeError):
                kind, readable = 'file', False
            entries.append(dict(name=item.name, kind=kind, readable=readable))
    entries.sort(key=lambda item: (item['kind'] != 'folder', item['name'].casefold(), item['name']))
    return dict(root=str(root), path=str(path.relative_to(root)),
                entries=entries[offset:offset + PAGE_SIZE],
                nextOffset=offset + PAGE_SIZE if offset + PAGE_SIZE < len(entries) else None)


def read_file(body, default_root):
    root, path = workspace_path(body, default_root)
    # O_NONBLOCK avoids hanging on FIFOs; fstat also rejects devices and sockets.
    fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode):
            raise ValueError('Only regular text files can be opened')
        data = source.read(FILE_LIMIT + 1)
    if len(data) > FILE_LIMIT:
        raise ValueError('File exceeds 32 KiB; open it in the shell')
    if b'\0' in data:
        raise ValueError('Binary file; open it with a suitable tool in the shell')
    return dict(root=str(root), path=str(path.relative_to(root)), content=data.decode('utf-8-sig'),
                size=len(data))


class Session:
    def __init__(self, cwd, cols, rows):
        self.id = uuid.uuid4().hex
        self.cwd = cwd
        self.lock = threading.Lock()
        self.input_lock = threading.Lock()
        self.output = bytearray()
        self.start = 0
        self.exit_code = None
        self.pid, self.fd = pty.fork()
        if self.pid == 0:
            os.chdir(cwd)
            os.environ['TERM'] = 'xterm-256color'
            os.environ['COLORTERM'] = 'truecolor'
            shell = os.environ.get('SHELL') or shutil.which('bash') or '/bin/sh'
            os.execv(shell, [shell, '-l'])
        self.resize(cols, rows)
        threading.Thread(target=self.read_output, daemon=True).start()

    def resize(self, cols, rows):
        fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))

    def read_output(self):
        try:
            while True:
                chunk = os.read(self.fd, 16384)
                if not chunk:
                    break
                with self.lock:
                    self.output.extend(chunk)
                    excess = max(0, len(self.output) - BUFFER_SIZE)
                    if excess:
                        del self.output[:excess]
                        self.start += excess
        except OSError:
            pass
        finally:
            _, status = os.waitpid(self.pid, 0)
            with self.lock:
                self.exit_code = os.waitstatus_to_exitcode(status)
            os.close(self.fd)

    def snapshot(self, offset):
        with self.lock:
            position = max(self.start, min(offset, self.start + len(self.output)))
            data = self.output[position - self.start:position - self.start + 65536]
            return dict(data=base64.b64encode(data).decode(), offset=position + len(data),
                        truncated=offset < self.start, exitCode=self.exit_code)

    def close(self):
        if self.exit_code is None:
            try:
                foreground = os.tcgetpgrp(self.fd)
                if foreground != self.pid:
                    os.killpg(foreground, signal.SIGHUP)
                os.killpg(self.pid, signal.SIGHUP)
            except OSError:
                pass


class TerminalServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, token):
        super().__init__(address, Handler)
        self.token = token
        self.sessions = {}
        self.sessions_lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # Request headers and terminal input can contain private data.

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def dispatch(self):
        if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + self.server.token):
            self.reply(401, dict(error='Authentication required'))
            return
        try:
            url = urlsplit(self.path)
            body = {}
            if self.command == 'POST':
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 <= length <= 131072:
                    raise ValueError('Request too large')
                body = json.loads(self.rfile.read(length) or b'{}')
                if not isinstance(body, dict):
                    raise ValueError('JSON object required')
            if self.command == 'GET' and url.path == '/health':
                self.reply(200, dict(ok=True, service='w3-terminal', protocol=1, capabilities=['files-v1']))
                return
            if url.path == '/sessions':
                with self.server.sessions_lock:
                    if self.command == 'GET':
                        result = [dict(id=s.id, cwd=s.cwd, exitCode=s.exit_code)
                                  for s in self.server.sessions.values()]
                        self.reply(200, dict(sessions=result))
                        return
                    if self.command != 'POST':
                        raise ValueError('Unsupported method')
                    if len(self.server.sessions) >= 4:
                        self.reply(409, dict(error='Close an existing session first (maximum 4)'))
                        return
                    cwd = str(Path(body.get('cwd', '~')).expanduser().resolve(strict=True))
                    if not Path(cwd).is_dir():
                        raise ValueError('Working directory must be a folder')
                    session = Session(cwd, *self.dimensions(body))
                    self.server.sessions[session.id] = session
                    self.reply(201, dict(id=session.id, cwd=cwd, exitCode=None))
                    return
            parts = url.path.strip('/').split('/')
            if len(parts) != 3 or parts[0] != 'sessions':
                self.reply(404, dict(error='Unknown endpoint'))
                return
            with self.server.sessions_lock:
                session = self.server.sessions.get(parts[1])
            if session is None:
                self.reply(404, dict(error='Session no longer exists'))
                return
            action = parts[2]
            if action in ('files', 'read') and self.command == 'POST':
                result = list_files(body, session.cwd) if action == 'files' else read_file(body, session.cwd)
                self.reply(200, result)
            elif action == 'output' and self.command == 'GET':
                offset = int(parse_qs(url.query).get('offset', ['0'])[0])
                self.reply(200, session.snapshot(offset))
            elif action == 'input' and self.command == 'POST':
                if session.exit_code is not None:
                    self.reply(409, dict(error='Shell has exited'))
                    return
                if not isinstance(body.get('data'), str):
                    raise ValueError('Input must be text')
                data = body['data'].encode('utf-8')
                if len(data) > 65536:
                    raise ValueError('Input exceeds 64 KiB')
                with session.input_lock:
                    while data:
                        data = data[os.write(session.fd, data):]
                self.reply(200, dict(ok=True))
            elif action == 'resize' and self.command == 'POST':
                session.resize(*self.dimensions(body))
                self.reply(200, dict(ok=True))
            elif action == 'close' and self.command == 'POST':
                session.close()
                with self.server.sessions_lock:
                    self.server.sessions.pop(session.id, None)
                self.reply(200, dict(ok=True))
            else:
                self.reply(404, dict(error='Unknown endpoint'))
        except (ValueError, KeyError, TypeError, OSError, RuntimeError) as error:
            self.reply(400, dict(error=str(error)))

    @staticmethod
    def dimensions(body):
        cols, rows = int(body.get('cols', 80)), int(body.get('rows', 24))
        if not 2 <= cols <= 500 or not 2 <= rows <= 300:
            raise ValueError('Invalid terminal dimensions')
        return cols, rows

    do_GET = dispatch
    do_POST = dispatch


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--token-file', required=True)
    args = parser.parse_args()
    token = Path(args.token_file).read_text().strip()
    if len(token) < 32:
        raise SystemExit('Token must contain at least 32 characters')
    server = TerminalServer(('127.0.0.1', args.port), token)
    repo = Path.home() / 'W3_HB_team_BXCGICOG'
    initial = Session(str(repo if repo.is_dir() else Path.home()), 80, 24)
    server.sessions[initial.id] = initial
    try:
        server.serve_forever()
    finally:
        for session in server.sessions.values():
            session.close()
        server.server_close()


if __name__ == '__main__':
    main()

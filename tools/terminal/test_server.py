"""Exercise the actual HTTP/PTY entry points, including session continuity."""
import base64
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen


class TerminalIntegration(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.token = 'test-only-' + 'a' * 64
        token_file = self.root / 'token'
        token_file.write_text(self.token)
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            self.port = listener.getsockname()[1]
        env = dict(os.environ, HOME=str(self.root), SHELL='/bin/bash')
        self.process = subprocess.Popen([sys.executable, str(Path(__file__).with_name('server.py')),
                                         '--port', str(self.port), '--token-file', str(token_file)], env=env)
        for _ in range(100):
            try:
                self.request('GET', '/health')
                break
            except OSError:
                time.sleep(.05)
        else:
            self.fail('server did not start')

    def tearDown(self):
        try:
            for session in self.request('GET', '/sessions')['sessions']:
                self.request('POST', f"/sessions/{session['id']}/close")
        finally:
            self.process.terminate()
            self.process.wait(timeout=5)
            self.temp.cleanup()

    def request(self, method, path, body=None, token=None):
        data = json.dumps(body or {}).encode() if method == 'POST' else None
        request = Request(f'http://127.0.0.1:{self.port}{path}', data=data, method=method,
                          headers={'Authorization': 'Bearer ' + (self.token if token is None else token),
                                   'Content-Type': 'application/json'})
        with urlopen(request, timeout=5) as response:
            return json.load(response)

    def wait_output(self, session, marker, offset=0):
        output = b''
        for _ in range(150):
            result = self.request('GET', f'/sessions/{session}/output?offset={offset}')
            output += base64.b64decode(result['data'])
            offset = result['offset']
            if marker in output:
                return output, offset
            time.sleep(.03)
        self.fail(f'output marker missing: {marker!r}')

    def test_auth_and_validation(self):
        with self.assertRaises(HTTPError) as error:
            self.request('GET', '/health', token='wrong')
        self.assertEqual(error.exception.code, 401)
        self.assertEqual(self.request('GET', '/health')['service'], 'w3-terminal')
        with self.assertRaises(HTTPError) as error:
            self.request('POST', '/sessions', {'cwd': str(self.root / 'missing')})
        self.assertEqual(error.exception.code, 400)
        session = self.request('GET', '/sessions')['sessions'][0]['id']
        for body in [{'cols': 0}, {'rows': 9999}]:
            with self.assertRaises(HTTPError):
                self.request('POST', f'/sessions/{session}/resize', body)
        with self.assertRaises(HTTPError):
            self.request('POST', f'/sessions/{session}/input', {'data': 3})

    def test_real_repo_python_state_interrupt_and_exit(self):
        repo = self.root / 'repo'
        repo.mkdir()
        subprocess.run(['git', 'init', '-q', str(repo)], check=True)
        (repo / 'sample.txt').write_text('sample')
        session = self.request('POST', '/sessions', {'cwd': str(repo)})['id']
        self.request('POST', f'/sessions/{session}/resize', {'cols': 96, 'rows': 30})
        self.request('POST', f'/sessions/{session}/input', {'data': "export W3_TEST_VAR=retained; cd ..; printf 'READY_%s\\n' ok\r"})
        _, offset = self.wait_output(session, b'READY_ok')
        self.request('POST', f'/sessions/{session}/input', {'data': "printf '%s\\n' \"$W3_TEST_VAR\"; pwd; python3 -c 'print(6*7)'; git -C repo status --porcelain; stty size; printf 'DONE_%s\\n' ok\r"})
        output, offset = self.wait_output(session, b'DONE_ok', offset)
        self.assertIn(b'retained', output)
        self.assertIn(str(self.root).encode(), output)
        self.assertIn(b'42', output)
        self.assertIn(b'?? sample.txt', output)
        self.assertIn(b'30 96', output)
        # Attach again using the public session list, then interrupt a foreground process.
        self.assertIn(session, [s['id'] for s in self.request('GET', '/sessions')['sessions']])
        self.request('POST', f'/sessions/{session}/input', {'data': 'sleep 30\r'})
        time.sleep(.15)
        self.request('POST', f'/sessions/{session}/input', {'data': '\x03'})
        self.request('POST', f'/sessions/{session}/input', {'data': "printf 'INTERRUPTED_%s\\n' ok\r"})
        _, offset = self.wait_output(session, b'INTERRUPTED_ok', offset)
        self.request('POST', f'/sessions/{session}/input', {'data': 'exit 7\r'})
        for _ in range(100):
            result = self.request('GET', f'/sessions/{session}/output?offset={offset}')
            if result['exitCode'] is not None:
                self.assertEqual(result['exitCode'], 7)
                break
            time.sleep(.03)
        else:
            self.fail('shell exit status missing')

    def test_session_limit_and_bounded_replay(self):
        first = self.request('GET', '/sessions')['sessions'][0]['id']
        for _ in range(3):
            self.request('POST', '/sessions', {'cwd': str(self.root)})
        with self.assertRaises(HTTPError) as error:
            self.request('POST', '/sessions')
        self.assertEqual(error.exception.code, 409)
        self.request('POST', f'/sessions/{first}/input', {'data': "python3 -c \"print('x'*1100000)\"\r"})
        for _ in range(100):
            result = self.request('GET', f'/sessions/{first}/output?offset=0')
            if result['truncated']:
                break
            time.sleep(.03)
        self.assertTrue(result['truncated'])
        self.assertLessEqual(len(base64.b64decode(result['data'])), 65536)
        self.request('POST', f'/sessions/{first}/close')
        replacement = self.request('POST', '/sessions')['id']
        self.assertNotEqual(first, replacement)


if __name__ == '__main__':
    unittest.main()

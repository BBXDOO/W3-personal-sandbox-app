"""Template expanded on-device by Android; credentials never enter JavaScript."""
import base64
import json
import os
from pathlib import Path
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen

TOKEN = '__W3_TOKEN__'
PORT = 8766
SOURCE = '''__W3_SOURCE__'''

# Repeated setup reconnects to the same authenticated service and running shells.
try:
    request = Request(f'http://127.0.0.1:{PORT}/health', headers={'Authorization': 'Bearer ' + TOKEN})
    with urlopen(request, timeout=2) as response:
        health = json.load(response)
    if health.get('service') != 'w3-terminal' or health.get('protocol') != 1:
        raise SystemExit('Port 8766 is in use by another service. Stop that service first.')
    print('W3 Terminal is already running. Return to Sandbox and tap Connect.')
    raise SystemExit(0)
except HTTPError:
    raise SystemExit('A terminal with another connection key is running. Stop the old terminal service first.')
except OSError:
    pass

folder = Path.home() / '.local/share/w3-sandbox'
folder.mkdir(parents=True, exist_ok=True)
os.chmod(folder, 0o700)
server_file = folder / 'server.py'
token_file = folder / 'token'
server_file.write_bytes(base64.b64decode(SOURCE))
token_file.write_text(TOKEN)
os.chmod(token_file, 0o600)
print('Starting W3 Terminal. Keep this Termux session running, then return to Sandbox and tap Connect.', flush=True)
os.execv(sys.executable, [sys.executable, str(server_file), '--port', str(PORT), '--token-file', str(token_file)])

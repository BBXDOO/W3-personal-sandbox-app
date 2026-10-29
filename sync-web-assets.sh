#!/usr/bin/env sh
set -eu
APP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WEB_SOURCE=${1:?Pass the Personal Sandbox web source directory}
WEB_SOURCE=$(CDPATH= cd -- "$WEB_SOURCE" && pwd)
(cd "$WEB_SOURCE" && npm run build)
python3 - "$WEB_SOURCE" "$APP_ROOT" <<'PYTHON'
from pathlib import Path
import shutil, sys
source, app = map(Path, sys.argv[1:])
target = app / 'app/src/main/assets/www'
shutil.rmtree(target)
shutil.copytree(source / 'dist', target)
shutil.copy(app / 'compact.css', target / 'compact.css')
index = target / 'index.html'
index.write_text(index.read_text().replace('</head>', '<link rel="stylesheet" href="./compact.css">\n</head>'))
PYTHON

#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
npm run build
rm -rf android-app/app/src/main/assets/www
mkdir -p android-app/app/src/main/assets/www
cp -R dist/. android-app/app/src/main/assets/www/
echo "Android web assets updated."

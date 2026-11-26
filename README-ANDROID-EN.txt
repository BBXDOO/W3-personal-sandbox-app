W3 Personal Sandbox v69 (0.69)

This repository contains the React/TypeScript source in web/ and the Android project at its root.
Use Node.js 24, Python 3, JDK 17, Android SDK 35 and Gradle 8.9.

From the repository root:
  npm ci --prefix web
  npm run lint
  npm run check:manual
  npm run build
  npm run verify:release
  gradle --no-daemon :app:assembleDebug

Web assets are packaged in app/src/main/assets/www. The WebView loads the
built-in https://appassets.androidplatform.net/assets/www/ origin.
File selection uses Android's document picker. Export uses ACTION_CREATE_DOCUMENT.
INTERNET permission is used for GitHub release checks and APK downloads.
The packaged editor opens offline. The Terminal panel connects to a Python PTY service in Termux. Setup requires
Python in Termux. Automatic startup additionally requires RUN_COMMAND and
allow-external-apps=true. Builds without RunCommandService use a native
copy-and-open button so the user can paste the packaged bootstrap in Termux.
AndroidBridge authenticates native HTTP requests to 127.0.0.1:8766.

GitHub Actions rebuilds web/ and checks committed assets before compiling Android.
Keep the existing application ID and release signing key when updating installed apps.
See README.md and RELEASE_CHECKLIST_TH.md for the development and release process.

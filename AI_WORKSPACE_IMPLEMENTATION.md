# AI Workspace / Qwen3 Tool Bridge — implementation specification

Status: planned; not yet implemented in APK.
Base: `refactor/v0.2`. Development branch: `feature/ai-workspace-tool-bridge`.

## User-facing requirements
- Add a **new sidebar item immediately after ทดลอง (Play)**, labelled **AI Workspace**.
- Do not replace, repurpose, or remove the existing AI Chat / robot control.
- Chat with the local Qwen3 server, and enable explicitly approved file/project operations.
- Work with W3 projects and user-selected external document folders; never claim arbitrary installed apps are automatically controllable.
- Keep all existing project data, offline editing, export/import and story features intact.

## Architecture
1. Existing W3 React web UI: independent AI Workspace chat panel, session history, tool-call confirmation and result viewer.
2. Android WebView bridge: narrowly scoped native operations. Prefer Android Storage Access Framework (ACTION_OPEN_DOCUMENT_TREE / persistable URI grants) for user-selected directories. No blanket storage permission.
3. Local service: existing Termux Qwen3 and Python API at loopback; define health checks, explicit opt-in and clear offline/unavailable errors. Do not expose a local service on a public interface.
4. Tool router: allowlist read/list/write/create operations with path/URI validation; require explicit approval for modifications and never silently overwrite or delete. Log operation outcomes without credentials.
5. External apps: use documented Android intents, SAF, or official APIs; assess each connector separately.

## Existing updater — preserve unchanged until tested
- Existing UI calls `AndroidBridge.checkUpdate`.
- `MainActivity.java` checks the latest GitHub Release, validates the version and APK SHA-256, downloads into app cache and requests Android package installation.
- The owner-signed APK must retain package identity and signing key; Android confirms installation.
- `.github/workflows/build-apk.yml` supports owner-signed releases and GitHub Release publication.
- A new branch build/debug APK is **not** an in-app update. Publishing an owner-signed higher-version GitHub Release is required.
- Never publish a release before testing on a device and obtaining owner approval.

## Manual / release requirements
- Update **both** `USER_GUIDE_TH.md` and `app/src/main/assets/www/user-guide.md` with identical content when feature is implemented.
- Update bundled frontend JS and `release-info.json` (version, manual SHA-256 and source fingerprint) together.
- Ensure `check-release.py` and `check:manual` pass before building.
- Describe consent, folder access, chat availability, errors, tool confirmations, and update behavior accurately.
- Avoid increasing the app version or marking features released before implementation.

## Acceptance tests
1. Sidebar AI Workspace appears directly after ทดลอง on narrow Android screens; old AI Chat works.
2. Qwen3 connection success, timeout, unavailable server and malformed response are handled.
3. Read-only file access cannot write; write requires user permission; denied access is handled.
4. Project save/export/import still works; no unintended modifications.
5. Existing update button detects the signed latest release, verifies digest, and hands off to Android installer.
6. Bundled guide matches repository guide, release manifest and shipped UI.

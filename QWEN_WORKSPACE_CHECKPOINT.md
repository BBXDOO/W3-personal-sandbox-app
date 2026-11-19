# Qwen3 Workspace — Integration checkpoint

Status: **IMPLEMENTED IN SOURCE / NOT BUILT / NOT TESTED ON DEVICE**.

## Scope

- Adds a 💻 launcher immediately above the existing **รูปแบบ** control in the project navigation.
- Preserves all existing Sandbox project modes, existing format control, update mechanism and project persistence.
- Opens an isolated iframe with Thai tabs: **สนทนา**, **เอกสาร**, **เครื่องมือ**.
- The Android native bridge exposes only fixed loopback calls: GET `http://127.0.0.1:8090/api/health` and POST `http://127.0.0.1:8090/api/chat` with `{"provider":"qwen","message":"..."}`.
- Bearer token is pasted by the owner at runtime and held in Android process memory, not in Git or localStorage. It must be re-entered after the app process is terminated. Do not paste it in chat.
- The native API has no approve, delete, arbitrary path, arbitrary URL or shell execution methods.
- Proposals are rendered as **text only**, never interpreted as HTML and never auto-applied.
- User-initiated exports reuse the existing Android Storage Access Framework save picker. Imported files are loaded only into the Qwen iframe memory, not the existing Sandbox project.
- Android network security allows cleartext HTTP only for loopback hostnames. The app still uses HTTPS for remote updates.

## Implementation notes

- The iframe has `sandbox="allow-scripts allow-downloads"` and does not receive same-origin privilege.
- A parent-frame relay checks `event.source === activeFrame.contentWindow`; only known request actions are forwarded.
- `AndroidBridge` is an existing global JS interface and remains reachable from all WebView frames. This design limits the new native actions but **does not provide origin-isolated per-frame JavaScript interfaces**. A future hardening step should move to an origin-restricted WebMessageListener or equivalent.
- Local API requires the Termux service and Qwen3 to be running on the **same device**.
- Health success confirms the API is reachable; it does not guarantee the upstream model is healthy.
- Native requests are single-flight with bounded payload and response sizes, and do not print the token.
- No build pipeline or real-device test has been run for this branch.

## Device acceptance tests (not yet executed)

1. Open existing Sandbox; confirm Library, BG–Bookcraft and Concept mind map data and save/update behavior remain unchanged.
2. Enter a project. Verify 💻 appears directly above รูปแบบ, and that รูปแบบ still works.
3. Open and close Qwen workspace repeatedly; ensure navigation and back button still behave as before.
4. With Termux stopped, press ตรวจสถานะ API; verify clear failure, no crash.
5. Start API 8090, press ตรวจสถานะ API; verify success.
6. Paste local token into the password field; verify input clears after submission and no token appears in chat/export.
7. Send Thai message; verify answer and optional proposal appear separately.
8. Kill llama-server while API is up; verify chat failure is reported without hanging indefinitely.
9. Import text and JSON, edit, save to temporary list and export using Android document picker.
10. Create and export tools JSON; import the exported JSON and verify values.
11. Try invalid file type, oversized import and malformed tools JSON; verify safe rejection.
12. Verify proposals never write files and no `/api/approve` call is made.
13. Reboot or force-stop app; verify token must be entered again.

## Known limitations

- Files and tool lists in the workspace are in-memory until explicitly exported. Do not assume autosave.
- The file picker and exports require Android WebView/device verification.
- The backend may return structured file proposals rather than ordinary conversational prose.
- The exact API authentication and response contract was inferred from earlier device source inspection; must be revalidated on the installed version.
- The branch is experimental. Do not publish a release or overwrite the installed APK before device tests.

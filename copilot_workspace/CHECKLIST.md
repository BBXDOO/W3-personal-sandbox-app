# Checklists

## Develop
- [ ] Work only inside `copilot_workspace/` unless told otherwise
- [ ] Copy `source/`, never edit the original template
- [ ] `npm ci` then `npm run lint`
- [ ] After edits: `sh android-app/sync-web-assets.sh` to rebuild offline web bundle

## Test
- [ ] `npm run dev` for browser check
- [ ] Android debug APK: JDK 17, Gradle 8.9, Android SDK 35, `:app:assembleDebug`
- [ ] Export JSON before uninstalling an old debug APK

## Security (public repo)
- [ ] No private keys, keystores, tokens, passwords
- [ ] No personal project JSON or personal data
- [ ] Check app name, package ID and signing key before sharing a build
- [ ] Debug APK is a test build, not a release

## Release
- [ ] Owner reviews PR into `refactor/v0.2`
- [ ] Owner approves before any distribution

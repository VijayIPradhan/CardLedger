# CardLedger — Native Android

A native Kotlin + Jetpack Compose app for CardLedger. Talks to the existing backend at **`https://cards.imvj.host/api`**. This is separate from the Capacitor app (`packages/app`) and uses a distinct app id so both can be installed side by side.

- **appId:** `com.imvj.cardledger`
- **min SDK:** 24 · **target/compile SDK:** 34 · **JDK:** 17
- **API base URL:** `https://cards.imvj.host/api/` (set via `buildConfigField API_BASE_URL` in `app/build.gradle.kts`)

## Features
- JWT login against the server; PIN + biometric app lock; 5-minute background auto-lock
- Home dashboard: portfolio utilization ring, swipeable card carousel (native `HorizontalPager`), upcoming dues, recent transactions
- Full CRUD: cards (with BIN detection via binlist.net + local network detection), holders/friends, transactions ("who used"), edit/delete
- Usage = all unpaid spend (all-time), holder-agnostic
- Native SMS import (READ_SMS/RECEIVE_SMS) + Kotlin parser + review queue
- Due-date reminders via AlarmManager + notifications; settings (PIN, biometric, reminders, sign out)

## Prerequisites
- JDK 17 (e.g. `C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot`)
- Android SDK (platform 34). Either set `ANDROID_HOME` or create `local.properties` with `sdk.dir=C\:\\Android`
- `local.properties` is git-ignored — create it locally if the SDK isn't auto-detected

## Build (debug APK)
From `packages/android-native/`:
```bash
JAVA_HOME="/c/Program Files/Microsoft/jdk-17.0.18.8-hotspot" ./gradlew.bat assembleDebug
```
APK output: `app/build/outputs/apk/debug/app-debug.apk`

## Install
```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
Log in with your server credentials (default `admin` / `changeme123`).

## Notes
- **Play Protect**: because the app reads SMS and is sideloaded (not from the Play Store), Play Protect will flag it. Install via `adb` with Play Protect scanning disabled, or tap "Install anyway". This is Android policy for off-Store SMS apps and is not a code issue.
- The build uses the Gradle **8.7** wrapper (AGP 8.5.2, Kotlin 1.9.24). Do not use a globally-installed newer Gradle.
- Architecture: single-activity Compose, MVVM (ViewModel + StateFlow), thin repositories over a Retrofit `ApiService`, manual DI via `AppContainer` on the `Application`. Domain logic (holder resolution, billing cycles, utilization, BIN detection, SMS parsing) is ported to Kotlin under `domain/`.

## GitHub Actions Release Automation
A fully automated GitHub Actions workflow is available at [android-release.yml](file:///home/ubuntu/OpenWebUI/CardLedger/.github/workflows/android-release.yml) (`Build Android APK & Release`).

### How It Works
- **Automatic Releases**: Pushing a tag starting with `v` (e.g. `git tag v1.0.0 && git push origin v1.0.0`) or creating a GitHub Release via the GitHub UI automatically triggers the build and uploads `CardLedger-debug.apk` and `CardLedger-release.apk` (or `CardLedger-release-unsigned.apk`) to the Release assets.
- **Manual Trigger**: Go to **Actions** -> **Build Android APK & Release** -> **Run workflow** (`workflow_dispatch`). You can select whether to build `both`, `debug`, or `release`, and optionally specify a `tag_name` to attach the APKs directly to an existing release.
- **Artifact Storage**: Every run (manual or automated) saves the APKs under Workflow Summary Artifacts (`CardLedger-APKs-<sha>`) with 30 days retention.

### Optional Repository Secrets
To automatically inject client IDs and sign release builds cleanly inside GitHub Actions, add these secrets under **Settings -> Secrets and variables -> Actions**:
- `GOOGLE_CLIENT_ID`: Populated into `local.properties` during the build.
- `KEYSTORE_BASE64`: Base64-encoded release keystore (`base64 -w 0 my-release-key.jks`).
- `KEYSTORE_PASSWORD`: Keystore password.
- `KEY_ALIAS`: Keystore key alias.
- `KEY_PASSWORD`: Key alias password.


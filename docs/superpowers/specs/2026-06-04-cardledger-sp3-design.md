# CardLedger — Sub-project 3 Design Spec
_Date: 2026-06-04_

## Overview

Sub-project 3 adds the Android-native layer to CardLedger:

1. **SMS parser engine** — pure TypeScript, table-driven, lives in `packages/shared`
2. **Custom inline Kotlin SMS plugin** — reads inbox + live receiver, `READ_SMS` + `RECEIVE_SMS`
3. **Biometric app lock** — replaces PIN stub with biometric → PIN fallback
4. **Review queue UI** — low-confidence parses surface for manual confirmation
5. **APK build pipeline** — `cap add android` + Gradle debug APK

Sub-project 1 (foundation, PWA) is complete. Sub-project 2 (standalone parser test suite) is folded into this spec — the parser engine is built here with full Vitest coverage.

---

## 1. Tech Stack Additions

| Layer | Choice |
|---|---|
| SMS plugin | Custom inline Kotlin (no npm) |
| Biometric | `@aparajita/capacitor-biometric-auth` v7 |
| App lifecycle | `@capacitor/app` (appStateChange for 5-min lock) |
| Parser | Pure TypeScript + `parser-rules.json` static import |
| Hashing | WebCrypto `subtle.digest('SHA-256', ...)` |
| Android SDK | 34 (min SDK 24) |
| JDK | 17 |

---

## 2. File Structure

```
packages/shared/src/sms/
├── types.ts              # ParseResult, ParserRule, SmsInput
├── parser.ts             # parseSms() — main entry point
├── normalize.ts          # amount / date normalization helpers
├── dedupeHash.ts         # sha256(sender + body + timestamp)
└── parser.test.ts        # Vitest table-driven fixtures (from original brief §8)

packages/app/src/
├── plugins/
│   └── SmsPlugin.ts      # Capacitor TS bridge
├── lib/
│   ├── permissions.ts    # requestAllPermissions() — single prompt
│   └── biometric.ts      # checkBiometric(), unlockWithBiometric()
├── store/
│   └── reviewStore.ts    # Zustand persisted — low-confidence queue
└── screens/
    ├── PermissionSetupScreen.tsx   # one-time Android permission screen
    ├── SmsImportScreen.tsx         # inbox scan + live listener
    └── ReviewQueueScreen.tsx       # confirm / edit / dismiss

packages/app/android/
└── app/src/main/java/com/cardledger/app/
    ├── SmsPlugin.kt       # Capacitor plugin: readInbox + addListener
    └── SmsReceiver.kt     # BroadcastReceiver for RECEIVE_SMS
```

---

## 3. Permissions

All declared in `AndroidManifest.xml`. Runtime request happens **once**, in a single `requestPermissions()` call on `PermissionSetupScreen`:

```xml
<uses-permission android:name="android.permission.READ_SMS" />
<uses-permission android:name="android.permission.RECEIVE_SMS" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.USE_FINGERPRINT" />
```

`USE_BIOMETRIC` and `USE_FINGERPRINT` are normal permissions — declared only, no runtime prompt. `READ_SMS` and `RECEIVE_SMS` are dangerous permissions — requested together in one call.

---

## 4. SMS Plugin

### TypeScript bridge (`SmsPlugin.ts`)

```typescript
export interface SmsMessage {
  sender: string;
  body: string;
  timestamp: number;   // Unix ms
}

export interface SmsPlugin {
  readInbox(options: { daysBack: number }): Promise<{ messages: SmsMessage[] }>;
  checkPermissions(): Promise<{ sms: PermissionState }>;
  requestPermissions(): Promise<{ sms: PermissionState }>;
  addListener(
    event: 'smsReceived',
    handler: (msg: SmsMessage) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export const Sms = registerPlugin<SmsPlugin>('SmsPlugin', {
  web: () => ({
    readInbox: async () => ({ messages: [] }),
    checkPermissions: async () => ({ sms: 'denied' as PermissionState }),
    requestPermissions: async () => ({ sms: 'denied' as PermissionState }),
    addListener: async () => ({ remove: async () => {} }),
    removeAllListeners: async () => {},
  }),
});
```

The web stub returns empty — SMS features are silently no-ops on PWA.

### Kotlin plugin (`SmsPlugin.kt`)

- `@PluginMethod readInbox` — queries `content://sms/inbox` for all SMS within `daysBack` days, returns array of `{sender, body, timestamp}`
- Registers/unregisters `SmsReceiver` on plugin load/unload
- `SmsReceiver` fires `notifyListeners("smsReceived", data)` on new SMS

### `SmsReceiver.kt`

- Registered in `AndroidManifest.xml` with `android.provider.Telephony.SMS_RECEIVED` intent filter, `priority="999"`
- On receive → extracts sender + body → calls back to `SmsPlugin` via static reference

---

## 5. SMS Parser Engine

### Entry point (`parser.ts`)

```typescript
export function parseSms(input: SmsInput): ParseResult | null
```

**Flow:**
1. Load `parser-rules.json` (static import — bundled at build time)
2. For each bank rule: check `senderPatterns` → run regex → collect named groups
3. Score: `amount + last4 + date + merchant` all captured → `high`; any missing → `low`
4. If no bank rule matches: try fallback rule → always `low`
5. If zero named groups captured (OTP / non-transaction) → return `null`
6. Normalize amount (strip ₹/Rs/INR, parse float) and date (→ ISO `yyyy-MM-dd`)
7. Compute `dedupeHash`
8. Return `ParseResult`

### Types (`types.ts`)

```typescript
export interface SmsInput {
  sender: string;
  body: string;
  timestamp?: number;
}

export interface ParseResult {
  bank: string;
  last4: string;
  amount: number;
  merchant: string;
  date: string;           // ISO yyyy-MM-dd
  confidence: 'high' | 'low';
  dedupeHash: string;
  raw: SmsInput;
}
```

### Test fixtures (`parser.test.ts`)

Table-driven Vitest suite covering all fixtures from the original brief §8:
- HDFC standard spend → high confidence
- ICICI Amazon Pay → high confidence
- SBI spend → high confidence
- Flipkart Axis → high confidence
- OTP message → null
- Unknown bank fallback → low confidence
- Dedupe: same message twice → same `dedupeHash`
- Holder resolution: txn dated during friend's assignment → `holder_id_at_time = friendId`

---

## 6. Biometric App Lock

### Lock triggers
- Cold start
- App backgrounded → foregrounded after **5 minutes** (via `App.addListener('appStateChange', ...)`)

### `biometric.ts`

```typescript
export async function unlockWithBiometric(): Promise<'success' | 'fallback' | 'unavailable'>
```

- Calls `BiometricAuth.checkBiometry()` — if not available → `'unavailable'`
- Calls `BiometricAuth.authenticate({ reason: 'Unlock CardLedger', allowDeviceCredential: false })`
- Success → `'success'`
- User cancels / taps "Use PIN" → `'fallback'`

### Updated `AppLockScreen` flow

1. Mount → call `unlockWithBiometric()`
2. `'success'` → `unlock()` + navigate Home
3. `'unavailable'` or `'fallback'` → show `PinPad`
4. PIN verified → `unlock()` + navigate Home

### Settings toggle

"Biometric unlock" toggle in `SettingsScreen`. Preference stored in `localStorage` under `cl_biometric_enabled`. If `false`, skip biometric attempt and show PIN directly.

---

## 7. Review Queue

### `reviewStore.ts` (Zustand, persisted to `localStorage`)

```typescript
interface ReviewItem {
  id: string;
  parseResult: ParseResult;
  cardId?: string;    // auto-matched by last4 at enqueue time; undefined = user must pick from dropdown
}
```

Actions: `enqueue(item)`, `confirm(id, txnData)`, `dismiss(id)`

### `SmsImportScreen`

- "Scan Inbox" button → `Sms.readInbox({ daysBack: 90 })`
- Each message → `parseSms()` → dedupe check against known hashes
- `high` confidence → auto-POST `/transactions`
- `low` confidence → `reviewStore.enqueue()`
- Summary toast: `"12 imported · 3 need review"`
- Live listener active while screen mounted — new SMS auto-parsed in real time
- Android only (hidden on web via `Capacitor.isNativePlatform()`)

### `ReviewQueueScreen`

- List of pending `ReviewItem`s
- Each card: raw SMS body (truncated), pre-filled amount / merchant / date / last4 (editable)
- "Confirm" → POST `/transactions` + `dismiss(id)`
- "Dismiss" → `dismiss(id)` without saving
- Empty state: "All caught up ✓"

### BottomNav badge

On Android, BottomNav renders a 4th "SMS" tab with a red badge showing `reviewStore.queue.length`. On web, stays at 3 tabs.

---

## 8. APK Build Pipeline

### `packages/app/package.json` scripts

```json
"cap:init":    "cap add android",
"cap:build":   "pnpm build && cap sync android",
"cap:apk":     "cd android && ./gradlew assembleDebug",
"cap:install": "adb install android/app/build/outputs/apk/debug/app-debug.apk",
"cap:run":     "pnpm cap:build && pnpm cap:apk && pnpm cap:install"
```

### `capacitor.config.ts`

```typescript
const isDev = process.env.NODE_ENV !== 'production';
const config: CapacitorConfig = {
  appId: 'com.cardledger.app',
  appName: 'CardLedger',
  webDir: 'dist',
  server: isDev
    ? { url: 'http://10.0.2.2:3001', androidScheme: 'http' }
    : undefined,  // production: uses bundled dist, talks to deployed server
  plugins: {
    SplashScreen: { launchAutoHide: false },
  },
};
```

`10.0.2.2` is Android emulator's alias for host `localhost`.

### AndroidManifest.xml additions

```xml
<uses-permission android:name="android.permission.READ_SMS" />
<uses-permission android:name="android.permission.RECEIVE_SMS" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.USE_FINGERPRINT" />
<uses-permission android:name="android.permission.INTERNET" />

<receiver android:name=".SmsReceiver" android:exported="true">
  <intent-filter android:priority="999">
    <action android:name="android.provider.Telephony.SMS_RECEIVED" />
  </intent-filter>
</receiver>
```

---

## 9. App.tsx Updates

- Add `PermissionSetupScreen` route (`/setup-permissions`) — redirected to after first login on Android if permissions not yet granted
- Add `SmsImportScreen` route (`/sms`)
- Add `ReviewQueueScreen` route (`/sms/review`)
- Wire `App.addListener('appStateChange')` in `main.tsx` for 5-min background lock

---

## 10. Out of Scope

- Play Store submission (sideload only — documented in README)
- iOS support
- Sub-project 2 standalone test harness (parser tests are included here in `parser.test.ts`)
- Push notifications for new SMS (receiver handles live alerts instead)
- End-to-end encrypted sync (Sub-project 4+)

---

## 11. Success Criteria

- [ ] `parseSms()` passes all 8 fixture tests including dedupe and OTP rejection
- [ ] `cap add android` succeeds, `cap sync` copies assets
- [ ] `READ_SMS` + `RECEIVE_SMS` requested together in single runtime prompt
- [ ] `Sms.readInbox({ daysBack: 90 })` returns real SMS on physical device
- [ ] High-confidence parse auto-commits to `/transactions`
- [ ] Low-confidence parse appears in review queue
- [ ] Biometric unlock works on enrolled device; falls back to PIN gracefully
- [ ] 5-minute background lock triggers correctly
- [ ] `./gradlew assembleDebug` produces installable APK
- [ ] PWA (web) unaffected — SMS tabs hidden, biometric skipped, no errors

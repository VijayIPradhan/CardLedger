# CardLedger — Native Android App Design Spec
_Date: 2026-06-07_

## Overview

A full native Android app (Kotlin + Jetpack Compose) replacing the Capacitor WebView, built for native performance and feel. It talks to the **existing** backend at `https://cards.imvj.in/api` — the server, database, and React PWA are untouched. The Capacitor app (`packages/app`) stays in place until the native app reaches parity.

Built **all at once** (all feature areas), best-practice MVVM, **no automated tests** (manual testing by the user).

- **Location:** `packages/android-native/` — standalone Gradle project
- **appId:** `com.imvj.cardledger` (distinct from Capacitor's `com.cardledger.app`, so both can be installed)
- **API base:** `https://cards.imvj.in/api`

---

## 1. Tech Stack

| Concern | Choice |
|---|---|
| Language / UI | Kotlin, Jetpack Compose (Material3) |
| Min / Target SDK | 24 / 34, JDK 17 |
| Build | Gradle (Kotlin DSL), AGP 8.x, Kotlin 1.9.x, Compose BOM |
| Networking | Retrofit 2.11 + OkHttp + `kotlinx.serialization` converter |
| Async / state | Coroutines + StateFlow, `ViewModel` (androidx.lifecycle) |
| Navigation | Navigation-Compose |
| Persistence | DataStore (Preferences) — JWT, PIN hash, prefs |
| Biometric | `androidx.biometric:biometric` |
| Notifications | `AlarmManager` + `NotificationManager` (exact-ish daily reminders) |
| DI | Manual `AppContainer` on the `Application` (no Hilt) |
| Images | Network/bank logos drawn in Compose (Canvas/Text) — no asset pipeline |

---

## 2. Architecture

MVVM with a thin repository layer:

```
Compose Screen  ──observes──▶ ViewModel (StateFlow<UiState>) ──calls──▶ Repository ──▶ Retrofit ApiService ──▶ server
```

- **AppContainer** (created in `CardLedgerApp : Application`) builds OkHttp/Retrofit, DataStore, and all repositories; ViewModels get it via a `ViewModelProvider.Factory` or `viewModel { }` lambda.
- **UiState** per screen: `sealed`/data class with `loading`, `data`, `error`.
- Repositories expose `suspend` functions returning `Result<T>`; ViewModels map to UiState.
- One **`TokenStore`** (DataStore) holds the JWT; an OkHttp `AuthInterceptor` adds `Authorization: Bearer <jwt>`; a response check on 401 clears the token and signals re-login.

### Project layout
```
packages/android-native/
├── settings.gradle.kts, build.gradle.kts, gradle.properties, gradlew[.bat], gradle/wrapper/
└── app/
    ├── build.gradle.kts
    └── src/main/
        ├── AndroidManifest.xml
        ├── res/ (themes, strings, icons)
        └── java/com/imvj/cardledger/
            ├── CardLedgerApp.kt              # Application + AppContainer
            ├── MainActivity.kt               # single-activity, hosts NavHost
            ├── ui/theme/                      # Color.kt, Theme.kt, Type.kt
            ├── ui/components/                 # CardTile, SpendRing, HolderBadge, BottomSheet wrappers, PinPad, Fab
            ├── ui/nav/                        # NavGraph.kt, BottomBar.kt, Routes.kt
            ├── ui/screens/                    # Login, Lock, Home, CardDetail, AddEditCard, Holders, Sms, Review, Settings
            ├── data/net/                      # ApiService.kt, dto/*.kt, AuthInterceptor.kt, NetworkModule.kt
            ├── data/store/                    # TokenStore.kt, PrefsStore.kt
            ├── data/repo/                     # AuthRepository, CardRepository, HolderRepository, AssignmentRepository, TransactionRepository
            ├── domain/                        # resolveHolder, billingCycle, analytics, cardType, sms parser (ported from TS)
            ├── sms/                           # SmsReader (ContentResolver), SmsReceiver
            ├── notif/                         # ReminderScheduler, BootReceiver, ReminderReceiver
            └── feature/                       # *ViewModel.kt
```

---

## 3. Theme

Material3 dark color scheme matching the existing tokens:
- `base` #0A0A0A (background), `surface` #111111, `elevated` #1A1A1A, `gold` #C8A96E (primary), `gold-hi` brighter gold, `muted` gray text, `danger` red, `success` green, `warning` amber.
- Inter font (bundle Inter or use the system default with similar weight).
- Rounded shapes: card 24dp, input 16dp, chip 12dp.
- Network gradients for `CardTile` (Visa indigo, Mastercard red, RuPay green, Amex teal), via `Brush.linearGradient`.

---

## 4. Networking layer

`ApiService` (Retrofit) — mirrors the server routes:

```
POST   /auth/login              {username,password} -> {token}
GET    /cards                   -> [Card]
GET    /cards/{id}              -> Card
POST   /cards                   CreateCard -> Card
PATCH  /cards/{id}              UpdateCard -> Card
DELETE /cards/{id}             (204; 409 if has transactions)
GET    /holders                 -> [Holder]
POST   /holders                 CreateHolder -> Holder
PATCH  /holders/{id}            UpdateHolder -> Holder
DELETE /holders/{id}           (204; 409 if referenced)
GET    /assignments?card_id=&active=
POST   /assignments             CreateAssignment -> Assignment
POST   /assignments/{id}/return -> Assignment
DELETE /assignments/{id}       (204)
GET    /transactions?card_id=&holder_id=
GET    /transactions/{id}
POST   /transactions            CreateTransaction (optional holder_id_at_time) -> Transaction
PATCH  /transactions/{id}       UpdateTransaction -> Transaction
DELETE /transactions/{id}      (204)
```

**DTOs** (`kotlinx.serialization`, nullable where the API is): `Card` (id,last4,network,bank,nickname,billing_cycle_day,payment_due_day,credit_limit:String,bin?,variant?,created_at), `Holder`, `Assignment`, `Transaction` (amount:String). Numeric columns arrive as strings → parse with `.toDouble()` in domain/UI.

**AuthInterceptor:** adds Bearer header when a token exists. **401 handling:** repository maps 401 → clear token → ViewModel routes to Login. **409 handling:** delete repos return a typed `Result.failure` with a message surfaced in the UI.

---

## 5. Domain logic (ported to Kotlin, pure functions in `domain/`)

Direct ports of the TypeScript shared logic:
- `resolveHolder(cardId, txnDate, assignments): String?`
- `getCycleRange(cycleDay, today): Pair<String,String>` and `getDaysUntilDue(dueDay, today): Int`
- `getCardUtilization`, `getTotalUtilization`, `getUpcomingDues`
- `cardType`: `sanitize`, `extractBin`, `extractLast4`, `detectNetwork`, `luhnValid`
- `sms`: `parseSms(input): ParseResult?` with the same bank rules (HDFC/ICICI/SBI/Axis + fallback), OTP rejection, confidence, and a SHA-256 `dedupeHash` (java.security.MessageDigest)

Dates handled as ISO `yyyy-MM-dd` strings (java.time.LocalDate where math is needed).

---

## 6. Auth & App Lock

- **Launch flow:** no token → **Login**; token present → **Lock** → **Home**.
- **Login:** username/password form → `POST /auth/login` → store JWT.
- **App lock:** PIN (6-digit, hashed in DataStore) + biometric (`BiometricPrompt`); biometric attempted first on Android, PIN fallback. Lock on cold start and when returning from background after **5 minutes** (track via `ProcessLifecycleOwner`).
- **Settings:** lock now, set/change PIN, biometric toggle, sign out (clears token).

---

## 7. Navigation

Single-activity, Navigation-Compose. A bottom bar with **Home / Holders / Settings / SMS** is shown on the main destinations. `Login`, `Lock`, `AddEditCard`, `CardDetail`, `Review` are full-screen destinations without the bar. SMS tab shows a badge with the review-queue count.

---

## 8. Screens

- **Home (dashboard):** portfolio utilization ring (`SpendRing` Canvas) + total spent/limit; **HorizontalPager** card carousel (native paging — no WebView issues) with per-card utilization; upcoming-dues list (≤7 days); recent transactions (5); top-right "+" adds a card; floating "+" adds a transaction. Usage = **all unpaid spend (all-time)** per card (holder-agnostic), matching the current web behavior.
- **Card detail:** card tile (all-time usage), edit/delete card (409 message if it has txns), transaction history grouped by last 3 billing cycles, tap a transaction → edit/delete sheet, FAB to add.
- **Add/Edit card:** form (card-number field → BIN detect via `detectNetwork` + optional online lookup to binlist.net for bank/variant; full number never stored — only bin6+last4), network, bank, variant, nickname, billing day, due day, credit limit.
- **Holders:** list of friends with totals + per-card breakdown; add/edit/delete (409 message if referenced).
- **Add-transaction sheet:** card, amount, merchant, date, **who-used** (defaults to active-assignment holder else "me"); source `manual`.
- **SMS import:** "Scan inbox" (last 90 days via `ContentResolver` on `content://sms/inbox`), parse each, dedupe against server + local hashes, auto-commit high-confidence (card matched by last4) else enqueue to review; live `SmsReceiver` while the screen is active. **Android only.**
- **Review queue:** editable rows (amount/merchant/date/card) → confirm (POST) / dismiss.
- **Settings:** lock now, set/change PIN, biometric toggle, due-date reminders toggle + days-before, sign out.

---

## 9. SMS (native)

- Permissions `READ_SMS` + `RECEIVE_SMS` requested together at first use (a permission rationale screen). `SmsReader` queries the inbox; `SmsReceiver` (manifest-registered, `SMS_RECEIVED`) feeds live messages to the active screen via a shared flow.
- Parser is the Kotlin port (§5). Dedup via SHA-256 of `sender|body|timestamp`.
- Same Play Protect caveat as before (SMS-reading sideloaded app) — accepted by the user.

---

## 10. Reminders

`ReminderScheduler` computes each card's next due date (`getDaysUntilDue`) and schedules a notification `daysBefore` days prior at 9 AM via `AlarmManager` (`ReminderReceiver` posts the notification). Rescheduled on card changes and `BOOT_COMPLETED`. Settings toggle + days-before (default 3). `POST_NOTIFICATIONS` runtime permission on Android 13+.

---

## 11. Build & Deliverable

- Gradle wrapper committed; debug APK via `./gradlew assembleDebug` (JDK 17).
- API base URL is a `buildConfigField` defaulting to `https://cards.imvj.in/api`.
- Output: installable `com.imvj.cardledger` debug APK with full feature parity to the web app + native SMS/biometric/notifications.

---

## 12. Out of Scope

- Automated tests (user tests manually)
- iOS / Kotlin Multiplatform
- Removing the Capacitor app or PWA (kept until parity confirmed)
- Play Store release signing / submission
- Offline write queue (online-first; reads cached in memory per session)

---

## 13. Success Criteria

- [ ] `com.imvj.cardledger` debug APK builds and installs alongside the Capacitor app
- [ ] Login against the live server; PIN + biometric lock; 5-min background lock
- [ ] Home shows native carousel (no layout collapse), portfolio utilization, dues, recent
- [ ] Full CRUD for cards, holders, transactions, assignments against the API
- [ ] Add-card BIN detection; network logos on tiles; "who used" on transactions
- [ ] Usage = all unpaid spend (all-time), holder-agnostic
- [ ] SMS scan imports high-confidence txns + review queue; live receiver works
- [ ] Due-date reminders fire; settings toggles work
- [ ] Backend, web PWA, and Capacitor app remain unchanged and functional
```

# CardLedger Native Android — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **No automated tests** — each task ends with a Gradle build + commit. Manual testing by the user.

**Goal:** A full native Android app (Kotlin + Jetpack Compose) at `packages/android-native/` with feature parity to the CardLedger web app, talking to the existing API at `https://cards.imvj.in/api`.

**Architecture:** Single-activity Compose, MVVM (ViewModel + StateFlow), thin repositories over a Retrofit `ApiService`, manual DI via an `AppContainer` on the `Application`. Pure domain logic ported from the TypeScript `shared` package. DataStore for JWT/PIN/prefs; AndroidX Biometric; native SMS via ContentResolver; AlarmManager notifications.

**Tech Stack:** Kotlin 1.9.24, AGP 8.5, Compose BOM 2024.09, Material3, Navigation-Compose, Retrofit 2.11 + OkHttp 4.12 + kotlinx-serialization 1.6, Coroutines, DataStore, androidx.biometric, JDK 17, minSdk 24 / target 34, appId `com.imvj.cardledger`.

**Build command (every task):** from `packages/android-native/`:
`JAVA_HOME="/c/Program Files/Microsoft/jdk-17.0.18.8-hotspot" ./gradlew.bat assembleDebug`
Expected: `BUILD SUCCESSFUL`.

---

## Conventions for implementers

- Package root: `com.imvj.cardledger`. All files under `app/src/main/java/com/imvj/cardledger/`.
- Money/credit_limit/amount arrive from the API as **strings** — parse with `.toDouble()`.
- Every repository method returns `Result<T>` and never throws to the ViewModel.
- ViewModels expose `val uiState: StateFlow<XUiState>`; collect with `collectAsStateWithLifecycle()`.
- Colors/shapes come from the theme (Task 2). Never hardcode hex in screens — use `MaterialTheme.colorScheme` / the `CardLedgerColors` object.
- When a task says "full code," paste it verbatim. When it says "structure," follow the given composable skeleton and fill idiomatic Compose; keep each screen file focused.

---

## Task 1: Gradle project scaffold + Application + MainActivity

**Files (all new, under `packages/android-native/`):**
- `settings.gradle.kts`, `build.gradle.kts`, `gradle.properties`, `gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.properties`, `gradle/wrapper/gradle-wrapper.jar`
- `app/build.gradle.kts`, `app/proguard-rules.pro`
- `app/src/main/AndroidManifest.xml`
- `app/src/main/res/values/strings.xml`, `app/src/main/res/values/themes.xml`
- `app/src/main/java/com/imvj/cardledger/CardLedgerApp.kt`
- `app/src/main/java/com/imvj/cardledger/MainActivity.kt`

- [ ] **Step 1: Generate the Gradle wrapper**

From `packages/android-native/`, generate a wrapper pinned to Gradle 8.7 (compatible with AGP 8.5, JDK 17):
```
gradle wrapper --gradle-version 8.7
```
If `gradle` isn't on PATH, copy the wrapper files from the existing Capacitor project and edit the version:
copy `packages/app/android/gradlew`, `gradlew.bat`, and `gradle/wrapper/*` into `packages/android-native/`, then set `distributionUrl=https\://services.gradle.org/distributions/gradle-8.7-bin.zip` in `gradle/wrapper/gradle-wrapper.properties`.

- [ ] **Step 2: `settings.gradle.kts`**
```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "CardLedger"
include(":app")
```

- [ ] **Step 3: root `build.gradle.kts`**
```kotlin
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "1.9.24" apply false
}
```

- [ ] **Step 4: `gradle.properties`**
```
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
```

- [ ] **Step 5: `app/build.gradle.kts`**
```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.imvj.cardledger"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.imvj.cardledger"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "API_BASE_URL", "\"https://cards.imvj.in/api/\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    composeOptions { kotlinCompilerExtensionVersion = "1.5.14" }
    packaging { resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" } }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.09.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.6")
    implementation("androidx.lifecycle:lifecycle-process:2.8.6")
    implementation("androidx.navigation:navigation-compose:2.8.1")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}
```

- [ ] **Step 6: `app/proguard-rules.pro`** — leave empty (one comment line: `# keep defaults`).

- [ ] **Step 7: `app/src/main/res/values/strings.xml`**
```xml
<resources>
    <string name="app_name">CardLedger</string>
</resources>
```

- [ ] **Step 8: `app/src/main/res/values/themes.xml`** (Compose uses its own theme; this is the Activity base theme)
```xml
<resources>
    <style name="Theme.CardLedger" parent="android:Theme.Material.NoActionBar">
        <item name="android:statusBarColor">#0A0A0A</item>
        <item name="android:navigationBarColor">#0A0A0A</item>
        <item name="android:windowBackground">#0A0A0A</item>
    </style>
</resources>
```

- [ ] **Step 9: `AndroidManifest.xml`** (permissions/receivers added in later tasks; minimal now)
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:name=".CardLedgerApp"
        android:allowBackup="true"
        android:label="@string/app_name"
        android:icon="@android:drawable/sym_def_app_icon"
        android:roundIcon="@android:drawable/sym_def_app_icon"
        android:theme="@style/Theme.CardLedger"
        android:usesCleartextTraffic="false">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:theme="@style/Theme.CardLedger">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

- [ ] **Step 10: `CardLedgerApp.kt`** (stub AppContainer; filled in Tasks 2–4)
```kotlin
package com.imvj.cardledger

import android.app.Application

class CardLedgerApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
```

- [ ] **Step 11: `MainActivity.kt`** (placeholder UI; replaced by NavGraph in Task 11)
```kotlin
package com.imvj.cardledger

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface { Text("CardLedger") }
            }
        }
    }
}
```
> Note: `AppContainer` doesn't exist yet — Task 2 creates it. To keep this task building, temporarily create `AppContainer.kt` with `class AppContainer(app: android.app.Application)` (empty body); Task 2 fills it.

- [ ] **Step 12: Build & commit**
```
cd packages/android-native && JAVA_HOME="/c/Program Files/Microsoft/jdk-17.0.18.8-hotspot" ./gradlew.bat assembleDebug
git add packages/android-native
git commit -m "feat(native): Gradle/Compose scaffold + Application + MainActivity"
```
Expected: `BUILD SUCCESSFUL`, APK at `app/build/outputs/apk/debug/app-debug.apk`.

---

## Task 2: Theme

**Files:**
- `app/src/main/java/com/imvj/cardledger/ui/theme/Color.kt`
- `app/src/main/java/com/imvj/cardledger/ui/theme/Theme.kt`
- `app/src/main/java/com/imvj/cardledger/ui/theme/Type.kt`

- [ ] **Step 1: `Color.kt`**
```kotlin
package com.imvj.cardledger.ui.theme

import androidx.compose.ui.graphics.Color

val Base = Color(0xFF0A0A0A)
val Surface1 = Color(0xFF111111)
val Elevated = Color(0xFF1A1A1A)
val Gold = Color(0xFFC8A96E)
val GoldHi = Color(0xFFD9BE85)
val Muted = Color(0xFF8A8A8A)
val Danger = Color(0xFFE5484D)
val Success = Color(0xFF46A758)
val Warning = Color(0xFFE2A33C)
val OnDark = Color(0xFFFFFFFF)

// Network gradients (start,end)
val VisaGrad = listOf(Color(0xFF1A237E), Color(0xFF283593))
val MastercardGrad = listOf(Color(0xFFB71C1C), Color(0xFFC62828))
val RupayGrad = listOf(Color(0xFF1B5E20), Color(0xFF2E7D32))
val AmexGrad = listOf(Color(0xFF006064), Color(0xFF00838F))
val DefaultGrad = listOf(Elevated, Surface1)

fun networkGradient(network: String): List<Color> = when (network) {
    "Visa" -> VisaGrad
    "Mastercard" -> MastercardGrad
    "RuPay" -> RupayGrad
    "Amex" -> AmexGrad
    else -> DefaultGrad
}
```

- [ ] **Step 2: `Type.kt`**
```kotlin
package com.imvj.cardledger.ui.theme

import androidx.compose.material3.Typography

val AppTypography = Typography()
```

- [ ] **Step 3: `Theme.kt`**
```kotlin
package com.imvj.cardledger.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp

private val DarkColors = darkColorScheme(
    primary = Gold,
    onPrimary = Base,
    background = Base,
    onBackground = OnDark,
    surface = Surface1,
    onSurface = OnDark,
    surfaceVariant = Elevated,
    error = Danger,
)

val AppShapes = Shapes(
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
)

@Composable
fun CardLedgerTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = DarkColors, typography = AppTypography, shapes = AppShapes, content = content)
}
```

- [ ] **Step 4: Build & commit**
```
git add packages/android-native/app/src/main/java/com/imvj/cardledger/ui/theme
git commit -m "feat(native): CRED dark theme (colors, shapes, network gradients)"
```

---

## Task 3: Networking — DTOs, ApiService, interceptor, NetworkModule, stores

**Files:**
- `data/net/Dtos.kt`, `data/net/ApiService.kt`, `data/net/AuthInterceptor.kt`, `data/net/NetworkModule.kt`
- `data/store/TokenStore.kt`, `data/store/PrefsStore.kt`
- replace `AppContainer.kt`

- [ ] **Step 1: `data/net/Dtos.kt`**
```kotlin
package com.imvj.cardledger.data.net

import kotlinx.serialization.Serializable

@Serializable data class LoginRequest(val username: String, val password: String)
@Serializable data class LoginResponse(val token: String)

@Serializable
data class CardDto(
    val id: String,
    val last4: String,
    val network: String,
    val bank: String,
    val nickname: String,
    val billing_cycle_day: Int,
    val payment_due_day: Int,
    val credit_limit: String,
    val bin: String? = null,
    val variant: String? = null,
    val created_at: String? = null,
)

@Serializable
data class CreateCardDto(
    val last4: String,
    val network: String,
    val bank: String,
    val nickname: String,
    val billing_cycle_day: Int,
    val payment_due_day: Int,
    val credit_limit: Double,
    val bin: String? = null,
    val variant: String? = null,
)

@Serializable
data class HolderDto(
    val id: String,
    val name: String,
    val phone: String,
    val relationship: String,
    val created_at: String? = null,
)

@Serializable
data class CreateHolderDto(val name: String, val phone: String, val relationship: String)

@Serializable
data class AssignmentDto(
    val id: String,
    val card_id: String,
    val holder_id: String,
    val handed_over_date: String,
    val returned_date: String? = null,
    val created_at: String? = null,
)

@Serializable
data class CreateAssignmentDto(val card_id: String, val holder_id: String, val handed_over_date: String)

@Serializable
data class TransactionDto(
    val id: String,
    val card_id: String,
    val amount: String,
    val merchant: String,
    val txn_date: String,
    val source: String,
    val holder_id_at_time: String,
    val raw_sms_encrypted: String? = null,
    val dedupe_hash: String? = null,
    val created_at: String? = null,
)

@Serializable
data class CreateTransactionDto(
    val card_id: String,
    val amount: Double,
    val merchant: String,
    val txn_date: String,
    val source: String,
    val holder_id_at_time: String? = null,
    val raw_sms_encrypted: String? = null,
    val dedupe_hash: String? = null,
)

@Serializable
data class UpdateTransactionDto(
    val amount: Double? = null,
    val merchant: String? = null,
    val txn_date: String? = null,
    val holder_id_at_time: String? = null,
)
```

- [ ] **Step 2: `data/net/ApiService.kt`**
```kotlin
package com.imvj.cardledger.data.net

import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    @POST("auth/login") suspend fun login(@Body body: LoginRequest): LoginResponse

    @GET("cards") suspend fun getCards(): List<CardDto>
    @GET("cards/{id}") suspend fun getCard(@Path("id") id: String): CardDto
    @POST("cards") suspend fun createCard(@Body body: CreateCardDto): CardDto
    @PATCH("cards/{id}") suspend fun updateCard(@Path("id") id: String, @Body body: CreateCardDto): CardDto
    @DELETE("cards/{id}") suspend fun deleteCard(@Path("id") id: String): Response<Unit>

    @GET("holders") suspend fun getHolders(): List<HolderDto>
    @POST("holders") suspend fun createHolder(@Body body: CreateHolderDto): HolderDto
    @PATCH("holders/{id}") suspend fun updateHolder(@Path("id") id: String, @Body body: CreateHolderDto): HolderDto
    @DELETE("holders/{id}") suspend fun deleteHolder(@Path("id") id: String): Response<Unit>

    @GET("assignments") suspend fun getAssignments(
        @Query("card_id") cardId: String? = null,
        @Query("active") active: String? = null,
    ): List<AssignmentDto>
    @POST("assignments") suspend fun createAssignment(@Body body: CreateAssignmentDto): AssignmentDto
    @POST("assignments/{id}/return") suspend fun returnAssignment(@Path("id") id: String): AssignmentDto
    @DELETE("assignments/{id}") suspend fun deleteAssignment(@Path("id") id: String): Response<Unit>

    @GET("transactions") suspend fun getTransactions(
        @Query("card_id") cardId: String? = null,
        @Query("holder_id") holderId: String? = null,
    ): List<TransactionDto>
    @POST("transactions") suspend fun createTransaction(@Body body: CreateTransactionDto): TransactionDto
    @PATCH("transactions/{id}") suspend fun updateTransaction(@Path("id") id: String, @Body body: UpdateTransactionDto): TransactionDto
    @DELETE("transactions/{id}") suspend fun deleteTransaction(@Path("id") id: String): Response<Unit>
}
```

- [ ] **Step 3: `data/store/TokenStore.kt`**
```kotlin
package com.imvj.cardledger.data.store

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "cardledger")

class TokenStore(private val context: Context) {
    private val TOKEN = stringPreferencesKey("cl_token")

    val tokenFlow: Flow<String?> = context.dataStore.data.map { it[TOKEN] }
    suspend fun get(): String? = tokenFlow.first()
    suspend fun set(token: String) { context.dataStore.edit { it[TOKEN] = token } }
    suspend fun clear() { context.dataStore.edit { it.remove(TOKEN) } }
}
```

- [ ] **Step 4: `data/store/PrefsStore.kt`** (PIN hash + biometric + reminders + sms-setup)
```kotlin
package com.imvj.cardledger.data.store

import android.content.Context
import androidx.datastore.preferences.core.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.security.MessageDigest

class PrefsStore(private val context: Context) {
    private val ds get() = context.applicationContext.let { com.imvj.cardledger.data.store.prefsDataStore(it) }

    private val PIN = stringPreferencesKey("cl_pin_hash")
    private val BIO = booleanPreferencesKey("cl_biometric_enabled")
    private val REM = booleanPreferencesKey("cl_reminders_enabled")
    private val REM_DAYS = intPreferencesKey("cl_reminder_days")
    private val SMS_SETUP = booleanPreferencesKey("cl_sms_setup")

    private fun hash(pin: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        return md.digest((pin + "cl-salt-v1").toByteArray()).joinToString("") { "%02x".format(it) }
    }

    suspend fun isPinSet(): Boolean = ds.data.map { it[PIN] != null }.first()
    suspend fun setPin(pin: String) { ds.edit { it[PIN] = hash(pin) } }
    suspend fun verifyPin(pin: String): Boolean = ds.data.map { it[PIN] == hash(pin) }.first()

    suspend fun biometricEnabled(): Boolean = ds.data.map { it[BIO] ?: true }.first()
    suspend fun setBiometric(v: Boolean) { ds.edit { it[BIO] = v } }

    suspend fun remindersEnabled(): Boolean = ds.data.map { it[REM] ?: true }.first()
    suspend fun setReminders(v: Boolean) { ds.edit { it[REM] = v } }
    suspend fun reminderDays(): Int = ds.data.map { it[REM_DAYS] ?: 3 }.first()
    suspend fun setReminderDays(n: Int) { ds.edit { it[REM_DAYS] = n } }

    suspend fun smsSetupDone(): Boolean = ds.data.map { it[SMS_SETUP] ?: false }.first()
    suspend fun setSmsSetup(v: Boolean) { ds.edit { it[SMS_SETUP] = v } }
}
```
And add to `TokenStore.kt`'s file (or a new `DataStoreExt.kt`) a shared accessor so both stores use one DataStore:
```kotlin
// data/store/DataStoreExt.kt
package com.imvj.cardledger.data.store
import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore
private val Context.appDataStore by preferencesDataStore(name = "cardledger")
fun prefsDataStore(context: Context): DataStore<Preferences> = context.appDataStore
```
> Then change `TokenStore` to use `prefsDataStore(context)` instead of its own `Context.dataStore` to avoid two DataStores with the same name (which crashes). Final `TokenStore` uses `private val ds get() = prefsDataStore(context)` and references `ds.data` / `ds.edit`.

- [ ] **Step 5: `data/net/AuthInterceptor.kt`**
```kotlin
package com.imvj.cardledger.data.net

import com.imvj.cardledger.data.store.TokenStore
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = runBlocking { tokenStore.get() }
        val req = if (token != null)
            chain.request().newBuilder().addHeader("Authorization", "Bearer $token").build()
        else chain.request()
        return chain.proceed(req)
    }
}
```

- [ ] **Step 6: `data/net/NetworkModule.kt`**
```kotlin
package com.imvj.cardledger.data.net

import com.imvj.cardledger.BuildConfig
import com.imvj.cardledger.data.store.TokenStore
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

object NetworkModule {
    fun create(tokenStore: TokenStore): ApiService {
        val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokenStore))
            .build()
        return Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ApiService::class.java)
    }
}
```

- [ ] **Step 7: Replace `AppContainer.kt`**
```kotlin
package com.imvj.cardledger

import android.content.Context
import com.imvj.cardledger.data.net.ApiService
import com.imvj.cardledger.data.net.NetworkModule
import com.imvj.cardledger.data.store.PrefsStore
import com.imvj.cardledger.data.store.TokenStore

class AppContainer(context: Context) {
    val tokenStore = TokenStore(context.applicationContext)
    val prefsStore = PrefsStore(context.applicationContext)
    val api: ApiService = NetworkModule.create(tokenStore)
    // repositories added in Task 4
}
```

- [ ] **Step 8: Build & commit**
```
git add packages/android-native/app/src/main/java/com/imvj/cardledger
git commit -m "feat(native): Retrofit networking, DTOs, auth interceptor, DataStore stores"
```

---

## Task 4: Repositories + domain logic (ported from TS)

**Files:**
- `data/repo/Repositories.kt`
- `domain/Domain.kt` (resolveHolder, billing cycle, analytics, cardType)
- `domain/SmsParser.kt`
- update `AppContainer.kt`

- [ ] **Step 1: `data/repo/Repositories.kt`**
```kotlin
package com.imvj.cardledger.data.repo

import com.imvj.cardledger.data.net.*
import retrofit2.HttpException

private suspend fun <T> call(block: suspend () -> T): Result<T> =
    try { Result.success(block()) } catch (e: Exception) { Result.failure(e) }

fun isConflict(e: Throwable): Boolean = e is HttpException && e.code() == 409
fun isUnauthorized(e: Throwable): Boolean = e is HttpException && e.code() == 401

class AuthRepository(private val api: ApiService) {
    suspend fun login(username: String, password: String): Result<String> =
        call { api.login(LoginRequest(username, password)).token }
}

class CardRepository(private val api: ApiService) {
    suspend fun list() = call { api.getCards() }
    suspend fun get(id: String) = call { api.getCard(id) }
    suspend fun create(b: CreateCardDto) = call { api.createCard(b) }
    suspend fun update(id: String, b: CreateCardDto) = call { api.updateCard(id, b) }
    suspend fun delete(id: String) = call { api.deleteCard(id); Unit }
}

class HolderRepository(private val api: ApiService) {
    suspend fun list() = call { api.getHolders() }
    suspend fun create(b: CreateHolderDto) = call { api.createHolder(b) }
    suspend fun update(id: String, b: CreateHolderDto) = call { api.updateHolder(id, b) }
    suspend fun delete(id: String) = call { api.deleteHolder(id); Unit }
}

class AssignmentRepository(private val api: ApiService) {
    suspend fun list(cardId: String? = null, active: Boolean? = null) =
        call { api.getAssignments(cardId, if (active == true) "true" else null) }
    suspend fun create(b: CreateAssignmentDto) = call { api.createAssignment(b) }
    suspend fun returnCard(id: String) = call { api.returnAssignment(id) }
    suspend fun delete(id: String) = call { api.deleteAssignment(id); Unit }
}

class TransactionRepository(private val api: ApiService) {
    suspend fun list(cardId: String? = null, holderId: String? = null) = call { api.getTransactions(cardId, holderId) }
    suspend fun create(b: CreateTransactionDto) = call { api.createTransaction(b) }
    suspend fun update(id: String, b: UpdateTransactionDto) = call { api.updateTransaction(id, b) }
    suspend fun delete(id: String) = call { api.deleteTransaction(id); Unit }
}
```

- [ ] **Step 2: `domain/Domain.kt`** (ports of resolveHolder, billingCycle, analytics, cardType)
```kotlin
package com.imvj.cardledger.domain

import com.imvj.cardledger.data.net.AssignmentDto
import com.imvj.cardledger.data.net.CardDto
import com.imvj.cardledger.data.net.TransactionDto
import java.time.LocalDate

// ── holder resolution ────────────────────────────────────────────────
fun resolveHolder(cardId: String, txnDate: String, assignments: List<AssignmentDto>): String? =
    assignments.firstOrNull {
        it.card_id == cardId &&
            it.handed_over_date <= txnDate &&
            (it.returned_date == null || it.returned_date >= txnDate)
    }?.holder_id

// ── billing cycle ────────────────────────────────────────────────────
data class CycleRange(val start: String, val end: String)

private fun iso(y: Int, m: Int, d: Int) = "%04d-%02d-%02d".format(y, m, d)

fun getCycleRange(cycleDay: Int, today: String): CycleRange {
    val (y, m, d) = today.split("-").map { it.toInt() }
    var sy = y; var sm = m
    if (d < cycleDay) { sm -= 1; if (sm == 0) { sm = 12; sy -= 1 } }
    val start = iso(sy, sm, cycleDay)
    var em = sm + 1; var ey = sy
    if (em == 13) { em = 1; ey += 1 }
    val end = iso(ey, em, cycleDay - 1)
    return CycleRange(start, end)
}

fun getDaysUntilDue(paymentDueDay: Int, today: String): Int {
    val (y, m, d) = today.split("-").map { it.toInt() }
    var dy = y; var dm = m
    if (d > paymentDueDay) { dm += 1; if (dm == 13) { dm = 1; dy += 1 } }
    val due = LocalDate.of(dy, dm, paymentDueDay)
    val now = LocalDate.of(y, m, d)
    return maxOf(0, java.time.temporal.ChronoUnit.DAYS.between(now, due).toInt())
}

// ── analytics ────────────────────────────────────────────────────────
data class Utilization(val spend: Double, val limit: Double, val percent: Double)

private fun pct(spend: Double, limit: Double) =
    if (limit <= 0) 0.0 else Math.round(spend / limit * 1000.0) / 10.0

fun cardUtilization(creditLimit: Double, spend: Double) = Utilization(spend, creditLimit, pct(spend, creditLimit))

fun totalUtilization(cards: List<CardDto>, spendByCard: Map<String, Double>): Utilization {
    val limit = cards.sumOf { it.credit_limit.toDouble() }
    val spend = cards.sumOf { spendByCard[it.id] ?: 0.0 }
    return Utilization(spend, limit, pct(spend, limit))
}

data class UpcomingDue(val cardId: String, val dueDate: String, val daysUntil: Int)

fun upcomingDues(cards: List<CardDto>, today: String, withinDays: Int): List<UpcomingDue> {
    val (y, m, _) = today.split("-").map { it.toInt() }
    return cards.map { c ->
        var dy = y; var dm = m
        val (_, _, d) = today.split("-").map { it.toInt() }
        if (d > c.payment_due_day) { dm += 1; if (dm == 13) { dm = 1; dy += 1 } }
        UpcomingDue(c.id, iso(dy, dm, c.payment_due_day), getDaysUntilDue(c.payment_due_day, today))
    }.filter { it.daysUntil <= withinDays }.sortedBy { it.daysUntil }
}

// ── card type / BIN ──────────────────────────────────────────────────
fun sanitizeCardNumber(input: String) = input.filter { it.isDigit() }
fun extractBin(num: String) = sanitizeCardNumber(num).let { if (it.length >= 6) it.substring(0, 6) else "" }
fun extractLast4(num: String) = sanitizeCardNumber(num).let { if (it.length >= 4) it.takeLast(4) else "" }

fun detectNetwork(bin: String): String? {
    val b = sanitizeCardNumber(bin)
    if (b.length < 2) return null
    val two = b.substring(0, 2).toInt()
    val three = if (b.length >= 3) b.substring(0, 3).toInt() else 0
    val four = if (b.length >= 4) b.substring(0, 4).toInt() else 0
    return when {
        two == 34 || two == 37 -> "Amex"
        b[0] == '4' -> "Visa"
        (two in 51..55) || (four in 2221..2720) -> "Mastercard"
        two == 60 || two == 65 || two == 81 || two == 82 || three == 508 -> "RuPay"
        else -> null
    }
}

fun luhnValid(num: String): Boolean {
    val d = sanitizeCardNumber(num)
    if (d.length < 12) return false
    var sum = 0; var alt = false
    for (i in d.indices.reversed()) {
        var n = d[i] - '0'
        if (alt) { n *= 2; if (n > 9) n -= 9 }
        sum += n; alt = !alt
    }
    return sum % 10 == 0
}

fun today(): String = LocalDate.now().toString()
```

- [ ] **Step 3: `domain/SmsParser.kt`** (port of the TS parser)
```kotlin
package com.imvj.cardledger.domain

import java.security.MessageDigest

data class SmsInput(val sender: String, val body: String, val timestamp: Long)
data class ParseResult(
    val bank: String, val last4: String, val amount: Double, val merchant: String,
    val date: String, val confidence: String, val dedupeHash: String, val raw: SmsInput,
)

private data class Rule(val bank: String, val senders: List<String>, val patterns: List<Regex>)

private val OTP = Regex("\\bOTP\\b|one[-\\s]?time[-\\s]?pass|verification code", RegexOption.IGNORE_CASE)

private val MONTHS = mapOf(
    "jan" to 1, "feb" to 2, "mar" to 3, "apr" to 4, "may" to 5, "jun" to 6,
    "jul" to 7, "aug" to 8, "sep" to 9, "oct" to 10, "nov" to 11, "dec" to 12,
)

private fun ci(p: String) = Regex(p, RegexOption.IGNORE_CASE)

private val RULES = listOf(
    Rule("HDFC", listOf("BZ-HDFCBK", "HD-HDFCBK", "HDFCBK"), listOf(
        ci("""Rs\.(?<amount>[\d,]+\.?\d*) spent on HDFC Bank[^C]+Card XX(?<last4>\d{4}) at (?<merchant>[A-Za-z ]+?) on (?<date>\d{2}-\d{2}-\d{4})"""))),
    Rule("ICICI", listOf("BZ-ICICIB", "ICICIB", "ICICIBK"), listOf(
        ci("""Rs\.(?<amount>[\d,]+\.?\d*) spent on .+?Card ending (?<last4>\d{4}) on (?<date>[A-Za-z]+ \d{2},? \d{4}) at (?<merchant>[A-Za-z ]+?)\."""))),
    Rule("SBI", listOf("AD-SBIINB", "SBI-UPI", "SBIINB", "SBICRD"), listOf(
        ci("""Rs\.(?<amount>[\d,]+\.?\d*) debited from SBI Credit Card XX(?<last4>\d{4}) on (?<date>\d{2}/\d{2}/\d{4}) at (?<merchant>[A-Za-z]+)"""))),
    Rule("Axis", listOf("AX-AXISBK", "AXISBK"), listOf(
        ci("""Rs\.(?<amount>[\d,]+\.?\d*) spent via your Flipkart Axis Bank Card ending (?<last4>\d{4}) on (?<date>\d{2}-[A-Za-z]{3}-\d{2}) at (?<merchant>[A-Za-z]+)"""))),
)

private val FALLBACK = Rule("UNKNOWN", emptyList(), listOf(
    ci("""Rs\.?\s*(?<amount>[\d,]+\.?\d*)\s+spent at (?<merchant>.+?) on (?<date>[\d/]+)"""),
    ci("""Rs\.?\s*(?<amount>[\d,]+\.?\d*).*?(?:card|Card).*?(?<last4>\d{4})"""),
))

private fun groupOrNull(m: MatchResult, name: String): String? =
    try { m.groups[name]?.value } catch (e: Exception) { null }

private fun normalizeAmount(raw: String): Double =
    raw.replace(Regex("^(Rs\\.?|₹|INR)\\s*", RegexOption.IGNORE_CASE), "").replace(",", "").trim().toDoubleOrNull() ?: 0.0

private fun normalizeDate(raw: String): String {
    val s = raw.trim()
    Regex("^(\\d{1,2})[-/](\\d{1,2})[-/](\\d{4})$").find(s)?.let {
        val (d, m, y) = it.destructured; return "%s-%02d-%02d".format(y, m.toInt(), d.toInt())
    }
    Regex("^(\\d{1,2})[-\\s]([A-Za-z]{3})[-\\s](\\d{2,4})$").find(s)?.let {
        val (d, mon, yr) = it.destructured
        val month = MONTHS[mon.lowercase()] ?: return s
        val y = if (yr.length == 2) "20$yr" else yr
        return "%s-%02d-%02d".format(y, month, d.toInt())
    }
    Regex("^([A-Za-z]{3})\\s+(\\d{1,2}),?\\s+(\\d{4})$").find(s)?.let {
        val (mon, d, y) = it.destructured
        val month = MONTHS[mon.lowercase()] ?: return s
        return "%s-%02d-%02d".format(y, month, d.toInt())
    }
    return s
}

private fun normalizeMerchant(raw: String) = raw.trim().replace(Regex("\\s{2,}"), " ")

fun dedupeHash(input: SmsInput): String {
    val raw = "${input.sender}|${input.body}|${input.timestamp}"
    val md = MessageDigest.getInstance("SHA-256")
    return md.digest(raw.toByteArray()).joinToString("") { "%02x".format(it) }
}

fun parseSms(input: SmsInput): ParseResult? {
    if (OTP.containsMatchIn(input.body)) return null
    val matched = RULES.firstOrNull { r -> r.senders.any { input.sender.contains(it) } }
    val rules = if (matched != null) listOf(matched, FALLBACK) else listOf(FALLBACK)
    for (rule in rules) {
        for (pattern in rule.patterns) {
            val m = pattern.find(input.body) ?: continue
            val rawAmt = groupOrNull(m, "amount") ?: continue
            val last4 = groupOrNull(m, "last4")
            val rawDate = groupOrNull(m, "date")
            val rawMerchant = groupOrNull(m, "merchant")
            val isFallback = rule.bank == "UNKNOWN"
            val hasAll = last4 != null && rawDate != null && rawMerchant != null
            val confidence = if (!isFallback && hasAll) "high" else "low"
            return ParseResult(
                bank = rule.bank,
                last4 = last4 ?: "",
                amount = normalizeAmount(rawAmt),
                merchant = normalizeMerchant(rawMerchant ?: ""),
                date = if (rawDate != null) normalizeDate(rawDate)
                       else java.time.Instant.ofEpochMilli(input.timestamp).atZone(java.time.ZoneId.systemDefault()).toLocalDate().toString(),
                confidence = confidence,
                dedupeHash = dedupeHash(input),
                raw = input,
            )
        }
    }
    return null
}
```

- [ ] **Step 4: update `AppContainer.kt`** — add repositories
```kotlin
package com.imvj.cardledger

import android.content.Context
import com.imvj.cardledger.data.net.ApiService
import com.imvj.cardledger.data.net.NetworkModule
import com.imvj.cardledger.data.repo.*
import com.imvj.cardledger.data.store.PrefsStore
import com.imvj.cardledger.data.store.TokenStore

class AppContainer(context: Context) {
    val tokenStore = TokenStore(context.applicationContext)
    val prefsStore = PrefsStore(context.applicationContext)
    val api: ApiService = NetworkModule.create(tokenStore)

    val authRepo = AuthRepository(api)
    val cardRepo = CardRepository(api)
    val holderRepo = HolderRepository(api)
    val assignmentRepo = AssignmentRepository(api)
    val transactionRepo = TransactionRepository(api)
}
```

- [ ] **Step 5: Build & commit**
```
git add packages/android-native/app/src/main/java/com/imvj/cardledger
git commit -m "feat(native): repositories + domain logic (resolveHolder, cycles, analytics, BIN, SMS parser)"
```

---

## Task 5: Shared UI components

**Files:** `ui/components/Components.kt`, `ui/components/CardTile.kt`, `ui/components/PinPad.kt`

- [ ] **Step 1: `ui/components/Components.kt`** — `SpendRing`, `NetworkLogo`, `HolderBadge`, `money()` helper
```kotlin
package com.imvj.cardledger.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.imvj.cardledger.ui.theme.*
import java.text.NumberFormat
import java.util.Locale

fun money(v: Double): String =
    "₹" + NumberFormat.getNumberInstance(Locale("en", "IN")).format(v.toLong())

@Composable
fun SpendRing(spent: Double, limit: Double, size: Int = 56) {
    val pct = if (limit > 0) (spent / limit).coerceIn(0.0, 1.0).toFloat() else 0f
    Canvas(Modifier.size(size.dp)) {
        val stroke = 4.dp.toPx()
        val d = Size(this.size.width - stroke, this.size.height - stroke)
        drawArc(color = Elevated, startAngle = -90f, sweepAngle = 360f, useCenter = false,
            topLeft = androidx.compose.ui.geometry.Offset(stroke / 2, stroke / 2), size = d, style = Stroke(stroke))
        drawArc(color = Gold, startAngle = -90f, sweepAngle = 360f * pct, useCenter = false,
            topLeft = androidx.compose.ui.geometry.Offset(stroke / 2, stroke / 2), size = d, style = Stroke(stroke))
    }
}

@Composable
fun NetworkLogo(network: String, modifier: Modifier = Modifier) {
    // Simple text wordmark; Mastercard uses dual circles
    if (network == "Mastercard") {
        Row(modifier, verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(16.dp).clip(CircleShape).background(Color(0xFFEB001B)))
            Box(Modifier.size(16.dp).offset(x = (-6).dp).clip(CircleShape).background(Color(0x99F79E1B)))
        }
    } else {
        Text(network.uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = modifier)
    }
}

@Composable
fun HolderBadge(initials: String, isMe: Boolean) {
    Box(
        Modifier.size(24.dp).clip(CircleShape).background(if (isMe) Gold else Elevated),
        contentAlignment = Alignment.Center,
    ) { Text(initials, fontSize = 10.sp, color = if (isMe) Base else OnDark, fontWeight = FontWeight.Bold) }
}
```
> Add the missing `background` import: `import androidx.compose.foundation.background`.

- [ ] **Step 2: `ui/components/CardTile.kt`**
```kotlin
package com.imvj.cardledger.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.imvj.cardledger.data.net.CardDto
import com.imvj.cardledger.ui.theme.networkGradient

@Composable
fun CardTile(card: CardDto, holderInitials: String?, holderIsMe: Boolean, spend: Double) {
    Box(
        Modifier.fillMaxWidth().aspectRatio(1.586f)
            .clip(RoundedCornerShape(24.dp))
            .background(Brush.linearGradient(networkGradient(card.network)))
            .padding(20.dp)
    ) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.SpaceBetween) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.weight(1f)) {
                    Text(card.bank, color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.6f), fontSize = 12.sp)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(card.nickname, color = androidx.compose.ui.graphics.Color.White, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                        if (holderInitials != null) HolderBadge(holderInitials, holderIsMe)
                    }
                    if (card.variant != null) Text(card.variant, color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.6f), fontSize = 12.sp)
                }
                NetworkLogo(card.network)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
                Text("•••• ${card.last4}", color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.6f), fontSize = 12.sp)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    SpendRing(spend, card.credit_limit.toDouble())
                    Text(money(spend), color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.6f), fontSize = 10.sp)
                }
            }
        }
    }
}
```

- [ ] **Step 3: `ui/components/PinPad.kt`** — 6-dot PIN entry
```kotlin
package com.imvj.cardledger.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.imvj.cardledger.ui.theme.Elevated
import com.imvj.cardledger.ui.theme.Gold
import com.imvj.cardledger.ui.theme.Muted

@Composable
fun PinPad(label: String, error: String? = null, onComplete: (String) -> Unit) {
    var pin by remember { mutableStateOf("") }
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Text(label, color = Muted, fontSize = 14.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            repeat(6) { i ->
                Box(Modifier.size(12.dp).clip(CircleShape).background(if (i < pin.length) Gold else Elevated))
            }
        }
        if (error != null) Text(error, color = com.imvj.cardledger.ui.theme.Danger, fontSize = 12.sp)
        Column(horizontalArrangement = null.let { Arrangement.spacedBy(0.dp) } as Arrangement.Vertical, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            listOf(listOf("1","2","3"), listOf("4","5","6"), listOf("7","8","9"), listOf("", "0", "⌫")).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                    row.forEach { key ->
                        Box(Modifier.size(64.dp), contentAlignment = Alignment.Center) {
                            if (key.isNotEmpty()) Text(key, fontSize = 24.sp, fontWeight = FontWeight.Medium,
                                modifier = Modifier.clickable {
                                    if (key == "⌫") { if (pin.isNotEmpty()) pin = pin.dropLast(1) }
                                    else if (pin.length < 6) {
                                        pin += key
                                        if (pin.length == 6) { onComplete(pin); pin = "" }
                                    }
                                })
                        }
                    }
                }
            }
        }
    }
}
```
> If the `Arrangement.Vertical` cast line doesn't compile, replace the outer `Column(...)` params with `Column(verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally)`.

- [ ] **Step 4: Build & commit**
```
git add packages/android-native/app/src/main/java/com/imvj/cardledger/ui/components
git commit -m "feat(native): shared UI components (SpendRing, CardTile, NetworkLogo, PinPad, HolderBadge)"
```

---

## Task 6: Biometric helper + lifecycle lock

**Files:** `ui/lock/Biometric.kt`, `ui/lock/AppLockState.kt`

- [ ] **Step 1: `ui/lock/Biometric.kt`**
```kotlin
package com.imvj.cardledger.ui.lock

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

enum class BioResult { SUCCESS, FALLBACK, UNAVAILABLE }

fun biometricAvailable(activity: FragmentActivity): Boolean =
    BiometricManager.from(activity).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS

suspend fun authenticate(activity: FragmentActivity): BioResult {
    if (!biometricAvailable(activity)) return BioResult.UNAVAILABLE
    return suspendCancellableCoroutine { cont ->
        val prompt = BiometricPrompt(activity, ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { cont.resume(BioResult.SUCCESS) }
                override fun onAuthenticationError(code: Int, msg: CharSequence) { cont.resume(BioResult.FALLBACK) }
            })
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle("Unlock CardLedger")
                .setNegativeButtonText("Use PIN")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
                .build()
        )
    }
}
```
> Because `BiometricPrompt` needs a `FragmentActivity`, change `MainActivity` to extend `androidx.fragment.app.FragmentActivity` (Task 11) and add `implementation("androidx.fragment:fragment-ktx:1.8.3")` to `app/build.gradle.kts` dependencies.

- [ ] **Step 2: `ui/lock/AppLockState.kt`** — a global lock flag toggled by lifecycle
```kotlin
package com.imvj.cardledger.ui.lock

import kotlinx.coroutines.flow.MutableStateFlow

object AppLock {
    val locked = MutableStateFlow(true)   // start locked on cold start
    private var backgroundedAt: Long = 0L
    private const val LOCK_AFTER_MS = 5 * 60 * 1000L

    fun onBackground() { backgroundedAt = System.currentTimeMillis() }
    fun onForeground() {
        if (backgroundedAt != 0L && System.currentTimeMillis() - backgroundedAt > LOCK_AFTER_MS) locked.value = true
        backgroundedAt = 0L
    }
    fun lock() { locked.value = true }
    fun unlock() { locked.value = false }
}
```

- [ ] **Step 3: add fragment dependency** to `app/build.gradle.kts` (`implementation("androidx.fragment:fragment-ktx:1.8.3")`), build & commit
```
git add packages/android-native/app
git commit -m "feat(native): biometric helper + app-lock state"
```

---

## Task 7: Navigation, MainActivity wiring, ViewModel factory

**Files:** `ui/nav/Routes.kt`, `ui/nav/AppNav.kt`, `ui/nav/BottomBar.kt`, `feature/VmFactory.kt`, rewrite `MainActivity.kt`

- [ ] **Step 1: `feature/VmFactory.kt`** — generic factory pulling `AppContainer`
```kotlin
package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.runtime.Composable
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.lifecycle.createSavedStateHandle
import android.app.Application
import com.imvj.cardledger.CardLedgerApp

val AppViewModelFactory = viewModelFactory {
    // each ViewModel registered in Task 8+ via initializer { }
}
```
> Simpler approach used by screens: `viewModel(factory = viewModelFactory { initializer { XViewModel(app().container) } })`. Provide a helper:
```kotlin
@Composable
fun app(): CardLedgerApp =
    androidx.compose.ui.platform.LocalContext.current.applicationContext as CardLedgerApp
```
Place the `app()` helper in this file.

- [ ] **Step 2: `ui/nav/Routes.kt`**
```kotlin
package com.imvj.cardledger.ui.nav

object Routes {
    const val LOGIN = "login"
    const val LOCK = "lock"
    const val HOME = "home"
    const val HOLDERS = "holders"
    const val SETTINGS = "settings"
    const val SMS = "sms"
    const val REVIEW = "review"
    const val ADD_CARD = "card_edit"          // ?id={id} optional
    const val CARD_DETAIL = "card_detail"      // /{id}
}
```

- [ ] **Step 3: `ui/nav/BottomBar.kt`**
```kotlin
package com.imvj.cardledger.ui.nav

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState

@Composable
fun BottomBar(nav: NavHostController, reviewCount: Int) {
    val items = listOf(
        Triple(Routes.HOME, "Home", Icons.Filled.Home),
        Triple(Routes.HOLDERS, "Holders", Icons.Filled.People),
        Triple(Routes.SETTINGS, "Settings", Icons.Filled.Settings),
        Triple(Routes.SMS, "SMS", Icons.Filled.Email),
    )
    val current = nav.currentBackStackEntryAsState().value?.destination?.route
    NavigationBar {
        items.forEach { (route, label, icon) ->
            NavigationBarItem(
                selected = current == route,
                onClick = { if (current != route) nav.navigate(route) { launchSingleTop = true; popUpTo(Routes.HOME) } },
                icon = {
                    if (route == Routes.SMS && reviewCount > 0)
                        BadgedBox(badge = { Badge { Text(if (reviewCount > 9) "9+" else "$reviewCount") } }) { Icon(icon, label) }
                    else Icon(icon, label)
                },
                label = { Text(label) },
            )
        }
    }
}
```

- [ ] **Step 4: `ui/nav/AppNav.kt`** — host + lock gate
```kotlin
package com.imvj.cardledger.ui.nav

import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.navigation.compose.*
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.lock.AppLock
import com.imvj.cardledger.ui.screens.*

@Composable
fun AppNav() {
    val nav = rememberNavController()
    val container = app().container
    var hasToken by remember { mutableStateOf<Boolean?>(null) }

    LaunchedEffect(Unit) { hasToken = container.tokenStore.get() != null }
    val locked by AppLock.locked.collectAsState()

    if (hasToken == null) return  // brief splash

    val start = if (hasToken == false) Routes.LOGIN else Routes.HOME

    NavHost(navController = nav, startDestination = start) {
        composable(Routes.LOGIN) { LoginScreen(onSuccess = { AppLock.lock(); nav.navigate(Routes.HOME) { popUpTo(Routes.LOGIN) { inclusive = true } } }) }
        composable(Routes.HOME) { HomeScreen(nav) }
        composable(Routes.HOLDERS) { HoldersScreen(nav) }
        composable(Routes.SETTINGS) { SettingsScreen(nav) }
        composable(Routes.SMS) { SmsScreen(nav) }
        composable(Routes.REVIEW) { ReviewScreen(nav) }
        composable(Routes.ADD_CARD) { AddEditCardScreen(nav, cardId = null) }
        composable("${Routes.ADD_CARD}?id={id}") { AddEditCardScreen(nav, cardId = it.arguments?.getString("id")) }
        composable("${Routes.CARD_DETAIL}/{id}") { CardDetailScreen(nav, cardId = it.arguments?.getString("id")!!) }
    }

    // Lock overlay
    if (locked && hasToken == true) {
        LockScreen(onUnlocked = { AppLock.unlock() })
    }
}
```

- [ ] **Step 5: rewrite `MainActivity.kt`**
```kotlin
package com.imvj.cardledger

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.imvj.cardledger.ui.lock.AppLock
import com.imvj.cardledger.ui.nav.AppNav
import com.imvj.cardledger.ui.theme.CardLedgerTheme

class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStop(owner: LifecycleOwner) { AppLock.onBackground() }
            override fun onStart(owner: LifecycleOwner) { AppLock.onForeground() }
        })
        setContent { CardLedgerTheme { AppNav() } }
    }
}
```

- [ ] **Step 6:** Screens referenced above don't exist yet. To keep this task compiling, create `ui/screens/Stubs.kt` with empty composables for every screen used (`LoginScreen(onSuccess)`, `HomeScreen(nav)`, `HoldersScreen(nav)`, `SettingsScreen(nav)`, `SmsScreen(nav)`, `ReviewScreen(nav)`, `AddEditCardScreen(nav, cardId)`, `CardDetailScreen(nav, cardId)`, `LockScreen(onUnlocked)`) — each a `Box { Text("...") }`. Subsequent tasks replace each stub in its own file (delete the stub when the real one lands).

- [ ] **Step 7: Build & commit**
```
git add packages/android-native/app
git commit -m "feat(native): navigation graph, bottom bar, lock gate, MainActivity wiring + screen stubs"
```

---

## Task 8: Login + Lock screens

**Files:** `feature/AuthViewModel.kt`, `ui/screens/LoginScreen.kt`, `ui/screens/LockScreen.kt` (remove their stubs)

- [ ] **Step 1: `feature/AuthViewModel.kt`**
```kotlin
package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class LoginUiState(val loading: Boolean = false, val error: String? = null)

class AuthViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state

    fun login(username: String, password: String, onSuccess: () -> Unit) {
        _state.value = LoginUiState(loading = true)
        viewModelScope.launch {
            c.authRepo.login(username, password)
                .onSuccess { token -> c.tokenStore.set(token); _state.value = LoginUiState(); onSuccess() }
                .onFailure { _state.value = LoginUiState(error = "Login failed — check credentials") }
        }
    }
}
```

- [ ] **Step 2: `ui/screens/LoginScreen.kt`** — username/password form
```kotlin
package com.imvj.cardledger.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.imvj.cardledger.feature.AuthViewModel
import com.imvj.cardledger.feature.app

@Composable
fun LoginScreen(onSuccess: () -> Unit) {
    val c = app().container
    val vm: AuthViewModel = viewModel(factory = viewModelFactory { initializer { AuthViewModel(c) } })
    val state by vm.state.collectAsState()
    var user by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("CardLedger", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(user, { user = it }, label = { Text("Username") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(pass, { pass = it }, label = { Text("Password") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        if (state.error != null) { Spacer(Modifier.height(8.dp)); Text(state.error!!, color = MaterialTheme.colorScheme.error) }
        Spacer(Modifier.height(20.dp))
        Button(onClick = { vm.login(user, pass, onSuccess) }, enabled = !state.loading, modifier = Modifier.fillMaxWidth()) {
            Text(if (state.loading) "Signing in…" else "Sign in")
        }
    }
}
```

- [ ] **Step 3: `ui/screens/LockScreen.kt`** — biometric then PIN
```kotlin
package com.imvj.cardledger.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.components.PinPad
import com.imvj.cardledger.ui.lock.BioResult
import com.imvj.cardledger.ui.lock.authenticate
import kotlinx.coroutines.launch

@Composable
fun LockScreen(onUnlocked: () -> Unit) {
    val c = app().container
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var showPin by remember { mutableStateOf(false) }
    var pinSet by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        pinSet = c.prefsStore.isPinSet()
        val bioOn = c.prefsStore.biometricEnabled()
        if (!pinSet) { showPin = true; return@LaunchedEffect }   // first run → set a PIN
        if (bioOn && ctx is FragmentActivity) {
            when (authenticate(ctx)) {
                BioResult.SUCCESS -> onUnlocked()
                else -> showPin = true
            }
        } else showPin = true
    }

    Surface(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            if (showPin) {
                PinPad(label = if (pinSet) "Enter PIN to unlock" else "Set a 6-digit PIN", error = error) { pin ->
                    scope.launch {
                        if (!pinSet) { c.prefsStore.setPin(pin); onUnlocked() }
                        else if (c.prefsStore.verifyPin(pin)) onUnlocked()
                        else error = "Wrong PIN — try again"
                    }
                }
            }
        }
    }
}
```
> Add `import androidx.compose.material3.Surface`.

- [ ] **Step 4:** delete the `LoginScreen`/`LockScreen` stubs from `Stubs.kt`. Build & commit
```
git add packages/android-native/app
git commit -m "feat(native): login + lock screens (biometric/PIN)"
```

---

## Task 9: Home dashboard

**Files:** `feature/HomeViewModel.kt`, `ui/screens/HomeScreen.kt` (remove stub), `ui/components/AddTransactionSheet.kt`, `ui/components/CardCarousel` inline

- [ ] **Step 1: `feature/HomeViewModel.kt`** — loads cards, holders, assignments, transactions; computes spendByCard (all-time)
```kotlin
package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.*
import com.imvj.cardledger.domain.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class HomeUiState(
    val loading: Boolean = true,
    val cards: List<CardDto> = emptyList(),
    val holders: List<HolderDto> = emptyList(),
    val assignments: List<AssignmentDto> = emptyList(),
    val transactions: List<TransactionDto> = emptyList(),
    val spendByCard: Map<String, Double> = emptyMap(),
    val total: Utilization = Utilization(0.0, 0.0, 0.0),
    val dues: List<UpcomingDue> = emptyList(),
    val error: String? = null,
)

class HomeViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state

    fun load() {
        viewModelScope.launch {
            val cards = c.cardRepo.list().getOrElse { emptyList() }
            val holders = c.holderRepo.list().getOrElse { emptyList() }
            val assignments = c.assignmentRepo.list().getOrElse { emptyList() }
            val txns = c.transactionRepo.list().getOrElse { emptyList() }
            val spend = cards.associate { card ->
                card.id to txns.filter { it.card_id == card.id }.sumOf { it.amount.toDouble() }
            }
            _state.value = HomeUiState(
                loading = false, cards = cards, holders = holders, assignments = assignments,
                transactions = txns, spendByCard = spend,
                total = totalUtilization(cards, spend),
                dues = upcomingDues(cards, today(), 7),
            )
        }
    }
}
```

- [ ] **Step 2: `ui/components/AddTransactionSheet.kt`** — ModalBottomSheet form (card, amount, merchant, date, who-used)
Structure (fill idiomatic Compose):
```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddTransactionSheet(
    cards: List<CardDto>, holders: List<HolderDto>, assignments: List<AssignmentDto>,
    initialCardId: String?, onDismiss: () -> Unit, onSaved: () -> Unit,
)
```
- Uses `ModalBottomSheet`. State: cardId (default initialCardId or first), amount, merchant, date (default `today()`), holderId (default = active assignment holder for cardId via `assignments.firstOrNull { it.card_id==cardId && it.returned_date==null }?.holder_id` else the "me" holder id).
- Card + who-used use `ExposedDropdownMenuBox`. Amount = numeric `OutlinedTextField`. Date = a text field `yyyy-MM-dd` (or a simple DatePicker dialog).
- Save → `app().container.transactionRepo.create(CreateTransactionDto(cardId, amount.toDouble(), merchant, date, "manual", holderId))` in a coroutine; on success call `onSaved()` + `onDismiss()`.

- [ ] **Step 3: `ui/screens/HomeScreen.kt`** — Scaffold + bottom bar + content
Structure:
```kotlin
@Composable
fun HomeScreen(nav: NavHostController)
```
- `vm = viewModel { HomeViewModel(container) }`; `LaunchedEffect(Unit){ vm.load() }`; observe state.
- `Scaffold(bottomBar = { BottomBar(nav, reviewCount = ReviewStore.count()) }, floatingActionButton = { FAB "+" → open AddTransactionSheet })`.
- TopBar row: "CardLedger" + an icon button "+" → `nav.navigate(Routes.ADD_CARD)`.
- If `cards.isEmpty()` → empty state with "Add card" button → `nav.navigate(Routes.ADD_CARD)`.
- Else, a vertical `Column`/`LazyColumn`:
  1. **Portfolio card**: Row with `SpendRing(total.spend, total.limit, 72)` + "${total.percent}%" centered over it (Box), and "Total utilization / money(spend) / money(limit)".
  2. **Upcoming dues**: for each due, a Surface row "nickname · due {dueDate.drop(5)} · in {daysUntil}d" → click navigates to `${CARD_DETAIL}/{cardId}`.
  3. **Carousel**: `HorizontalPager(state = rememberPagerState { cards.size })` with `pageSize = PageSize.Fraction(0.85f)` and `contentPadding = PaddingValues(horizontal = 24.dp)`; each page = `CardTile(...)` (clickable → card detail) + a "% utilized" caption using `cardUtilization`. Dots below from `pagerState.currentPage`.
  4. **Recent**: last 5 transactions by `txn_date` desc — merchant, holder name (from holders map), date, `money(amount)` in danger color.
- `holderInitials` computed from holder name; `holderIsMe` from relationship.
- Add-transaction sheet visibility via a `remember { mutableStateOf(false) }`; reload `vm.load()` after save.

> `HorizontalPager`/`rememberPagerState` are in `androidx.compose.foundation.pager` (Compose foundation, already included via BOM).

- [ ] **Step 4: `ReviewStore`** placeholder — create `data/store/ReviewStore.kt`:
```kotlin
package com.imvj.cardledger.data.store

import com.imvj.cardledger.domain.ParseResult
import kotlinx.coroutines.flow.MutableStateFlow

data class ReviewItem(val id: String, val parse: ParseResult, val cardId: String?)

object ReviewStore {
    val queue = MutableStateFlow<List<ReviewItem>>(emptyList())
    val knownHashes = mutableSetOf<String>()
    fun count() = queue.value.size
    fun enqueue(item: ReviewItem) { queue.value = queue.value + item; knownHashes.add(item.parse.dedupeHash) }
    fun addHash(h: String) { knownHashes.add(h) }
    fun remove(id: String) { queue.value = queue.value.filterNot { it.id == id } }
}
```
(In Compose read the count with `ReviewStore.queue.collectAsState().value.size`.)

- [ ] **Step 5:** delete HomeScreen stub. Build & commit
```
git add packages/android-native/app
git commit -m "feat(native): home dashboard (portfolio, pager carousel, dues, recent) + add-transaction sheet"
```

---

## Task 10: Card detail

**Files:** `feature/CardDetailViewModel.kt`, `ui/screens/CardDetailScreen.kt` (remove stub)

- [ ] **Step 1: `feature/CardDetailViewModel.kt`**
- State: card, holders, assignments(for card), transactions(card_id), grouped cycles (last 3 via `getCycleRange` offsets), totalSpend (all-time sum), currentHolder.
- Functions: `load(id)`, `deleteCard(onDone, onConflict)`, `deleteTxn(id)`, `updateTxn(id, amount, merchant, date, holderId)`.
- Use `c.cardRepo.get`, `c.holderRepo.list`, `c.assignmentRepo.list(cardId)`, `c.transactionRepo.list(cardId)`. Delete card maps `isConflict` → onConflict.

- [ ] **Step 2: `ui/screens/CardDetailScreen.kt`**
Structure:
- TopBar with back arrow + nickname.
- `CardTile(card, ..., spend = totalSpend)`.
- Row: "Edit card" → `nav.navigate("${ADD_CARD}?id=${card.id}")`; "Delete card" → deleteCard (show conflict snackbar/text "Card has transactions — delete them first").
- Transaction history: for each of the last-3 cycles that has txns, a label `start – end` then tappable rows (merchant / holder name · date / money(amount)).
- Tapping a txn opens a `ModalBottomSheet` (edit) with amount/date/merchant/who-used + Save (updateTxn) + Delete (deleteTxn).
- FAB → AddTransactionSheet (pre-selected this card).
- Reload after any mutation.

- [ ] **Step 3:** delete stub. Build & commit
```
git add packages/android-native/app
git commit -m "feat(native): card detail (history, edit/delete card, txn edit/delete)"
```

---

## Task 11: Add/Edit card + BIN detection

**Files:** `feature/CardFormViewModel.kt`, `ui/screens/AddEditCardScreen.kt` (remove stub), `data/net/BinLookup.kt`

- [ ] **Step 1: `data/net/BinLookup.kt`** — online lookup with local fallback
```kotlin
package com.imvj.cardledger.data.net

import com.imvj.cardledger.domain.detectNetwork
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.HttpURLConnection
import java.net.URL

data class BinInfo(val network: String?, val bank: String?, val variant: String?)

suspend fun lookupBin(bin: String): BinInfo {
    val clean = bin.filter { it.isDigit() }.take(6)
    val local = BinInfo(detectNetwork(clean), null, null)
    if (clean.length < 6) return local
    return try {
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            val conn = (URL("https://lookup.binlist.net/$clean").openConnection() as HttpURLConnection).apply {
                setRequestProperty("Accept-Version", "3"); connectTimeout = 4000; readTimeout = 4000
            }
            if (conn.responseCode != 200) return@withContext local
            val json = Json { ignoreUnknownKeys = true }.parseToJsonElement(conn.inputStream.bufferedReader().readText()).jsonObject
            val scheme = json["scheme"]?.jsonPrimitive?.content
            val network = when (scheme?.lowercase()) {
                "visa" -> "Visa"; "mastercard" -> "Mastercard"; "amex", "american express" -> "Amex"; "rupay" -> "RuPay"; else -> local.network
            }
            val bank = json["bank"]?.jsonObject?.get("name")?.jsonPrimitive?.content
            val type = json["type"]?.jsonPrimitive?.content?.replaceFirstChar { it.uppercase() }
            BinInfo(network, bank, type)
        }
    } catch (e: Exception) { local }
}
```

- [ ] **Step 2: `feature/CardFormViewModel.kt`** — load existing (edit), detect, save
- Fields state: cardNumber(transient), last4, bin, network, bank, variant, nickname, billingDay, dueDay, creditLimit.
- `loadExisting(id)` → fill fields from `cardRepo.get`.
- `detect()` → if `sanitize(cardNumber).length >= 13`: set bin/last4 via `extractBin/extractLast4`, call `lookupBin`, fill network/bank/variant if returned; set a detect message.
- `save(onDone)` → build `CreateCardDto(last4, network, bank, nickname, billingDay, dueDay, creditLimit, bin.ifEmpty{null}, variant.ifEmpty{null})`; create or update; never send the full number.

- [ ] **Step 3: `ui/screens/AddEditCardScreen.kt`**
- TopBar (Add/Edit). Fields: "Card number — used to detect type, not stored" (onBlur/`onFocusChanged` lost → `detect()`; cap maxLength 19 via filtering), detect message, Last 4, network dropdown, bank, variant, nickname, billing day (number), due day (number), credit limit (number), Save.

- [ ] **Step 4:** delete stub. Build & commit
```
git add packages/android-native/app
git commit -m "feat(native): add/edit card + BIN detection (number never stored)"
```

---

## Task 12: Holders

**Files:** `feature/HoldersViewModel.kt`, `ui/screens/HoldersScreen.kt` (remove stub)

- [ ] **Step 1: `feature/HoldersViewModel.kt`** — list friends + totals/breakdown; add/edit/delete
- Load holders + transactions + cards. friends = relationship=="friend". For each: total = sum of txns where holder_id_at_time==id; breakdown by card.
- `save(name, phone, editingId?)` → create or update with relationship "friend". `delete(id, onConflict)` → map 409.

- [ ] **Step 2: `ui/screens/HoldersScreen.kt`**
- Scaffold + BottomBar. "+ Add friend" → ModalBottomSheet form (name, phone) Save.
- Each friend card: avatar initials, name, phone, total; per-card breakdown rows; Edit / Delete buttons (delete shows conflict message).

- [ ] **Step 3:** delete stub. Build & commit
```
git add packages/android-native/app
git commit -m "feat(native): holders (friends CRUD with totals + breakdown)"
```

---

## Task 13: SMS import + review queue

**Files:** `sms/SmsReader.kt`, `sms/SmsReceiver.kt`, `feature/SmsViewModel.kt`, `ui/screens/SmsScreen.kt` + `ui/screens/ReviewScreen.kt` (remove stubs), manifest update

- [ ] **Step 1: `sms/SmsReader.kt`** — ContentResolver inbox read
```kotlin
package com.imvj.cardledger.sms

import android.content.Context
import android.net.Uri
import com.imvj.cardledger.domain.SmsInput

fun readInbox(context: Context, daysBack: Int = 90): List<SmsInput> {
    val cutoff = System.currentTimeMillis() - daysBack.toLong() * 24 * 60 * 60 * 1000
    val out = mutableListOf<SmsInput>()
    context.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("address", "body", "date"),
        "date > ?", arrayOf(cutoff.toString()), "date DESC",
    )?.use { c ->
        val a = c.getColumnIndexOrThrow("address"); val b = c.getColumnIndexOrThrow("body"); val d = c.getColumnIndexOrThrow("date")
        while (c.moveToNext()) out.add(SmsInput(c.getString(a) ?: "", c.getString(b) ?: "", c.getLong(d)))
    }
    return out
}
```

- [ ] **Step 2: `sms/SmsReceiver.kt`** — live receiver → shared flow
```kotlin
package com.imvj.cardledger.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.imvj.cardledger.domain.SmsInput
import kotlinx.coroutines.flow.MutableSharedFlow

object SmsBus { val flow = MutableSharedFlow<SmsInput>(extraBufferCapacity = 16) }

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        Telephony.Sms.Intents.getMessagesFromIntent(intent)?.forEach { m ->
            SmsBus.flow.tryEmit(SmsInput(m.displayOriginatingAddress ?: "", m.messageBody ?: "", System.currentTimeMillis()))
        }
    }
}
```

- [ ] **Step 3: `feature/SmsViewModel.kt`** — permission state, scan, live-collect, enqueue/auto-commit
- `scan(context)` → readInbox → for each `parseSms`; skip if hash in `ReviewStore.knownHashes` or in server txns' dedupe_hash; if confidence high and a card matches last4 → `transactionRepo.create(... source="sms", dedupe_hash=...)` + `ReviewStore.addHash`; else `ReviewStore.enqueue(ReviewItem(uuid, parse, matchedCardIdOrNull))`. Track summary (imported/queued).
- Collect `SmsBus.flow` while active → same logic (enqueue).
- Need cards + server hashes: load via repos.

- [ ] **Step 4: `ui/screens/SmsScreen.kt`** — permission request + scan button + summary + link to review
- Use `rememberLauncherForActivityResult(RequestMultiplePermissions)` for `READ_SMS`,`RECEIVE_SMS`. If not granted, show rationale + "Grant SMS access". After grant set `prefsStore.setSmsSetup(true)`.
- "Scan inbox (90 days)" → `vm.scan`. Show "X imported · Y need review". Button to `nav.navigate(Routes.REVIEW)` with badge count.

- [ ] **Step 5: `ui/screens/ReviewScreen.kt`** — editable queue
- Observe `ReviewStore.queue`. Each item: raw body (truncated), editable amount/merchant/date + card dropdown (default item.cardId); Confirm → `transactionRepo.create(...)` + `ReviewStore.remove`; Dismiss → `ReviewStore.remove`. Empty → "All caught up ✓".

- [ ] **Step 6: manifest** — add permissions + receiver
```xml
<uses-permission android:name="android.permission.READ_SMS" />
<uses-permission android:name="android.permission.RECEIVE_SMS" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
```
Inside `<application>`:
```xml
<receiver android:name=".sms.SmsReceiver" android:exported="true">
    <intent-filter android:priority="999">
        <action android:name="android.provider.Telephony.SMS_RECEIVED" />
    </intent-filter>
</receiver>
```

- [ ] **Step 7:** delete stubs. Build & commit
```
git add packages/android-native/app
git commit -m "feat(native): SMS import (reader, live receiver, parser) + review queue"
```

---

## Task 14: Reminders + Settings

**Files:** `notif/ReminderScheduler.kt`, `notif/ReminderReceiver.kt`, `notif/BootReceiver.kt`, `feature/SettingsViewModel.kt`, `ui/screens/SettingsScreen.kt` (remove stub), manifest update

- [ ] **Step 1: `notif/ReminderScheduler.kt`** — schedule per-card alarms
```kotlin
package com.imvj.cardledger.notif

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.imvj.cardledger.data.net.CardDto
import com.imvj.cardledger.domain.getDaysUntilDue
import com.imvj.cardledger.domain.today
import java.util.Calendar

object ReminderScheduler {
    fun reschedule(context: Context, cards: List<CardDto>, daysBefore: Int, enabled: Boolean) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        cards.forEach { card ->
            val id = (card.id.hashCode() and 0x7FFFFFFF)
            val pi = PendingIntent.getBroadcast(
                context, id,
                Intent(context, ReminderReceiver::class.java).putExtra("title", "Payment due soon")
                    .putExtra("body", "${card.nickname} payment is due in $daysBefore days").putExtra("nid", id),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            am.cancel(pi)
            if (!enabled) return@forEach
            val fireInDays = getDaysUntilDue(card.payment_due_day, today()) - daysBefore
            if (fireInDays < 0) return@forEach
            val cal = Calendar.getInstance().apply {
                add(Calendar.DAY_OF_YEAR, fireInDays)
                set(Calendar.HOUR_OF_DAY, 9); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0)
            }
            if (cal.timeInMillis <= System.currentTimeMillis()) return@forEach
            am.set(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pi)
        }
    }
}
```

- [ ] **Step 2: `notif/ReminderReceiver.kt`** — posts the notification
```kotlin
package com.imvj.cardledger.notif

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            nm.createNotificationChannel(NotificationChannel("due", "Due reminders", NotificationManager.IMPORTANCE_HIGH))
        val n = NotificationCompat.Builder(context, "due")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(intent.getStringExtra("title"))
            .setContentText(intent.getStringExtra("body"))
            .setAutoCancel(true).build()
        nm.notify(intent.getIntExtra("nid", 1), n)
    }
}
```

- [ ] **Step 3: `notif/BootReceiver.kt`** — reschedule after reboot (loads cards via container)
```kotlin
package com.imvj.cardledger.notif

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.imvj.cardledger.CardLedgerApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as CardLedgerApp
        CoroutineScope(Dispatchers.IO).launch {
            val cards = app.container.cardRepo.list().getOrElse { emptyList() }
            ReminderScheduler.reschedule(context, cards, app.container.prefsStore.reminderDays(), app.container.prefsStore.remindersEnabled())
        }
    }
}
```

- [ ] **Step 4: `feature/SettingsViewModel.kt` + `ui/screens/SettingsScreen.kt`**
- Settings rows: Lock now (`AppLock.lock()`), Set/Change PIN (PinPad sheet → `prefsStore.setPin`), Biometric toggle (`prefsStore.setBiometric`), Due-date reminders toggle + days-before chips (1/2/3/5/7) → on change `prefsStore.setReminders/setReminderDays` then reschedule with current cards, Sign out (`tokenStore.clear()` → navigate to Login).
- POST_NOTIFICATIONS runtime permission (Android 13+) requested when enabling reminders.

- [ ] **Step 5: manifest** — register receivers + notification permission
```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
...
<receiver android:name=".notif.ReminderReceiver" android:exported="false" />
<receiver android:name=".notif.BootReceiver" android:exported="true">
    <intent-filter><action android:name="android.intent.action.BOOT_COMPLETED" /></intent-filter>
</receiver>
```
Also call `ReminderScheduler.reschedule(...)` from `HomeViewModel.load()` after cards load (pass an application context via the container — add `appContext` to `AppContainer`).

- [ ] **Step 6:** delete stub. Build & commit
```
git add packages/android-native/app
git commit -m "feat(native): due-date reminders (AlarmManager) + settings"
```

---

## Task 15: Final assembleDebug + manual smoke

**Files:** none (build only) — plus a `packages/android-native/README.md` with build/install steps.

- [ ] **Step 1: Clean build**
```
cd packages/android-native && JAVA_HOME="/c/Program Files/Microsoft/jdk-17.0.18.8-hotspot" ./gradlew.bat clean assembleDebug
```
Expected: `BUILD SUCCESSFUL`; APK at `app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 2: README** with: prerequisites (JDK 17), `./gradlew assembleDebug`, `adb install -r app/build/outputs/apk/debug/app-debug.apk`, appId `com.imvj.cardledger`, points to `https://cards.imvj.in/api`, Play Protect note (SMS).

- [ ] **Step 3: Commit**
```
git add packages/android-native
git commit -m "build(native): debug APK + README — CardLedger native Android v1"
```

---

## Self-Review Checklist

| Spec section | Task |
|---|---|
| §1/§2 stack, architecture, layout | 1–4 |
| §3 theme | 2 |
| §4 networking + DTOs + interceptor | 3 |
| §5 domain ports | 4 |
| §6 auth + app lock (PIN/biometric/5-min) | 6,7,8 |
| §7 navigation + bottom bar | 7 |
| §8 home dashboard | 9 |
| §8 card detail | 10 |
| §8 add/edit card + BIN | 11 |
| §8 holders | 12 |
| §8/§9 SMS import + review | 13 |
| §10 reminders + §8 settings | 14 |
| §11 build/deliverable | 15 |

**Notes for the executor:** Tasks 9–14 give ViewModels in full and screen *structure* (composable signature + layout + exact repo calls) rather than every line — write idiomatic Compose to fill them, keep each screen in its own file, use theme colors, and ensure each task ends with a green `assembleDebug`. Replace the Task-7 stubs as each real screen lands.

package com.imvj.cardledger.data.store

import android.content.Context
import androidx.datastore.preferences.core.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.security.MessageDigest

class PrefsStore(private val context: Context) {
    private val ds get() = prefsDataStore(context)

    private val PIN = stringPreferencesKey("cl_pin_hash")
    private val BIO = booleanPreferencesKey("cl_biometric_enabled")
    private val REM = booleanPreferencesKey("cl_reminders_enabled")
    private val REM_DAYS = intPreferencesKey("cl_reminder_days")
    private val SMS_SETUP = booleanPreferencesKey("cl_sms_setup")
    private val REVIEW_QUEUE = stringPreferencesKey("cl_review_queue")
    private val PROCESSED_HASHES = stringSetPreferencesKey("cl_processed_hashes")

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

    suspend fun getReviewQueueJson(): String = ds.data.map { it[REVIEW_QUEUE] ?: "[]" }.first()
    suspend fun setReviewQueueJson(json: String) { ds.edit { it[REVIEW_QUEUE] = json } }

    suspend fun getProcessedHashes(): Set<String> = ds.data.map { it[PROCESSED_HASHES] ?: emptySet() }.first()
    suspend fun setProcessedHashes(hashes: Set<String>) { ds.edit { it[PROCESSED_HASHES] = hashes } }
}

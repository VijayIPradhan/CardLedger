package com.imvj.cardledger.feature

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.CardDto
import com.imvj.cardledger.data.net.CreateTransactionDto
import com.imvj.cardledger.data.store.ReviewItem
import com.imvj.cardledger.domain.SmsInput
import com.imvj.cardledger.domain.isOtpMessage
import com.imvj.cardledger.domain.parseSms
import com.imvj.cardledger.sms.SmsBus
import com.imvj.cardledger.sms.readInbox
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.util.UUID

private const val TAG = "SmsViewModel"

data class SmsStats(
    val totalScanned: Int = 0,
    val otpsIgnored: Int = 0,
    val importedCount: Int = 0,
    val queuedCount: Int = 0,
    val byBank: Map<String, Int> = emptyMap()
)

data class SmsUiState(val scanning: Boolean = false, val summary: String? = null, val stats: SmsStats? = null)

class SmsViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(SmsUiState())
    val state: StateFlow<SmsUiState> = _state

    // Cached once at startup; refreshed explicitly before a scan.
    private var cachedCards: List<CardDto> = emptyList()

    // Server-side hashes — refreshed each scan to stay in sync
    private val cachedServerHashes: MutableSet<String> = mutableSetOf()

    // Session-local dedup: tracks (amount|last4|date) keys seen within the current scan
    // to prevent the same transaction appearing from both spend SMS and OTP SMS.
    private val sessionTxnKeys: MutableSet<String> = mutableSetOf()

    init {
        viewModelScope.launch {
            loadCache()
            SmsBus.flow.collect { sms ->
                handleParsed(sms, cachedCards, cachedServerHashes, autoCommit = false)
            }
        }
    }

    private suspend fun loadCache() {
        cachedCards = c.cardRepo.list().getOrElse { emptyList() }
        val freshHashes = c.transactionRepo.list()
            .getOrElse { emptyList() }
            .mapNotNull { it.dedupe_hash }
        cachedServerHashes.clear()
        cachedServerHashes.addAll(freshHashes)
    }

    fun scan(context: Context, days: Int = SMS_SCAN_DAYS_BACK) {
        _state.value = SmsUiState(scanning = true)
        viewModelScope.launch {
            loadCache()
            sessionTxnKeys.clear()

            var imported = 0; var queued = 0; var totalScanned = 0; var otps = 0
            val bankCounts = mutableMapOf<String, Int>()
            readInbox(context, days).forEach { sms ->
                totalScanned++
                if (isOtpMessage(sms.body)) {
                    otps++
                } else {
                    when (handleParsed(sms, cachedCards, cachedServerHashes, autoCommit = false)) {
                        Outcome.IMPORTED -> imported++
                        Outcome.QUEUED -> queued++
                        Outcome.SKIPPED -> {}
                    }
                    val bodyLower = sms.body.lowercase()
                    val bank = when {
                        "hdfc" in bodyLower -> "HDFC Bank"
                        "icici" in bodyLower -> "ICICI Bank"
                        "sbi" in bodyLower || "sbicard" in bodyLower -> "SBI Card"
                        "axis" in bodyLower -> "Axis Bank"
                        "amex" in bodyLower || "american express" in bodyLower -> "Amex"
                        "kotak" in bodyLower -> "Kotak Bank"
                        "indusind" in bodyLower -> "IndusInd Bank"
                        "onecard" in bodyLower -> "OneCard"
                        else -> null
                    }
                    if (bank != null) {
                        bankCounts[bank] = (bankCounts[bank] ?: 0) + 1
                    }
                }
            }
            _state.value = SmsUiState(
                scanning = false,
                summary = "$imported imported · $queued need review",
                stats = SmsStats(totalScanned, otps, imported, queued, bankCounts)
            )
        }
    }

    private enum class Outcome { IMPORTED, QUEUED, SKIPPED }

    private suspend fun handleParsed(
        sms: SmsInput,
        cards: List<CardDto>,
        serverHashes: MutableSet<String>,
        autoCommit: Boolean,
    ): Outcome {
        // ── 1. Pre-filter OTP/security messages before any processing ──
        if (isOtpMessage(sms.body)) return Outcome.SKIPPED

        val hash = com.imvj.cardledger.domain.dedupeHash(sms)

        // ── 2. Check server hashes only (not the bloated local set) ──
        if (hash in serverHashes) return Outcome.SKIPPED

        // ── 3. Check review store's committed hashes (items already queued/imported) ──
        if (hash in c.reviewStore.committedHashes) return Outcome.SKIPPED

        val r = try {
            c.api.parseSmsAi(sms)
        } catch (e: Exception) {
            Log.w(TAG, "AI SMS parse failed, falling back to local parser", e)
            parseSms(sms, cards.map { it.last4 })
        }

        if (r == null) return Outcome.SKIPPED

        if (r.dedupeHash in serverHashes || r.dedupeHash in c.reviewStore.committedHashes) return Outcome.SKIPPED

        // ── 4. Session-local dedup: same amount + last4 + date = same transaction ──
        val txnKey = "${r.amount}|${r.last4}|${r.date}"
        if (txnKey in sessionTxnKeys) return Outcome.SKIPPED
        sessionTxnKeys.add(txnKey)

        val matched = if (r.last4.isNotBlank()) cards.firstOrNull { it.last4 == r.last4 } else null

        if (matched == null) {
            return Outcome.SKIPPED
        }

        if (autoCommit && r.confidence == "high") {
            val res = c.transactionRepo.create(
                CreateTransactionDto(
                    card_id = matched.id, amount = r.amount, merchant = r.merchant,
                    txn_date = r.date, source = "sms", type = r.type,
                    is_paid = r.is_paid, dedupe_hash = r.dedupeHash,
                )
            )
            if (res.isSuccess) {
                // Persist both hashes so re-scans are skipped
                c.reviewStore.addCommittedHash(r.dedupeHash)
                c.reviewStore.addCommittedHash(hash)
                serverHashes.add(r.dedupeHash)
                serverHashes.add(hash)
                return Outcome.IMPORTED
            }
        }
        c.reviewStore.enqueue(ReviewItem(UUID.randomUUID().toString(), r, matched.id))
        return Outcome.QUEUED
    }

    private companion object {
        const val SMS_SCAN_DAYS_BACK = 90
    }
}


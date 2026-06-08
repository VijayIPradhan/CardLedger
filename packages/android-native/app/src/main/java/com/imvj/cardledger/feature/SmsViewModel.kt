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
import com.imvj.cardledger.domain.parseSms
import com.imvj.cardledger.sms.SmsBus
import com.imvj.cardledger.sms.readInbox
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.util.UUID

private const val TAG = "SmsViewModel"
private const val SMS_SCAN_DAYS_BACK = 90

data class SmsUiState(val scanning: Boolean = false, val summary: String? = null)

class SmsViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(SmsUiState())
    val state: StateFlow<SmsUiState> = _state

    init {
        viewModelScope.launch {
            SmsBus.flow.collect { sms ->
                val cards = c.cardRepo.list().getOrElse { emptyList() }
                val serverHashes = c.transactionRepo.list().getOrElse { emptyList() }.mapNotNull { it.dedupe_hash }.toSet()
                handleParsed(sms, cards, serverHashes, autoCommit = false)
            }
        }
    }

    fun scan(context: Context, days: Int) {
        _state.value = SmsUiState(scanning = true)
        viewModelScope.launch {
            val cards = c.cardRepo.list().getOrElse { emptyList() }
            val serverHashes = c.transactionRepo.list().getOrElse { emptyList() }.mapNotNull { it.dedupe_hash }.toSet()
            var imported = 0; var queued = 0
            readInbox(context, days).forEach { sms ->
                when (handleParsed(sms, cards, serverHashes, autoCommit = true)) {
                    Outcome.IMPORTED -> imported++
                    Outcome.QUEUED -> queued++
                    Outcome.SKIPPED -> {}
                }
            }
            _state.value = SmsUiState(scanning = false, summary = "$imported imported · $queued need review")
        }
    }

    private enum class Outcome { IMPORTED, QUEUED, SKIPPED }

    private suspend fun handleParsed(
        sms: SmsInput,
        cards: List<CardDto>,
        serverHashes: Set<String>,
        autoCommit: Boolean,
    ): Outcome {
        val hash = com.imvj.cardledger.domain.dedupeHash(sms)
        if (hash in serverHashes || hash in c.reviewStore.knownHashes) return Outcome.SKIPPED

        val r = try {
            c.api.parseSmsAi(sms)
        } catch (e: Exception) {
            Log.w(TAG, "AI SMS parse failed, falling back to local parser", e)
            parseSms(sms, cards.map { it.last4 })
        }
        
        if (r == null) {
            c.reviewStore.addHash(hash)
            return Outcome.SKIPPED
        }
        
        if (r.dedupeHash in serverHashes || r.dedupeHash in c.reviewStore.knownHashes) return Outcome.SKIPPED
        val matched = if (r.last4.isNotBlank()) cards.firstOrNull { it.last4 == r.last4 } else null
        
        // Filter out SMS if it doesn't match any known card
        if (matched == null) {
            c.reviewStore.addHash(r.dedupeHash)
            return Outcome.SKIPPED
        }
        
        if (autoCommit && r.confidence == "high") {
            val res = c.transactionRepo.create(
                CreateTransactionDto(card_id = matched.id, amount = r.amount, merchant = r.merchant, txn_date = r.date, source = "sms", type = r.type, is_paid = r.is_paid, dedupe_hash = r.dedupeHash)
            )
            if (res.isSuccess) { c.reviewStore.addHash(r.dedupeHash); return Outcome.IMPORTED }
        }
        c.reviewStore.enqueue(ReviewItem(UUID.randomUUID().toString(), r, matched.id))
        return Outcome.QUEUED
    }
}

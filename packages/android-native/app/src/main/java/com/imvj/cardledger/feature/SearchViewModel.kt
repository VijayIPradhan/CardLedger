package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.*
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

import com.imvj.cardledger.ui.components.LedgerEntry

data class SearchUiState(
    val loading: Boolean = true,
    val query: String = "",
    val cards: List<CardDto> = emptyList(),
    val holders: List<HolderDto> = emptyList(),
    val allTransactions: List<TransactionDto> = emptyList(),
    val allPayments: List<PaymentDto> = emptyList(),
    val results: List<LedgerEntry> = emptyList(),
)

class SearchViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state

    fun load() {
        viewModelScope.launch {
            val txnsD = async { c.transactionRepo.list().getOrElse { emptyList() } }
            val cardsD = async { c.cardRepo.list().getOrElse { emptyList() } }
            val holdersD = async { c.holderRepo.list().getOrElse { emptyList() } }
            val paymentsD = async { c.paymentRepo.list().getOrElse { emptyList() } }
            val txns = txnsD.await()
            val cards = cardsD.await()
            val holders = holdersD.await()
            val payments = paymentsD.await()
            
            _state.value = _state.value.copy(
                loading = false,
                allTransactions = txns,
                allPayments = payments,
                cards = cards,
                holders = holders,
            )
            search(_state.value.query)
        }
    }

    fun search(query: String) {
        val q = query.trim().lowercase()
        val cardMap = _state.value.cards.associateBy { it.id }
        val holderMap = _state.value.holders.associateBy { it.id }
        
        val txns = _state.value.allTransactions.filter { txn ->
            if (q.isEmpty()) true else {
                txn.merchant.lowercase().contains(q) ||
                cardMap[txn.card_id]?.nickname?.lowercase()?.contains(q) == true ||
                cardMap[txn.card_id]?.bank?.lowercase()?.contains(q) == true ||
                holderMap[txn.holder_id_at_time]?.name?.lowercase()?.contains(q) == true ||
                (q == "payment" && txn.type == "payment") ||
                (q == "spend" && txn.type == "spend")
            }
        }.map { txn ->
            val holder = holderMap[txn.holder_id_at_time]
            val card = cardMap[txn.card_id]
            LedgerEntry(
                id = txn.id,
                title = txn.merchant,
                subtitle = "${holder?.name ?: txn.holder_id_at_time}${if (card != null) " · ${card.nickname}" else ""} · ${txn.txn_date.drop(5)}",
                amount = txn.amount.toDoubleOrNull() ?: 0.0,
                date = txn.txn_date,
                isPayment = txn.type == "payment",
                isPaid = txn.is_paid,
                holderId = txn.holder_id_at_time,
                cardId = txn.card_id,
                txnDto = txn
            )
        }

        val payments = _state.value.allPayments.filter { p ->
            val holderName = holderMap[p.holder_id]?.name ?: ""
            if (q.isEmpty()) true else {
                holderName.lowercase().contains(q) ||
                p.notes?.lowercase()?.contains(q) == true ||
                q == "payment" || q == "paid" || q == "received" || q == "collection"
            }
        }.map { p ->
            val holder = holderMap[p.holder_id]
            LedgerEntry(
                id = p.id,
                title = "Payment Recorded · ${holder?.name ?: "Friend"}",
                subtitle = "🤝 Collection · ${p.payment_date.drop(5)}${if (!p.notes.isNullOrBlank()) " · ${p.notes}" else ""}",
                amount = p.amount.toDoubleOrNull() ?: 0.0,
                date = p.payment_date,
                isPayment = true,
                isPaid = true,
                holderId = p.holder_id,
                paymentDto = p
            )
        }

        val combined = (txns + payments).sortedByDescending { it.date }
        _state.value = _state.value.copy(query = query, results = combined)
    }
}

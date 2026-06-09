package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.*
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class SearchUiState(
    val loading: Boolean = true,
    val query: String = "",
    val cards: List<CardDto> = emptyList(),
    val holders: List<HolderDto> = emptyList(),
    val allTransactions: List<TransactionDto> = emptyList(),
    val results: List<TransactionDto> = emptyList(),
)

class SearchViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state

    fun load() {
        viewModelScope.launch {
            val txnsD = async { c.transactionRepo.list().getOrElse { emptyList() } }
            val cardsD = async { c.cardRepo.list().getOrElse { emptyList() } }
            val holdersD = async { c.holderRepo.list().getOrElse { emptyList() } }
            val txns = txnsD.await()
            val cards = cardsD.await()
            val holders = holdersD.await()
            _state.value = _state.value.copy(
                loading = false,
                allTransactions = txns,
                cards = cards,
                holders = holders,
                results = txns.sortedByDescending { it.txn_date },
            )
        }
    }

    fun search(query: String) {
        val q = query.trim().lowercase()
        val cardMap = _state.value.cards.associateBy { it.id }
        val holderMap = _state.value.holders.associateBy { it.id }
        val filtered = if (q.isEmpty()) {
            _state.value.allTransactions.sortedByDescending { it.txn_date }
        } else {
            _state.value.allTransactions.filter { txn ->
                txn.merchant.lowercase().contains(q) ||
                cardMap[txn.card_id]?.nickname?.lowercase()?.contains(q) == true ||
                cardMap[txn.card_id]?.bank?.lowercase()?.contains(q) == true ||
                holderMap[txn.holder_id_at_time]?.name?.lowercase()?.contains(q) == true
            }.sortedByDescending { it.txn_date }
        }
        _state.value = _state.value.copy(query = query, results = filtered)
    }
}

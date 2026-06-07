package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.*
import com.imvj.cardledger.data.repo.isConflict
import com.imvj.cardledger.domain.getCycleRange
import com.imvj.cardledger.domain.today
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate

data class CycleGroup(val label: String, val txns: List<TransactionDto>)

data class CardDetailUiState(
    val loading: Boolean = true,
    val card: CardDto? = null,
    val holders: List<HolderDto> = emptyList(),
    val assignments: List<AssignmentDto> = emptyList(),
    val transactions: List<TransactionDto> = emptyList(),
    val cycles: List<CycleGroup> = emptyList(),
    val totalSpend: Double = 0.0,
    val currentHolder: HolderDto? = null,
    val error: String? = null,
)

class CardDetailViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(CardDetailUiState())
    val state: StateFlow<CardDetailUiState> = _state

    fun load(id: String) {
        viewModelScope.launch {
            val allCards = c.cardRepo.list().getOrElse { emptyList() }
            val card = allCards.find { it.id == id }
            val holders = c.holderRepo.list().getOrElse { emptyList() }
            val assignments = c.assignmentRepo.list(id).getOrElse { emptyList() }
            val txns = c.transactionRepo.list(cardId = id).getOrElse { emptyList() }
            val cycles = if (card != null) buildCycles(card.billing_cycle_day, txns) else emptyList()
            
            val total = if (card != null) {
                val groupId = card.shared_limit_with ?: card.id
                allCards.filter { (it.shared_limit_with ?: it.id) == groupId }
                    .sumOf { it.current_spend?.toDoubleOrNull() ?: 0.0 }
            } else 0.0
            val active = assignments.firstOrNull { it.returned_date == null }
            val current = active?.let { a -> holders.firstOrNull { it.id == a.holder_id } }
                ?: holders.firstOrNull { it.relationship == "me" }
            _state.value = CardDetailUiState(false, card, holders, assignments, txns, cycles, total, current)
        }
    }

    private fun buildCycles(cycleDay: Int, txns: List<TransactionDto>): List<CycleGroup> {
        val out = mutableListOf<CycleGroup>()
        for (offset in -2..0) {
            val ref = LocalDate.now().plusMonths(offset.toLong()).toString()
            val r = getCycleRange(cycleDay, ref)
            val inCycle = txns.filter { it.txn_date >= r.start && it.txn_date <= r.end }
            if (inCycle.isNotEmpty()) out.add(CycleGroup("${r.start} – ${r.end}", inCycle))
        }
        return out
    }

    fun deleteCard(onDone: () -> Unit) {
        val id = _state.value.card?.id ?: return
        viewModelScope.launch {
            c.cardRepo.delete(id)
                .onSuccess { onDone() }
                .onFailure { e ->
                    _state.value = _state.value.copy(
                        error = if (isConflict(e)) "Card has transactions — delete them first." else "Could not delete card."
                    )
                }
        }
    }

    fun deleteTxn(txnId: String, cardId: String) {
        viewModelScope.launch { c.transactionRepo.delete(txnId).onSuccess { load(cardId) } }
    }

    fun updateTxn(
        txnId: String,
        cardId: String,
        amount: Double,
        merchant: String,
        date: String,
        holderId: String,
        onDone: () -> Unit,
    ) {
        viewModelScope.launch {
            c.transactionRepo.update(txnId, UpdateTransactionDto(amount = amount, merchant = merchant, txn_date = date, holder_id_at_time = holderId))
                .onSuccess { load(cardId); onDone() }
                .onFailure { _state.value = _state.value.copy(error = "Could not update transaction.") }
        }
    }

    fun toggleTransactionPaid(txnId: String, cardId: String, currentPaidStatus: Boolean) {
        viewModelScope.launch {
            c.transactionRepo.update(txnId, UpdateTransactionDto(is_paid = !currentPaidStatus))
                .onSuccess { load(cardId) }
        }
    }
}

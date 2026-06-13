package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.*
import com.imvj.cardledger.data.repo.isConflict
import com.imvj.cardledger.domain.getCycleRange
import com.imvj.cardledger.domain.today
import kotlinx.coroutines.async
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
    val toCollect: Double = 0.0,
    val error: String? = null,
)

class CardDetailViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(CardDetailUiState())
    val state: StateFlow<CardDetailUiState> = _state

    fun load(id: String) {
        _state.value = CardDetailUiState(loading = true)
        viewModelScope.launch {
            val cardD = async { c.cardRepo.get(id).getOrNull() }
            val holdersD = async { c.holderRepo.list().getOrElse { emptyList() } }
            val assignmentsD = async { c.assignmentRepo.list(id).getOrElse { emptyList() } }
            val txnsD = async { c.transactionRepo.list(cardId = id).getOrElse { emptyList() } }
            val allTxnsD = async { c.transactionRepo.list().getOrElse { emptyList() } }
            val allPaymentsD = async { c.paymentRepo.list().getOrElse { emptyList() } }
            val allCardsD = async { c.cardRepo.list().getOrElse { emptyList() } }

            val card = cardD.await()
            val holders = holdersD.await()
            val assignments = assignmentsD.await()
            val txns = txnsD.await()
            val allCards = allCardsD.await()
            val allTxns = allTxnsD.await()
            val allPayments = allPaymentsD.await()
            val cycles = if (card != null) buildCycles(card.billing_cycle_day, txns) else emptyList()

            val total = if (card != null) {
                val groupId = card.shared_limit_with ?: card.id
                allCards.filter { (it.shared_limit_with ?: it.id) == groupId }
                    .sumOf { it.current_spend?.toDoubleOrNull() ?: 0.0 }
            } else 0.0
            
            var cardToCollect = 0.0
            val friends = holders.filter { it.relationship == "friend" }
            friends.forEach { friend ->
                val expenses = allTxns.filter { it.holder_id_at_time == friend.id }.sortedBy { it.txn_date }
                val paid = allPayments.filter { it.holder_id == friend.id }.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
                var remainingPaid = paid
                for (txn in expenses) {
                    val amt = txn.amount.toDoubleOrNull() ?: 0.0
                    if (remainingPaid >= amt) {
                        remainingPaid -= amt
                    } else {
                        val unpaid = amt - remainingPaid
                        remainingPaid = 0.0
                        if (txn.card_id == id) {
                            cardToCollect += unpaid
                        }
                    }
                }
            }

            val active = assignments.firstOrNull { it.returned_date == null }
            val current = active?.let { a -> holders.firstOrNull { it.id == a.holder_id } }
                ?: holders.firstOrNull { it.relationship == "me" }
            _state.value = CardDetailUiState(false, card, holders, assignments, txns, cycles, total, current, cardToCollect)
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

    fun toggleTransactionPaid(txn: TransactionDto, cardId: String, currentPaidStatus: Boolean, holderPaid: Boolean = false, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            val p1 = async { c.transactionRepo.update(txn.id, UpdateTransactionDto(is_paid = !currentPaidStatus)) }
            val p2 = if (holderPaid && !currentPaidStatus) {
                async { c.paymentRepo.create(CreatePaymentDto(holder_id = txn.holder_id_at_time, transaction_id = txn.id, amount = txn.amount.toDoubleOrNull() ?: 0.0, payment_date = today())) }
            } else null
            val p3 = if (currentPaidStatus) {
                async { c.paymentRepo.deleteByTransactionId(txn.id) }
            } else null
            
            p1.await()
            p2?.await()
            p3?.await()
            load(cardId)
            onDone()
        }
    }

    fun markCyclePaid(cycleLabel: String, cardId: String, everyonePaid: Boolean = false, onDone: () -> Unit = {}) {
        val cycle = _state.value.cycles.firstOrNull { it.label == cycleLabel } ?: return
        val unpaid = cycle.txns.filter { !it.is_paid }
        if (unpaid.isEmpty()) return
        viewModelScope.launch {
            unpaid.map { txn ->
                async { c.transactionRepo.update(txn.id, UpdateTransactionDto(is_paid = true)) }
            }.forEach { it.await() }

            if (everyonePaid) {
                val meId = _state.value.holders.firstOrNull { it.relationship == "me" }?.id
                val friendTxns = unpaid.filter { it.holder_id_at_time != meId }
                friendTxns.forEach { txn ->
                    val amt = txn.amount.toDoubleOrNull() ?: 0.0
                    if (amt > 0) {
                        c.paymentRepo.create(CreatePaymentDto(holder_id = txn.holder_id_at_time, transaction_id = txn.id, amount = amt, payment_date = today()))
                    }
                }
            }
            load(cardId)
            onDone()
        }
    }
}

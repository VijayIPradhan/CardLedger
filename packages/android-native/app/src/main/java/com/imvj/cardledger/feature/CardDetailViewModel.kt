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

data class FriendCollectable(val holderId: String, val holderName: String, val amount: Double, val collectedInHand: Double = 0.0, val usage: Double = amount + collectedInHand)

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
    val collectedInHand: Double = 0.0,
    val friendBreakdown: List<FriendCollectable> = emptyList(),
    val isMarkedCollected: Boolean = false,
    val payments: List<PaymentDto> = emptyList(),
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

            val summaryRes = c.dashboardRepo.getSummary()
            val summary = summaryRes.getOrNull()

            val total = if (summary != null && card != null && summary.spendByCard.containsKey(card.id)) {
                summary.spendByCard[card.id] ?: 0.0
            } else if (card != null) {
                val groupId = card.shared_limit_with ?: card.id
                allCards.filter { (it.shared_limit_with ?: it.id) == groupId }
                    .sumOf { it.current_spend?.toDoubleOrNull() ?: 0.0 }
            } else 0.0
            
            val isMarkedCollected = c.prefsStore.getCollectedCards().contains(id)
            var cardToCollect = 0.0
            var cardCollectedInHand = 0.0
            val friendBreakdown = mutableListOf<FriendCollectable>()
            val friends = holders.filter { it.relationship == "friend" }
            if (summary != null) {
                cardToCollect = summary.friendDebts.sumOf { debt ->
                    debt.byCard[id] ?: 0.0
                }
                summary.friendDebts.forEach { debt ->
                    val rawAmt = debt.byCard[id] ?: 0.0
                    val netAmt = rawAmt
                    val inHand = maxOf(0.0, (debt.rawByCard[id] ?: 0.0) - (debt.byCard[id] ?: 0.0))
                    if (netAmt > 0.0 || inHand > 0.0) {
                        friendBreakdown.add(FriendCollectable(debt.holderId, debt.holderName, netAmt, inHand, rawAmt))
                        cardCollectedInHand += inHand
                    }
                }
            } else {
                friends.forEach { friend ->
                    val friendCardTxns = allTxns.filter { it.holder_id_at_time == friend.id && it.card_id == id }
                    var rawUnpaid = 0.0
                    var totalFriendSpendOnCard = 0.0
                    friendCardTxns.forEach { txn ->
                        val amt = txn.amount.toDoubleOrNull() ?: 0.0
                        if (txn.type != "spend") {
                            totalFriendSpendOnCard -= amt
                            if (!txn.is_paid && amt > 0) rawUnpaid -= amt
                        } else {
                            totalFriendSpendOnCard += amt
                            if (!txn.is_paid && amt > 0) rawUnpaid += amt
                        }
                    }
                    val totalPaid = allPayments.filter { it.holder_id == friend.id }.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
                    val totalFriendSpend = allTxns.filter { it.holder_id_at_time == friend.id && it.type == "spend" }.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
                    val remainingToPay = maxOf(0.0, totalFriendSpend - totalPaid)
                    val allRawUnpaid = allTxns.filter { it.holder_id_at_time == friend.id && !it.is_paid && it.type == "spend" }.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
                    val baseAmt = rawUnpaid
                    val baseTotal = allRawUnpaid

                    val netAmt = if (baseAmt <= 0.0) {
                        0.0
                    } else {
                        baseAmt
                    }
                    val inHand = if (totalPaid > totalFriendSpend && netAmt <= 0.0) {
                        kotlin.math.round((totalPaid - totalFriendSpend) * 100.0) / 100.0
                    } else {
                        0.0
                    }
                    if (netAmt > 0.0 || inHand > 0.0) {
                        cardToCollect += netAmt
                        cardCollectedInHand += inHand
                        friendBreakdown.add(FriendCollectable(friend.id, friend.name, netAmt, inHand, rawUnpaid))
                    }
                }
            }

            if (isMarkedCollected) {
                cardCollectedInHand = maxOf(cardCollectedInHand, cardToCollect)
                cardToCollect = 0.0
            }

            val active = assignments.firstOrNull { it.returned_date == null }
            val current = active?.let { a -> holders.firstOrNull { it.id == a.holder_id } }
                ?: holders.firstOrNull { it.relationship == "me" }
            _state.value = CardDetailUiState(
                loading = false,
                card = card,
                holders = holders,
                assignments = assignments,
                transactions = txns,
                cycles = cycles,
                totalSpend = total,
                currentHolder = current,
                toCollect = cardToCollect,
                collectedInHand = cardCollectedInHand,
                friendBreakdown = friendBreakdown,
                isMarkedCollected = isMarkedCollected,
                payments = allPayments,
                error = null
            )
        }
    }

    private fun buildCycles(cycleDay: Int, txns: List<TransactionDto>): List<CycleGroup> {
        val out = mutableListOf<CycleGroup>()
        val oldestDate = txns.minOfOrNull { it.txn_date } ?: LocalDate.now().toString()
        var offset = 0L
        val maxOffsetBack = -36L
        val assignedTxnIds = mutableSetOf<String>()

        while (offset >= maxOffsetBack) {
            val ref = LocalDate.now().plusMonths(offset).toString()
            val r = getCycleRange(cycleDay, ref)
            val inCycle = txns.filter { it.txn_date >= r.start && it.txn_date <= r.end }
            if (inCycle.isNotEmpty()) {
                out.add(CycleGroup("${r.start} – ${r.end}", inCycle.sortedByDescending { it.txn_date }))
                inCycle.forEach { assignedTxnIds.add(it.id) }
            }
            if (r.start < oldestDate && assignedTxnIds.size == txns.size) break
            offset--
        }
        val remaining = txns.filter { !assignedTxnIds.contains(it.id) }
        if (remaining.isNotEmpty()) {
            out.add(CycleGroup("Earlier Transactions", remaining.sortedByDescending { it.txn_date }))
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

    fun toggleTransactionCollected(txn: TransactionDto, cardId: String, isCollected: Boolean, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            if (isCollected) {
                c.paymentRepo.deleteByTransactionId(txn.id).onSuccess {
                    load(cardId)
                    onDone()
                }
            } else {
                val amt = txn.amount.toDoubleOrNull() ?: 0.0
                c.paymentRepo.create(
                    CreatePaymentDto(
                        holder_id = txn.holder_id_at_time,
                        transaction_id = txn.id,
                        amount = amt,
                        payment_date = today()
                    )
                ).onSuccess {
                    if (!txn.is_paid) {
                        c.transactionRepo.update(txn.id, UpdateTransactionDto(is_paid = true))
                    }
                    load(cardId)
                    onDone()
                }
            }
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

    /**
     * Toggles whether this card is marked as collected in local preferences.
     * Does NOT touch database transactions or payments, leaving is_paid strictly for bank bill tracking.
     */
    fun markCollected(cardId: String, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            c.prefsStore.toggleCollectedCard(cardId)
            load(cardId)
            onDone()
        }
    }

    fun recordBillPayment(cardId: String, amount: Double, date: String, notes: String?, funderId: String?, linkedTransactionId: String?, onDone: () -> Unit) {
        viewModelScope.launch {
            c.transactionRepo.create(
                CreateTransactionDto(
                    card_id = cardId,
                    amount = amount,
                    merchant = "Payment to Bank",
                    txn_date = date,
                    source = "manual",
                    type = "bill_payment",
                    funded_by_holder_id = funderId,
                    linked_transaction_id = linkedTransactionId
                )
            ).onSuccess {
                load(cardId)
                onDone()
            }.onFailure {
                _state.value = _state.value.copy(error = "Could not record payment.")
            }
        }
    }
}

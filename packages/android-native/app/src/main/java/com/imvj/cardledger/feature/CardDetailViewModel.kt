package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.*
import com.imvj.cardledger.data.repo.isConflict
import com.imvj.cardledger.domain.today
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File

data class CycleGroup(val label: String, val txns: List<TransactionDto>)

/** `usage` is the server's gross figure — it is not `amount + collectedInHand`, which omits
 *  settled spend and any cash that arrived as an unlinked lump sum. */
data class FriendCollectable(val holderId: String, val holderName: String, val amount: Double, val collectedInHand: Double = 0.0, val usage: Double = 0.0)

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
    /** Gross friend usage of this card, served rather than derived. */
    val friendUsage: Double = 0.0,
    val friendBreakdown: List<FriendCollectable> = emptyList(),
    val isMarkedCollected: Boolean = false,
    /** Cash received per transaction id, straight from the server. */
    val collectedByTransaction: Map<String, Double> = emptyMap(),
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
            val detailD = async { c.dashboardRepo.getCardDetail(id).getOrNull() }

            val card = cardD.await()
            val holders = holdersD.await()
            val assignments = assignmentsD.await()
            val txns = txnsD.await()
            val detail = detailD.await()

            val isMarkedCollected = c.prefsStore.getCollectedCards().contains(id)
            // The card screen's "marked collected" flag is a local display override kept in
            // DataStore, so it is applied on top of the server figures rather than sent up.
            var cardToCollect = detail?.toCollect ?: 0.0
            var cardCollectedInHand = detail?.collectedInHand ?: 0.0
            if (isMarkedCollected) {
                cardCollectedInHand = maxOf(cardCollectedInHand, cardToCollect)
                cardToCollect = 0.0
            }

            val current = detail?.currentHolderId?.let { hid -> holders.firstOrNull { it.id == hid } }
                ?: assignments.firstOrNull { it.returned_date == null }
                    ?.let { a -> holders.firstOrNull { it.id == a.holder_id } }
                ?: holders.firstOrNull { it.relationship == "me" }

            _state.value = CardDetailUiState(
                loading = false,
                card = card,
                holders = holders,
                assignments = assignments,
                transactions = txns,
                cycles = toCycleGroups(detail, txns),
                totalSpend = detail?.currentSpend ?: card?.current_spend?.toDoubleOrNull() ?: 0.0,
                currentHolder = current,
                toCollect = cardToCollect,
                collectedInHand = cardCollectedInHand,
                friendUsage = detail?.friendUsage ?: 0.0,
                friendBreakdown = detail?.friendBreakdown.orEmpty().map { fb ->
                    FriendCollectable(fb.holderId, fb.holderName, fb.owed, fb.collectedInHand, fb.usage)
                },
                isMarkedCollected = isMarkedCollected,
                collectedByTransaction = detail?.collectedByTransaction.orEmpty(),
                error = null
            )
        }
    }

    /**
     * Hydrates the server's billing-cycle grouping, which arrives as transaction ids.
     *
     * If the detail call failed there is nothing to group by — rather than rebuild the cycle
     * boundaries locally (the drift this refactor removed), fall back to one flat list so the
     * transactions still render.
     */
    private fun toCycleGroups(detail: CardDetailDto?, txns: List<TransactionDto>): List<CycleGroup> {
        if (detail == null) {
            return if (txns.isEmpty()) emptyList()
            else listOf(CycleGroup("All transactions", txns.sortedByDescending { it.txn_date }))
        }
        val byId = txns.associateBy { it.id }
        return detail.cycles
            .map { cycle -> CycleGroup(cycle.label, cycle.transactionIds.mapNotNull { byId[it] }) }
            .filter { it.txns.isNotEmpty() }
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
        linkedTxnId: String? = null,
        onDone: () -> Unit,
    ) {
        viewModelScope.launch {
            c.transactionRepo.update(txnId, UpdateTransactionDto(amount = amount, merchant = merchant, txn_date = date, holder_id_at_time = holderId, linked_transaction_id = linkedTxnId))
                .onSuccess { load(cardId); onDone() }
                .onFailure { _state.value = _state.value.copy(error = "Could not update transaction."); onDone() }
        }
    }

    fun collectTransaction(txn: TransactionDto, cardId: String, amount: Double, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            c.paymentRepo.create(
                CreatePaymentDto(
                    holder_id = txn.holder_id_at_time,
                    transaction_id = txn.id,
                    amount = amount,
                    payment_date = today()
                )
            ).onSuccess {
                // Determine if fully paid now
                val totalCollectedSoFar = _state.value.collectedByTransaction[txn.id] ?: 0.0
                val txnAmount = txn.amount.toDoubleOrNull() ?: 0.0
                if (totalCollectedSoFar + amount >= txnAmount && !txn.is_paid) {
                    c.transactionRepo.update(txn.id, UpdateTransactionDto(is_paid = true))
                }
                load(cardId)
                onDone()
            }
        }
    }

    fun removeCollection(txn: TransactionDto, cardId: String, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            c.paymentRepo.deleteByTransactionId(txn.id).onSuccess {
                load(cardId)
                onDone()
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
                onDone()
            }
        }
    }

    fun uploadStatement(cardId: String, file: File, onDone: () -> Unit) {
        viewModelScope.launch {
            try {
                _state.value = _state.value.copy(loading = true)
                val requestFile = file.asRequestBody("application/pdf".toMediaTypeOrNull())
                val body = MultipartBody.Part.createFormData("file", file.name, requestFile)
                c.api.uploadStatement(cardId, body)
                load(cardId)
                onDone()
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message ?: "Failed to upload statement")
            }
        }
    }
}

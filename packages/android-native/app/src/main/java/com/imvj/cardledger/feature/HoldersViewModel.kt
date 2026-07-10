package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.*
import com.imvj.cardledger.data.repo.isConflict
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class FriendRow(
    val holder: HolderDto,
    val total: Double,
    val outstanding: Double,
    val breakdown: List<Pair<CardDto, Double>>,
)

data class HoldersUiState(
    val loading: Boolean = true,
    val friends: List<FriendRow> = emptyList(),
    val allTransactions: List<TransactionDto> = emptyList(),
    val allPayments: List<PaymentDto> = emptyList(),
    val cards: List<CardDto> = emptyList(),
    val error: String? = null,
)

class HoldersViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(HoldersUiState())
    val state: StateFlow<HoldersUiState> = _state

    fun load() {
        viewModelScope.launch {
            val holders = c.holderRepo.list().getOrElse { emptyList() }
            val cards = c.cardRepo.list().getOrElse { emptyList() }
            val txns = c.transactionRepo.list().getOrElse { emptyList() }
            val payments = c.paymentRepo.list().getOrElse { emptyList() }
            val cardMap = cards.associateBy { it.id }

            val summaryRes = c.dashboardRepo.getSummary()
            val friends = if (summaryRes.isSuccess && summaryRes.getOrNull() != null) {
                val summary = summaryRes.getOrNull()!!
                val debtMap = summary.friendDebts.associateBy { it.holderId }
                holders.filter { it.relationship == "friend" }.map { h ->
                    val debt = debtMap[h.id]
                    val total = debt?.totalSpend ?: 0.0
                    val outstanding = debt?.remainingToPay ?: 0.0
                    val byCard = (debt?.rawByCard ?: debt?.byCard)?.entries?.mapNotNull { (cid, amt) ->
                        cardMap[cid]?.let { card -> card to amt }
                    } ?: emptyList()
                    FriendRow(h, total, outstanding, byCard)
                }
            } else {
                holders.filter { it.relationship == "friend" }.map { h ->
                    val mine = txns.filter { it.holder_id_at_time == h.id }
                    val myPayments = payments.filter { it.holder_id == h.id }
                    var total = 0.0
                    val rawByCardMap = mutableMapOf<String, Double>()
                    val totalSpendByCardMap = mutableMapOf<String, Double>()
                    mine.forEach { t ->
                        val a = t.amount.toDoubleOrNull() ?: 0.0
                        if (t.type == "payment") {
                            total -= a
                            totalSpendByCardMap[t.card_id] = kotlin.math.round(((totalSpendByCardMap[t.card_id] ?: 0.0) - a) * 100.0) / 100.0
                            if (!t.is_paid && a > 0) {
                                rawByCardMap[t.card_id] = kotlin.math.round(((rawByCardMap[t.card_id] ?: 0.0) - a) * 100.0) / 100.0
                            }
                        } else {
                            total += a
                            totalSpendByCardMap[t.card_id] = kotlin.math.round(((totalSpendByCardMap[t.card_id] ?: 0.0) + a) * 100.0) / 100.0
                            if (!t.is_paid && a > 0) {
                                rawByCardMap[t.card_id] = kotlin.math.round(((rawByCardMap[t.card_id] ?: 0.0) + a) * 100.0) / 100.0
                            }
                        }
                    }
                    val totalPaid = myPayments.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
                    val outstanding = maxOf(0.0, total - totalPaid)
                    val totalRawUnpaid = rawByCardMap.values.sumOf { maxOf(0.0, it) }
                    val totalFriendCardSpend = totalSpendByCardMap.values.sumOf { maxOf(0.0, it) }
                    val baseCards = if (totalRawUnpaid > 0.0) rawByCardMap else totalSpendByCardMap
                    val baseTotal = if (totalRawUnpaid > 0.0) totalRawUnpaid else totalFriendCardSpend

                    val byCardList = baseCards.mapNotNull { (cid, amt) ->
                        val card = cardMap[cid]
                        if (card != null && amt > 0.0) {
                            card to amt
                        } else null
                    }
                    FriendRow(h, total, outstanding, byCardList)
                }
            }
            _state.value = HoldersUiState(false, friends, txns, payments, cards)
        }
    }

    fun deletePayment(txnIdOrPaymentId: String) {
        viewModelScope.launch {
            c.paymentRepo.deleteByTransactionId(txnIdOrPaymentId)
            load()
        }
    }

    fun recordPayment(holderId: String, amount: Double, onDone: () -> Unit) {
        viewModelScope.launch {
            val date = java.time.LocalDate.now().toString()
            val dto = CreatePaymentDto(holder_id = holderId, amount = amount, payment_date = date)
            c.paymentRepo.create(dto).onSuccess { load(); onDone() }
                .onFailure { _state.value = _state.value.copy(error = "Could not record payment") }
        }
    }

    fun save(name: String, phone: String, editingId: String?, onDone: () -> Unit) {
        if (name.isBlank() || phone.length < 10) {
            _state.value = _state.value.copy(error = "Name and a 10-digit phone required")
            return
        }
        val dto = CreateHolderDto(name.trim(), phone.trim(), "friend")
        viewModelScope.launch {
            val res = if (editingId != null) c.holderRepo.update(editingId, dto) else c.holderRepo.create(dto)
            res.onSuccess { load(); onDone() }
                .onFailure { _state.value = _state.value.copy(error = "Could not save friend") }
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            c.holderRepo.delete(id)
                .onSuccess { load() }
                .onFailure { e ->
                    _state.value = _state.value.copy(
                        error = if (isConflict(e)) "Can't delete — this friend has transactions or assignments." else "Could not delete"
                    )
                }
        }
    }
}

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

            // Every balance here is computed server-side. The list is keyed off the server's
            // rows rather than the holders list so a friend can never be shown with figures
            // this client guessed at.
            val details = c.dashboardRepo.getHolderDetails().getOrElse { emptyList() }
            val holderMap = holders.associateBy { it.id }
            val friends = details.map { d ->
                val holder = holderMap[d.holderId]
                    ?: HolderDto(d.holderId, d.holderName, d.phone, d.relationship)
                val byCard = d.byCard.mapNotNull { b ->
                    cardMap[b.cardId]?.let { card -> card to b.grossAmount }
                }
                FriendRow(holder, d.totalSpend, d.outstanding, byCard)
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

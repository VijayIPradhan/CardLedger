package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.*
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit

data class BillingCycleItem(
    val id: String,
    val cardId: String,
    val cardNickname: String,
    val cardLast4: String,
    val cycleStart: String,
    val cycleEnd: String,
    val statementDate: String,
    val paymentDueDate: String,
    val totalSpend: Double,
    val totalRefunds: Double,
    val previousBalance: Double,
    val statementAmount: Double,
    val minimumDue: Double?,
    val paidAmount: Double,
    val paidOn: String?,
    val status: String,
    val isLocked: Boolean,
    val statementPdfUrl: String?,
    val notes: String?,
    val transactionCount: Int?,
    val cardPaymentCount: Int?,
    val remainingBalance: Double,
    val daysUntilDue: Long,
    val statusColor: CycleStatusColor,
    val createdAt: String,
    val updatedAt: String,
)

data class BillingCycleDetail(
    val cycle: BillingCycleItem,
    val transactions: List<TransactionDto>,
    val cardPayments: List<CardPaymentItemDto>,
    val totalTransactionAmount: Double,
    val totalCardPaymentAmount: Double,
)

enum class CycleStatusColor {
    PROJECTED,    // gray
    GENERATED,    // blue
    PAID,         // green
    OVERDUE       // red
}

data class BillingCyclesUiState(
    val loading: Boolean = true,
    val cycles: List<BillingCycleItem> = emptyList(),
    val selectedCycleDetail: BillingCycleDetail? = null,
    val cards: List<CardDto> = emptyList(),
    val error: String? = null,
)

class BillingCyclesViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(BillingCyclesUiState())
    val state: StateFlow<BillingCyclesUiState> = _state

    fun loadCycles(cardId: String? = null, status: String? = null) {
        _state.value = BillingCyclesUiState(loading = true)
        viewModelScope.launch {
            try {
                val cyclesD = async { c.billingCycleRepo.list(cardId, status) }
                val cardsD = async { c.cardRepo.list() }

                val cyclesResult = cyclesD.await()
                val cardsResult = cardsD.await()

                val cycles = cyclesResult.getOrNull() ?: emptyList()
                val cards = cardsResult.getOrNull() ?: emptyList()

                val cycleItems = cycles.map { dto -> mapToCycleItem(dto, cards) }

                _state.value = BillingCyclesUiState(
                    loading = false,
                    cycles = cycleItems,
                    cards = cards,
                    error = null
                )
            } catch (e: Exception) {
                _state.value = BillingCyclesUiState(
                    loading = false,
                    error = e.message ?: "Failed to load billing cycles"
                )
            }
        }
    }

    fun loadCycleDetail(cycleId: String) {
        viewModelScope.launch {
            try {
                _state.value = _state.value.copy(loading = true, error = null)

                val detailResult = c.billingCycleRepo.get(cycleId)
                val detail = detailResult.getOrNull()

                if (detail != null) {
                    val cycleItem = mapToCycleItem(detail, _state.value.cards)
                    val totalTxnAmount = detail.transactions
                        .filter { it.type != "bill_payment" }
                        .sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
                    val totalPaymentAmount = detail.card_payments.sumOf { it.amount }

                    val cycleDetail = BillingCycleDetail(
                        cycle = cycleItem,
                        transactions = detail.transactions,
                        cardPayments = detail.card_payments,
                        totalTransactionAmount = totalTxnAmount,
                        totalCardPaymentAmount = totalPaymentAmount
                    )

                    _state.value = _state.value.copy(
                        loading = false,
                        selectedCycleDetail = cycleDetail,
                        error = null
                    )
                } else {
                    _state.value = _state.value.copy(
                        loading = false,
                        error = "Failed to load cycle details"
                    )
                }
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    loading = false,
                    error = e.message ?: "Failed to load cycle details"
                )
            }
        }
    }

    fun createCycle(dto: CreateBillingCycleDto, onDone: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val result = c.billingCycleRepo.create(dto)
                if (result.isSuccess) {
                    loadCycles()
                    onDone(true, null)
                } else {
                    val error = result.exceptionOrNull()?.message ?: "Failed to create billing cycle"
                    _state.value = _state.value.copy(error = error)
                    onDone(false, error)
                }
            } catch (e: Exception) {
                val error = e.message ?: "Failed to create billing cycle"
                _state.value = _state.value.copy(error = error)
                onDone(false, error)
            }
        }
    }

    fun updateCycle(id: String, dto: UpdateBillingCycleDto, onDone: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val result = c.billingCycleRepo.update(id, dto)
                if (result.isSuccess) {
                    loadCycles()
                    if (_state.value.selectedCycleDetail?.cycle?.id == id) {
                        loadCycleDetail(id)
                    }
                    onDone(true, null)
                } else {
                    val error = result.exceptionOrNull()?.message ?: "Failed to update billing cycle"
                    _state.value = _state.value.copy(error = error)
                    onDone(false, error)
                }
            } catch (e: Exception) {
                val error = e.message ?: "Failed to update billing cycle"
                _state.value = _state.value.copy(error = error)
                onDone(false, error)
            }
        }
    }

    fun closeCycle(id: String, onDone: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val result = c.billingCycleRepo.close(id)
                if (result.isSuccess) {
                    loadCycles()
                    if (_state.value.selectedCycleDetail?.cycle?.id == id) {
                        loadCycleDetail(id)
                    }
                    onDone(true, null)
                } else {
                    val error = result.exceptionOrNull()?.message ?: "Failed to close billing cycle"
                    _state.value = _state.value.copy(error = error)
                    onDone(false, error)
                }
            } catch (e: Exception) {
                val error = e.message ?: "Failed to close billing cycle"
                _state.value = _state.value.copy(error = error)
                onDone(false, error)
            }
        }
    }

    fun loadCards() {
        viewModelScope.launch {
            try {
                val result = c.cardRepo.list()
                val cards = result.getOrNull() ?: emptyList()
                _state.value = _state.value.copy(cards = cards)
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    error = e.message ?: "Failed to load cards"
                )
            }
        }
    }

    fun clearError() {
        _state.value = _state.value.copy(error = null)
    }

    fun clearSelectedCycleDetail() {
        _state.value = _state.value.copy(selectedCycleDetail = null)
    }

    private fun mapToCycleItem(dto: BillingCycleDto, cards: List<CardDto>): BillingCycleItem {
        val card = cards.firstOrNull { it.id == dto.card_id }
        val remainingBalance = dto.statement_amount - dto.paid_amount
        val daysUntilDue = calculateDaysUntilDue(dto.payment_due_date)
        val statusColor = determineStatusColor(dto.status, daysUntilDue, remainingBalance)

        return BillingCycleItem(
            id = dto.id,
            cardId = dto.card_id,
            cardNickname = card?.nickname ?: "Unknown Card",
            cardLast4 = card?.last4 ?: "****",
            cycleStart = dto.cycle_start,
            cycleEnd = dto.cycle_end,
            statementDate = dto.statement_date,
            paymentDueDate = dto.payment_due_date,
            totalSpend = dto.total_spend,
            totalRefunds = dto.total_refunds,
            previousBalance = dto.previous_balance,
            statementAmount = dto.statement_amount,
            minimumDue = dto.minimum_due,
            paidAmount = dto.paid_amount,
            paidOn = dto.paid_on,
            status = dto.status,
            isLocked = dto.is_locked,
            statementPdfUrl = dto.statement_pdf_url,
            notes = dto.notes,
            transactionCount = dto.transaction_count,
            cardPaymentCount = dto.card_payment_count,
            remainingBalance = remainingBalance,
            daysUntilDue = daysUntilDue,
            statusColor = statusColor,
            createdAt = dto.created_at,
            updatedAt = dto.updated_at,
        )
    }

    private fun mapToCycleItem(dto: BillingCycleDetailDto, cards: List<CardDto>): BillingCycleItem {
        val card = cards.firstOrNull { it.id == dto.card_id }
        val remainingBalance = dto.statement_amount - dto.paid_amount
        val daysUntilDue = calculateDaysUntilDue(dto.payment_due_date)
        val statusColor = determineStatusColor(dto.status, daysUntilDue, remainingBalance)

        return BillingCycleItem(
            id = dto.id,
            cardId = dto.card_id,
            cardNickname = card?.nickname ?: "Unknown Card",
            cardLast4 = card?.last4 ?: "****",
            cycleStart = dto.cycle_start,
            cycleEnd = dto.cycle_end,
            statementDate = dto.statement_date,
            paymentDueDate = dto.payment_due_date,
            totalSpend = dto.total_spend,
            totalRefunds = dto.total_refunds,
            previousBalance = dto.previous_balance,
            statementAmount = dto.statement_amount,
            minimumDue = dto.minimum_due,
            paidAmount = dto.paid_amount,
            paidOn = dto.paid_on,
            status = dto.status,
            isLocked = dto.is_locked,
            statementPdfUrl = dto.statement_pdf_url,
            notes = dto.notes,
            transactionCount = dto.transactions.size,
            cardPaymentCount = dto.card_payments.size,
            remainingBalance = remainingBalance,
            daysUntilDue = daysUntilDue,
            statusColor = statusColor,
            createdAt = dto.created_at,
            updatedAt = dto.updated_at,
        )
    }

    private fun calculateDaysUntilDue(paymentDueDate: String): Long {
        return try {
            val dueDate = LocalDate.parse(paymentDueDate)
            val today = LocalDate.now()
            ChronoUnit.DAYS.between(today, dueDate)
        } catch (e: Exception) {
            0L
        }
    }

    private fun determineStatusColor(status: String, daysUntilDue: Long, remainingBalance: Double): CycleStatusColor {
        return when {
            status.equals("paid", ignoreCase = true) || remainingBalance <= 0.0 -> CycleStatusColor.PAID
            status.equals("overdue", ignoreCase = true) || daysUntilDue < 0 -> CycleStatusColor.OVERDUE
            status.equals("generated", ignoreCase = true) -> CycleStatusColor.GENERATED
            else -> CycleStatusColor.PROJECTED
        }
    }
}

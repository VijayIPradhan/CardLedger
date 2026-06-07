package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.*
import com.imvj.cardledger.domain.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class HomeUiState(
    val loading: Boolean = true,
    val cards: List<CardDto> = emptyList(),
    val holders: List<HolderDto> = emptyList(),
    val assignments: List<AssignmentDto> = emptyList(),
    val transactions: List<TransactionDto> = emptyList(),
    val spendByCard: Map<String, Double> = emptyMap(),
    val total: Utilization = Utilization(0.0, 0.0, 0.0),
    val dues: List<UpcomingDue> = emptyList(),
)

class HomeViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state

    fun load() {
        viewModelScope.launch {
            val cards = c.cardRepo.list().getOrElse { emptyList() }
            val holders = c.holderRepo.list().getOrElse { emptyList() }
            val assignments = c.assignmentRepo.list().getOrElse { emptyList() }
            val txns = c.transactionRepo.list().getOrElse { emptyList() }
            val spend = cards.associate { card ->
                card.id to txns.filter { it.card_id == card.id }.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
            }
            _state.value = HomeUiState(
                loading = false, cards = cards, holders = holders, assignments = assignments,
                transactions = txns, spendByCard = spend,
                total = totalUtilization(cards, spend),
                dues = upcomingDues(cards, today(), 7),
            )
            com.imvj.cardledger.notif.ReminderScheduler.reschedule(
                c.appContext, cards, c.prefsStore.reminderDays(), c.prefsStore.remindersEnabled()
            )
        }
    }
}

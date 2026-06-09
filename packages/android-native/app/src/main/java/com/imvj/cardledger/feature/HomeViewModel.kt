package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.*
import com.imvj.cardledger.domain.*
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

private const val UPCOMING_DUES_WITHIN_DAYS = 7

data class HomeUiState(
    val loading: Boolean = true,
    val cards: List<CardDto> = emptyList(),
    val holders: List<HolderDto> = emptyList(),
    val assignments: List<AssignmentDto> = emptyList(),
    val transactions: List<TransactionDto> = emptyList(),
    val spendByCard: Map<String, Double> = emptyMap(),
    val total: Utilization = Utilization(0.0, 0.0, 0.0),
    val totalToCollect: Double = 0.0,
    val dues: List<UpcomingDue> = emptyList(),
)

class HomeViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state

    fun load() {
        viewModelScope.launch {
            val cardsD = async { c.cardRepo.list().getOrElse { emptyList() } }
            val holdersD = async { c.holderRepo.list().getOrElse { emptyList() } }
            val assignmentsD = async { c.assignmentRepo.list().getOrElse { emptyList() } }
            val txnsD = async { c.transactionRepo.list().getOrElse { emptyList() } }
            val paymentsD = async { c.paymentRepo.list().getOrElse { emptyList() } }
            val cards = cardsD.await()
            val holders = holdersD.await()
            val assignments = assignmentsD.await()
            val txns = txnsD.await()
            val payments = paymentsD.await()
            
            val spend = cards.associate { card ->
                val groupId = card.shared_limit_with ?: card.id
                val groupSpend = cards.filter { (it.shared_limit_with ?: it.id) == groupId }
                    .sumOf { it.current_spend?.toDoubleOrNull() ?: 0.0 }
                card.id to groupSpend
            }
            
            val friends = holders.filter { it.relationship == "friend" }
            var totalToCollect = 0.0
            friends.forEach { friend ->
                val expenses = txns.filter { it.holder_id_at_time == friend.id }.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
                val paid = payments.filter { it.holder_id == friend.id }.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
                totalToCollect += (expenses - paid)
            }

            _state.value = HomeUiState(
                loading = false, cards = cards, holders = holders, assignments = assignments,
                transactions = txns, spendByCard = spend,
                total = totalUtilization(cards, spend),
                totalToCollect = totalToCollect,
                dues = upcomingDues(cards, today(), UPCOMING_DUES_WITHIN_DAYS),
            )
            com.imvj.cardledger.notif.ReminderScheduler.reschedule(
                c.appContext, cards, c.prefsStore.reminderDays(), c.prefsStore.remindersEnabled()
            )
        }
    }
}

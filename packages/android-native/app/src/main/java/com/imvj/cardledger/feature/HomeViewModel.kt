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
private const val TOP_MERCHANTS_COUNT = 5

data class HolderSpend(val holderId: String, val name: String, val isMe: Boolean, val spend: Double)
data class MerchantSpend(val merchant: String, val amount: Double, val count: Int)
data class DailySpend(val date: String, val dayLabel: String, val amount: Double, val isToday: Boolean)

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
    val spendByHolder: List<HolderSpend> = emptyList(),
    val topMerchants: List<MerchantSpend> = emptyList(),
    val monthlySpend: Double = 0.0,
    val prevMonthSpend: Double = 0.0,
    val dailySpend: List<DailySpend> = emptyList(),
    val unpaidCount: Int = 0,
    val unpaidAmount: Double = 0.0,
    val avgDailySpend: Double = 0.0,
    val spendByNetwork: Map<String, Double> = emptyMap(),
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

            val holderMap = holders.associateBy { it.id }
            val spendTxns = txns.filter { it.type == "spend" }

            val spendByHolder = spendTxns
                .groupBy { it.holder_id_at_time }
                .entries
                .mapNotNull { (hid, entries) ->
                    val h = holderMap[hid] ?: return@mapNotNull null
                    HolderSpend(hid, h.name, h.relationship == "me", entries.sumOf { it.amount.toDoubleOrNull() ?: 0.0 })
                }
                .sortedByDescending { it.spend }

            val topMerchants = spendTxns
                .groupBy { it.merchant }
                .entries
                .map { (m, entries) -> MerchantSpend(m, entries.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }, entries.size) }
                .sortedByDescending { it.amount }
                .take(TOP_MERCHANTS_COUNT)

            val todayDate = java.time.LocalDate.parse(today())
            val cutoff30 = todayDate.minusDays(30).toString()
            val cutoff60 = todayDate.minusDays(60).toString()
            val monthlySpend = spendTxns.filter { it.txn_date >= cutoff30 }.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
            val prevMonthSpend = spendTxns.filter { it.txn_date >= cutoff60 && it.txn_date < cutoff30 }.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }

            val dayNames = listOf("Su", "Mo", "Tu", "We", "Th", "Fr", "Sa")
            val dailySpend = (6 downTo 0).map { offset ->
                val date = todayDate.minusDays(offset.toLong())
                val dateStr = date.toString()
                DailySpend(
                    date = dateStr,
                    dayLabel = dayNames[date.dayOfWeek.value % 7],
                    amount = spendTxns.filter { it.txn_date == dateStr }.sumOf { it.amount.toDoubleOrNull() ?: 0.0 },
                    isToday = offset == 0,
                )
            }

            val unpaidTxns = txns.filter { it.type == "spend" && !it.is_paid }
            val unpaidCount = unpaidTxns.size
            val unpaidAmount = unpaidTxns.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }

            val cardNetworkMap = cards.associate { it.id to it.network }
            val spendByNetwork = spendTxns
                .groupBy { cardNetworkMap[it.card_id] ?: "Other" }
                .mapValues { (_, entries) -> entries.sumOf { it.amount.toDoubleOrNull() ?: 0.0 } }
                .filter { it.value > 0 }

            _state.value = HomeUiState(
                loading = false, cards = cards, holders = holders, assignments = assignments,
                transactions = txns, spendByCard = spend,
                total = totalUtilization(cards, spend),
                totalToCollect = totalToCollect,
                dues = upcomingDues(cards, today(), UPCOMING_DUES_WITHIN_DAYS),
                spendByHolder = spendByHolder,
                topMerchants = topMerchants,
                monthlySpend = monthlySpend,
                prevMonthSpend = prevMonthSpend,
                dailySpend = dailySpend,
                unpaidCount = unpaidCount,
                unpaidAmount = unpaidAmount,
                avgDailySpend = monthlySpend / 30.0,
                spendByNetwork = spendByNetwork,
            )
            com.imvj.cardledger.notif.ReminderScheduler.reschedule(
                c.appContext, cards, c.prefsStore.reminderDays(), c.prefsStore.remindersEnabled()
            )
        }
    }
}

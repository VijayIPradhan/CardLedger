package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.*
import com.imvj.cardledger.data.store.OfflineCache
import com.imvj.cardledger.domain.*
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val UPCOMING_DUES_WITHIN_DAYS = 7
private const val TOP_MERCHANTS_COUNT = 5

data class HolderSpend(val holderId: String, val name: String, val isMe: Boolean, val spend: Double)
data class MerchantSpend(val merchant: String, val amount: Double, val count: Int)
data class DailySpend(val date: String, val dayLabel: String, val amount: Double, val isToday: Boolean)

data class RecurringBill(
    val merchant: String,
    val amount: Double,
    val expectedDate: String
)

data class CardProjection(
    val cardId: String,
    val currentCycleStart: String,
    val currentCycleEnd: String,
    val currentUnbilled: Double,
    val upcomingBills: List<RecurringBill>,
    val projectedTotal: Double
)

data class HomeUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
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
    val toCollectByCard: Map<String, Double> = emptyMap(),
    val projections: List<CardProjection> = emptyList(),
    val friendTotalSpend: Double = 0.0,
    val friendTotalPaid: Double = 0.0,
    val friendRemainingToPay: Double = 0.0,
    val friendAdvanceInHand: Double = 0.0,
    val payments: List<PaymentDto> = emptyList(),
    val friendDebts: List<FriendDebtDto> = emptyList(),
)

class HomeViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state

    /** Guards against duplicate concurrent loads */
    @Volatile private var loadJob: kotlinx.coroutines.Job? = null

    /** Tracks the last successful network fetch to detect staleness on resume */
    @Volatile private var lastNetworkFetchMs: Long = 0L

    fun load(forceRefresh: Boolean = false) {
        // Cancel any in-flight load to avoid race conditions
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            if (forceRefresh) {
                _state.value = _state.value.copy(isRefreshing = true)
            } else if (_state.value.cards.isEmpty()) {
                _state.value = _state.value.copy(loading = true)
            }

            var showedCache = false

            // Always try to show cached data first (instant UI)
            if (!forceRefresh) {
                val cache = c.cacheStore.load()
                if (cache != null) {
                    processData(cache.cards, cache.holders, cache.assignments, cache.transactions, cache.payments)
                    showedCache = true

                    // If cache is fresh AND we recently fetched from network, skip network call
                    val isFresh = c.cacheStore.isFresh(cache)
                    val recentNetworkFetch = (System.currentTimeMillis() - lastNetworkFetchMs) < com.imvj.cardledger.data.store.CacheStore.MAX_AGE_MS
                    if (isFresh && recentNetworkFetch) {
                        _state.value = _state.value.copy(loading = false, isRefreshing = false)
                        return@launch
                    }
                    // Cache is stale → continue to network refresh below (silently, no loading spinner)
                }
            }

            // Network refresh (always if forceRefresh, or if cache was stale/missing)
            try {
                val summaryD = async { c.dashboardRepo.getSummary() }
                val cardsD = async { c.cardRepo.list() }
                val holdersD = async { c.holderRepo.list() }
                val assignmentsD = async { c.assignmentRepo.list() }
                val txnsD = async { c.transactionRepo.list() }
                val paymentsD = async { c.paymentRepo.list() }

                val summary = summaryD.await().getOrNull()
                val cards = cardsD.await().getOrNull()
                val holders = holdersD.await().getOrNull()
                val assignments = assignmentsD.await().getOrNull() ?: emptyList()
                val txns = txnsD.await().getOrNull()
                val payments = paymentsD.await().getOrNull() ?: emptyList()

                if (cards != null && holders != null && txns != null) {
                    c.cacheStore.save(OfflineCache(cards, holders, assignments, txns, payments))
                    lastNetworkFetchMs = System.currentTimeMillis()
                    if (summary != null) {
                        applySummary(summary, cards, holders, assignments, txns, payments)
                    } else {
                        processData(cards, holders, assignments, txns, payments)
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }

            _state.value = _state.value.copy(loading = false, isRefreshing = false)
        }
    }

    private suspend fun applySummary(
        summary: DashboardSummaryDto,
        cards: List<CardDto>,
        holders: List<HolderDto>,
        assignments: List<AssignmentDto>,
        txns: List<TransactionDto>,
        payments: List<PaymentDto>
    ) = withContext(Dispatchers.Default) {
        _state.value = _state.value.copy(
            loading = false,
            cards = cards, holders = holders, assignments = assignments,
            transactions = txns, payments = payments,
            spendByCard = summary.spendByCard,
            total = Utilization(summary.totalSpend, summary.totalLimit, summary.totalUtilizationPercent),
            totalToCollect = summary.totalToCollect,
            dues = summary.dues.map { d -> UpcomingDue(d.cardId, d.dueDate, d.daysUntil) },
            spendByHolder = summary.spendByHolder.map { h -> HolderSpend(h.holderId, h.holderName, h.isMe, h.spend) },
            topMerchants = summary.topMerchants.map { m -> MerchantSpend(m.merchant, m.amount, m.count) },
            monthlySpend = summary.monthlySpend,
            prevMonthSpend = summary.prevMonthSpend,
            dailySpend = summary.dailySpend.map { d -> DailySpend(d.date, d.dayLabel, d.amount, d.isToday) },
            unpaidCount = summary.unpaidCount,
            unpaidAmount = summary.unpaidAmount,
            avgDailySpend = summary.avgDailySpend,
            spendByNetwork = summary.spendByNetwork,
            toCollectByCard = summary.toCollectByCard,
            projections = summary.projections.map { p ->
                CardProjection(
                    cardId = p.cardId,
                    currentCycleStart = p.currentCycleStart,
                    currentCycleEnd = p.currentCycleEnd,
                    currentUnbilled = p.currentUnbilled,
                    upcomingBills = p.upcomingBills.map { b -> RecurringBill(b.merchant, b.amount, b.expectedDate) },
                    projectedTotal = p.projectedTotal
                )
            },
            friendTotalSpend = summary.friendTotalSpend,
            friendTotalPaid = summary.friendTotalPaid,
            friendRemainingToPay = summary.friendRemainingToPay,
            friendAdvanceInHand = summary.friendDebts.sumOf { debt ->
                maxOf(0.0, debt.totalPaid - debt.totalSpend)
            },
            friendDebts = summary.friendDebts,
        )

        com.imvj.cardledger.notif.ReminderScheduler.reschedule(
            c.appContext, cards, c.prefsStore.reminderDays(), c.prefsStore.remindersEnabled()
        )
    }

    private suspend fun processData(
        cards: List<CardDto>,
        holders: List<HolderDto>,
        assignments: List<AssignmentDto>,
        txns: List<TransactionDto>,
        payments: List<PaymentDto>
    ) = withContext(Dispatchers.Default) {
        val spend = cards.associate { card ->
            card.id to (card.current_spend?.toDoubleOrNull() ?: 0.0)
        }
        
        val collectedCards = c.prefsStore.getCollectedCards()
        val friends = holders.filter { it.relationship == "friend" }
        var friendTotalSpend = 0.0
        var friendTotalPaid = 0.0
        val toCollectByCard = mutableMapOf<String, Double>()
        val friendDebts = mutableListOf<FriendDebtDto>()
        friends.forEach { friend ->
            val friendTxns = txns.filter { it.holder_id_at_time == friend.id }
            var expenses = 0.0
            val rawByCard = mutableMapOf<String, Double>()
            val totalSpendByCard = mutableMapOf<String, Double>()
            friendTxns.forEach { txn ->
                val amt = txn.amount.toDoubleOrNull() ?: 0.0
                val cid = txn.card_id
                if (txn.type == "payment") {
                    expenses -= amt
                    totalSpendByCard[cid] = kotlin.math.round(((totalSpendByCard[cid] ?: 0.0) - amt) * 100.0) / 100.0
                    if (!txn.is_paid && amt > 0) {
                        rawByCard[cid] = kotlin.math.round(((rawByCard[cid] ?: 0.0) - amt) * 100.0) / 100.0
                    }
                } else {
                    expenses += amt
                    totalSpendByCard[cid] = kotlin.math.round(((totalSpendByCard[cid] ?: 0.0) + amt) * 100.0) / 100.0
                    if (!txn.is_paid && amt > 0) {
                        rawByCard[cid] = kotlin.math.round(((rawByCard[cid] ?: 0.0) + amt) * 100.0) / 100.0
                    }
                }
            }
            val paid = payments.filter { it.holder_id == friend.id }.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
            friendTotalSpend += expenses
            friendTotalPaid += paid
            val remainingToPay = maxOf(0.0, expenses - paid)
            val totalRawUnpaid = rawByCard.values.sumOf { maxOf(0.0, it) }
            val totalFriendCardSpend = totalSpendByCard.values.sumOf { maxOf(0.0, it) }
            val byCard = mutableMapOf<String, Double>()

            val baseCards = if (totalRawUnpaid > 0.0) rawByCard else totalSpendByCard
            val baseTotal = if (totalRawUnpaid > 0.0) totalRawUnpaid else totalFriendCardSpend

            baseCards.forEach { (cid, amt) ->
                if (amt <= 0.0 || remainingToPay <= 0.0) {
                    byCard[cid] = 0.0
                } else if (baseTotal <= remainingToPay || baseTotal <= 0.0) {
                    byCard[cid] = amt
                    toCollectByCard[cid] = kotlin.math.round(((toCollectByCard[cid] ?: 0.0) + amt) * 100.0) / 100.0
                } else {
                    val allocated = kotlin.math.round((amt / baseTotal) * remainingToPay * 100.0) / 100.0
                    byCard[cid] = allocated
                    toCollectByCard[cid] = kotlin.math.round(((toCollectByCard[cid] ?: 0.0) + allocated) * 100.0) / 100.0
                }
            }
            friendDebts.add(FriendDebtDto(friend.id, friend.name, friend.phone, expenses, paid, remainingToPay, byCard, rawByCard))
        }
        friendDebts.sortByDescending { it.remainingToPay }
        val totalToCollect = toCollectByCard.values.sum()
        val friendRemainingToPay = maxOf(0.0, friendTotalSpend - friendTotalPaid)

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

        val recurringMerchants = mutableListOf<RecurringBill>()
        spendTxns.groupBy { it.merchant }.forEach { (merchant, txns) ->
            if (txns.size >= 2) {
                val sorted = txns.sortedByDescending { it.txn_date }
                val latest = sorted[0]
                val previous = sorted[1]
                val d1 = java.time.LocalDate.parse(latest.txn_date)
                val d2 = java.time.LocalDate.parse(previous.txn_date)
                val daysBetween = java.time.temporal.ChronoUnit.DAYS.between(d2, d1)
                
                val amt1 = latest.amount.toDoubleOrNull() ?: 0.0
                val amt2 = previous.amount.toDoubleOrNull() ?: 0.0
                val variance = if (amt1 > 0) Math.abs(amt1 - amt2) / amt1 else 0.0
                
                if (daysBetween in 25..35 && variance < 0.1) {
                    val expected = d1.plusMonths(1)
                    recurringMerchants.add(RecurringBill(merchant, amt1, expected.toString()))
                }
            }
        }

        val projections = cards.map { card ->
            var start = todayDate.withDayOfMonth(card.billing_cycle_day.coerceIn(1, 28))
            if (start.isAfter(todayDate)) {
                start = start.minusMonths(1)
            }
            val end = start.plusMonths(1).minusDays(1)
            
            val cardTxns = spendTxns.filter { it.card_id == card.id }
            val unbilledTxns = cardTxns.filter { 
                val d = java.time.LocalDate.parse(it.txn_date)
                !d.isBefore(start) && !d.isAfter(end)
            }
            val currentUnbilled = unbilledTxns.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
            
            val cardRecurringMerchants = recurringMerchants.filter { rb ->
                val latestTxn = spendTxns.filter { it.merchant == rb.merchant }.maxByOrNull { it.txn_date }
                latestTxn?.card_id == card.id
            }

            val upcoming = cardRecurringMerchants.filter { rb ->
                val exp = java.time.LocalDate.parse(rb.expectedDate)
                (!exp.isBefore(start) && !exp.isAfter(end)) && !exp.isBefore(todayDate)
            }
            
            val projectedUpcoming = upcoming.sumOf { it.amount }
            
            CardProjection(
                cardId = card.id,
                currentCycleStart = start.toString(),
                currentCycleEnd = end.toString(),
                currentUnbilled = currentUnbilled,
                upcomingBills = upcoming.sortedBy { it.expectedDate },
                projectedTotal = currentUnbilled + projectedUpcoming
            )
        }

        _state.value = _state.value.copy(
            loading = false,
            cards = cards, holders = holders, assignments = assignments,
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
            toCollectByCard = toCollectByCard,
            projections = projections,
            friendTotalSpend = friendTotalSpend,
            friendTotalPaid = friendTotalPaid,
            friendRemainingToPay = friendRemainingToPay,
            friendAdvanceInHand = friendDebts.sumOf { debt ->
                maxOf(0.0, debt.totalPaid - debt.totalSpend)
            },
            payments = payments,
            friendDebts = friendDebts,
        )
        
        com.imvj.cardledger.notif.ReminderScheduler.reschedule(
            c.appContext, cards, c.prefsStore.reminderDays(), c.prefsStore.remindersEnabled()
        )
    }
}

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
                val cardsD = async { c.cardRepo.list() }
                val holdersD = async { c.holderRepo.list() }
                val assignmentsD = async { c.assignmentRepo.list() }
                val txnsD = async { c.transactionRepo.list() }
                val paymentsD = async { c.paymentRepo.list() }

                val cards = cardsD.await().getOrNull()
                val holders = holdersD.await().getOrNull()
                val assignments = assignmentsD.await().getOrNull() ?: emptyList()
                val txns = txnsD.await().getOrNull()
                val payments = paymentsD.await().getOrNull() ?: emptyList()

                if (cards != null && holders != null && txns != null) {
                    c.cacheStore.save(OfflineCache(cards, holders, assignments, txns, payments))
                    lastNetworkFetchMs = System.currentTimeMillis()
                    processData(cards, holders, assignments, txns, payments)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }

            _state.value = _state.value.copy(loading = false, isRefreshing = false)
        }
    }

    private suspend fun processData(
        cards: List<CardDto>,
        holders: List<HolderDto>,
        assignments: List<AssignmentDto>,
        txns: List<TransactionDto>,
        payments: List<PaymentDto>
    ) = withContext(Dispatchers.Default) {
        val spend = cards.associate { card ->
            val groupId = card.shared_limit_with ?: card.id
            val groupSpend = cards.filter { (it.shared_limit_with ?: it.id) == groupId }
                .sumOf { it.current_spend?.toDoubleOrNull() ?: 0.0 }
            card.id to groupSpend
        }
        
        val friends = holders.filter { it.relationship == "friend" }
        var totalToCollect = 0.0
        val toCollectByCard = mutableMapOf<String, Double>()
        friends.forEach { friend ->
            val friendTxns = txns.filter { it.holder_id_at_time == friend.id }
            val expenses = friendTxns.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
            val paid = payments.filter { it.holder_id == friend.id }.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
            totalToCollect += (expenses - paid)
            
            var remainingPaid = paid
            val sortedTxns = friendTxns.sortedBy { it.txn_date }
            for (txn in sortedTxns) {
                val amt = txn.amount.toDoubleOrNull() ?: 0.0
                val cardId = txn.card_id
                if (remainingPaid >= amt) {
                    remainingPaid -= amt
                } else {
                    val unpaid = amt - remainingPaid
                    remainingPaid = 0.0
                    toCollectByCard[cardId] = (toCollectByCard[cardId] ?: 0.0) + unpaid
                }
            }
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
        )
        
        com.imvj.cardledger.notif.ReminderScheduler.reschedule(
            c.appContext, cards, c.prefsStore.reminderDays(), c.prefsStore.remindersEnabled()
        )
    }
}

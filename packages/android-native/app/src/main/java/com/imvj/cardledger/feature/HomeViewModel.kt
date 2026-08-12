package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.*
import com.imvj.cardledger.data.store.OfflineCache
import com.imvj.cardledger.domain.*
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

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
    val totalRewards: Double = 0.0,
    val totalForex: Double = 0.0,
    val budgetProgress: List<com.imvj.cardledger.data.net.BudgetProgressDto> = emptyList(),
)

class HomeViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state

    /** Guards against duplicate concurrent loads */
    @Volatile private var loadJob: kotlinx.coroutines.Job? = null

    /** Tracks the last successful network fetch to detect staleness on resume */
    @Volatile private var lastNetworkFetchMs: Long = 0L

    fun load(forceRefresh: Boolean = false) {
        // Cancel any in-flight load to avoid race conditions. Capture and publish the job
        // handle synchronously, then await the old job from inside the new one — joining
        // guarantees the outgoing load's _state writes land before ours, which a bare
        // cancel() does not.
        val previousJob = loadJob
        loadJob = viewModelScope.launch {
            previousJob?.cancelAndJoin()
            if (forceRefresh) {
                _state.value = _state.value.copy(isRefreshing = true)
            } else if (_state.value.cards.isEmpty()) {
                _state.value = _state.value.copy(loading = true)
            }

            // Always try to show cached data first (instant UI). A snapshot taken before the
            // summary was cached has no money figures in it and is skipped — recomputing them
            // here is exactly what let the app disagree with the server.
            if (!forceRefresh) {
                val cache = c.cacheStore.load()
                val cachedSummary = cache?.summary
                if (cache != null && cachedSummary != null) {
                    applySummary(cachedSummary, cache.cards, cache.holders, cache.assignments, cache.transactions, cache.payments)

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
                // Stamp the snapshot with when the fetch STARTED, not when it finished. A write
                // that lands mid-flight must leave this snapshot looking stale, otherwise we'd
                // persist pre-write data bearing a post-write timestamp and trust it.
                val fetchStartedAtMs = System.currentTimeMillis()
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

                // The summary is mandatory: it carries every figure on this screen, and there is
                // no local fallback that could produce them. Without it we keep showing whatever
                // is already on screen rather than pairing fresh lists with stale money.
                if (summary != null && cards != null && holders != null && txns != null) {
                    c.cacheStore.save(
                        OfflineCache(cards, holders, assignments, txns, payments, summary, fetchStartedAtMs)
                    )
                    lastNetworkFetchMs = fetchStartedAtMs
                    applySummary(summary, cards, holders, assignments, txns, payments)
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
            // Use the server's figure directly. It is net of both cash payments and card
            // payments; summing rawByCard here instead would report GROSS unpaid spend, which
            // never falls when a payment is recorded. Screens that want the gross number derive
            // it from friendDebts[].rawByCard themselves (see HomeScreen's friendUsage).
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
            friendAdvanceInHand = summary.friendAdvanceInHand,
            friendDebts = summary.friendDebts,
            totalRewards = summary.totalRewards,
            totalForex = summary.totalForex,
            budgetProgress = summary.budgetProgress,
        )

        com.imvj.cardledger.notif.ReminderScheduler.reschedule(
            c.appContext, cards, c.prefsStore.reminderDays(), c.prefsStore.remindersEnabled()
        )
    }
}

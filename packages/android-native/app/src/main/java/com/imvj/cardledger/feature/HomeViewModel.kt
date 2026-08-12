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

                if (cards != null && holders != null && txns != null) {
                    c.cacheStore.save(
                        OfflineCache(cards, holders, assignments, txns, payments, fetchStartedAtMs)
                    )
                    lastNetworkFetchMs = fetchStartedAtMs
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
        
        // ── 2. Friend Collections & Remaining ──
        // This offline logic mirrors summary.ts on the backend. It distinguishes Gross Spend
        // (all recorded spend), Unpaid Spend (spend not yet marked 'is_paid'), Cash Payments
        // (cash received from a friend), and Card Payments (money paid straight to the bank
        // on a friend's behalf).
        //
        // Card payments live in their own `card_payments` table server-side. The /transactions
        // endpoint projects them into this list as synthetic rows with type == "bill_payment",
        // mapping card_payments.holder_id → holder_id_at_time and .transaction_id →
        // linked_transaction_id. Every bill_payment POST is routed into card_payments, so a
        // bill_payment row here is always a card payment, never a real transaction.
        // Index once up front. Without these, the friend loop re-scans the whole transaction
        // list per friend, and each linked payment/card-payment costs another full scan — the
        // section is O(friends × txns + linkedRecords × txns). Indexed, it is linear.
        val txnById = txns.associateBy { it.id }
        val txnsByHolder = txns.groupBy { it.holder_id_at_time }
        val paymentsByHolder = payments.groupBy { it.holder_id }

        val friends = holders.filter { it.relationship == "friend" }
        var friendTotalSpend = 0.0 // Gross Spend less Card Payments, summed across all friends
        var friendTotalPaid = 0.0 // Global tracker for Cash Payments received
        var friendTotalGrossSpend = 0.0 // Gross Spend, NOT reduced by Card Payments
        var friendTotalUnpaidSpend = 0.0 // Global tracker for Unpaid Spend (spend not marked 'is_paid')
        var friendTotalCardPayments = 0.0 // Global tracker for money paid straight to the bank
        val toCollectByCard = mutableMapOf<String, Double>()
        val friendDebts = mutableListOf<FriendDebtDto>()
        friends.forEach { friend ->
            val friendTxns = txnsByHolder[friend.id].orEmpty()
            val friendPayments = paymentsByHolder[friend.id].orEmpty()
            var expenses = 0.0
            val rawByCard = mutableMapOf<String, Double>()
            friendTxns.forEach { txn ->
                val amt = txn.amount.toDoubleOrNull() ?: 0.0
                val cid = txn.card_id
                if (txn.type == "refund") {
                    expenses -= amt
                    friendTotalGrossSpend -= amt
                    if (!txn.is_paid && amt > 0) {
                        rawByCard[cid] = kotlin.math.round(((rawByCard[cid] ?: 0.0) - amt) * 100.0) / 100.0
                        friendTotalUnpaidSpend -= amt
                    }
                } else if (txn.type == "spend") {
                    expenses += amt
                    friendTotalGrossSpend += amt
                    if (!txn.is_paid && amt > 0) {
                        rawByCard[cid] = kotlin.math.round(((rawByCard[cid] ?: 0.0) + amt) * 100.0) / 100.0
                        friendTotalUnpaidSpend += amt
                    }
                }
            }
            // Accumulate cash payments received from this friend
            val paid = friendPayments.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }

            // Track cash payments explicitly linked to specific transactions.
            val paymentsByCard = mutableMapOf<String, Double>()
            friendPayments.filter { it.transaction_id != null }.forEach { p ->
                val txn = txnById[p.transaction_id]
                // CRITICAL: Prevent double-dipping by only subtracting the payment if the linked transaction is NOT marked paid.
                // If it is marked paid, it's already dropped from 'rawByCard', so subtracting the payment again would wipe out other debt.
                if (txn != null && !txn.is_paid) {
                    val cid = txn.card_id
                    paymentsByCard[cid] = (paymentsByCard[cid] ?: 0.0) + (p.amount.toDoubleOrNull() ?: 0.0)
                }
            }

            // Track card payments made to the bank on this friend's behalf. These reduce the
            // friend's overall debt, and globally reduce "Collected (Not Settled)" because the
            // cash in hand was spent paying the bank.
            val cardPaymentsByCard = mutableMapOf<String, Double>()
            friendTxns.filter { it.type == "bill_payment" }.forEach { cp ->
                val amt = cp.amount.toDoubleOrNull() ?: 0.0
                expenses -= amt
                friendTotalCardPayments += amt

                val linkedId = cp.linked_transaction_id
                if (linkedId != null) {
                    val txn = txnById[linkedId]
                    // CRITICAL: Same double-dip guard as above. If the linked transaction is already
                    // marked paid it is gone from 'rawByCard', so don't subtract this card payment again.
                    if (txn != null && !txn.is_paid) {
                        cardPaymentsByCard[cp.card_id] = (cardPaymentsByCard[cp.card_id] ?: 0.0) + amt
                    }
                } else {
                    // Unlinked card payments reduce per-card debt directly.
                    cardPaymentsByCard[cp.card_id] = (cardPaymentsByCard[cp.card_id] ?: 0.0) + amt
                }
            }

            friendTotalSpend += expenses
            friendTotalPaid += paid
            // Global remaining debt: Gross Expenses (less Card Payments) minus Cash Payments
            val remainingToPay = maxOf(0.0, expenses - paid)

            // Per-card debt breakdown for this friend.
            val byCard = mutableMapOf<String, Double>()
            val baseCards = rawByCard // Starts as Unpaid Spend (is_paid = false)
            baseCards.forEach { (cid, amt) ->
                val cpAmt = cardPaymentsByCard[cid] ?: 0.0
                val pAmt = paymentsByCard[cid] ?: 0.0
                // Final 'To Collect' debt for this card is Unpaid Spend - Linked Card Payments - Linked Cash Payments
                val adjusted = amt - cpAmt - pAmt
                if (adjusted <= 0.0) {
                    byCard[cid] = 0.0
                    // If negative (refunds/payments exceeded spend), reduce the global toCollectByCard for this card
                    if (adjusted < 0.0 && toCollectByCard.containsKey(cid)) {
                        toCollectByCard[cid] = maxOf(0.0, kotlin.math.round(((toCollectByCard[cid] ?: 0.0) + adjusted) * 100.0) / 100.0)
                    }
                } else {
                    val rounded = kotlin.math.round(adjusted * 100.0) / 100.0
                    byCard[cid] = rounded
                    toCollectByCard[cid] = kotlin.math.round(((toCollectByCard[cid] ?: 0.0) + rounded) * 100.0) / 100.0
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

        // Single pass instead of two full filter+sum traversals.
        var monthlySpend = 0.0
        var prevMonthSpend = 0.0
        spendTxns.forEach { t ->
            val amt = t.amount.toDoubleOrNull() ?: 0.0
            if (t.txn_date >= cutoff30) monthlySpend += amt
            else if (t.txn_date >= cutoff60) prevMonthSpend += amt
        }

        // txn_date is ISO yyyy-MM-dd, so grouping by the raw string is both correct and much
        // cheaper than seven full scans (one per day) of the transaction list.
        val spendAmountByDate = spendTxns
            .groupingBy { it.txn_date }
            .fold(0.0) { acc, t -> acc + (t.amount.toDoubleOrNull() ?: 0.0) }

        val dayNames = listOf("Su", "Mo", "Tu", "We", "Th", "Fr", "Sa")
        val dailySpend = (6 downTo 0).map { offset ->
            val date = todayDate.minusDays(offset.toLong())
            val dateStr = date.toString()
            DailySpend(
                date = dateStr,
                dayLabel = dayNames[date.dayOfWeek.value % 7],
                amount = spendAmountByDate[dateStr] ?: 0.0,
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

        val spendTxnsByMerchant = spendTxns.groupBy { it.merchant }

        val recurringMerchants = mutableListOf<RecurringBill>()
        spendTxnsByMerchant.forEach { (merchant, merchantTxns) ->
            if (merchantTxns.size >= 2) {
                val sorted = merchantTxns.sortedByDescending { it.txn_date }
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

        // Attribute each recurring bill to the card its most recent transaction landed on, once
        // for all cards. Doing this inside the per-card loop below meant a full transaction scan
        // for every (card, recurring merchant) pair.
        val recurringByCardId = recurringMerchants.groupBy { rb ->
            spendTxnsByMerchant[rb.merchant]?.maxByOrNull { it.txn_date }?.card_id
        }
        val spendTxnsByCardId = spendTxns.groupBy { it.card_id }
        val todayStr = todayDate.toString()

        val projections = cards.map { card ->
            var start = todayDate.withDayOfMonth(card.billing_cycle_day.coerceIn(1, 28))
            if (start.isAfter(todayDate)) {
                start = start.minusMonths(1)
            }
            val end = start.plusMonths(1).minusDays(1)
            // Compare ISO yyyy-MM-dd strings rather than re-parsing every date into a LocalDate
            // per card. Lexicographic order matches chronological order for this format, and it
            // is what the server does (summary.ts).
            val startStr = start.toString()
            val endStr = end.toString()

            // Only unpaid spend counts as unbilled — matches summary.ts, which filters is_paid
            // here. Omitting it inflated the offline projection by everything already settled.
            val currentUnbilled = spendTxnsByCardId[card.id].orEmpty()
                .filter { !it.is_paid && it.txn_date >= startStr && it.txn_date <= endStr }
                .sumOf { it.amount.toDoubleOrNull() ?: 0.0 }

            val upcoming = recurringByCardId[card.id].orEmpty().filter { rb ->
                rb.expectedDate >= startStr && rb.expectedDate <= endStr && rb.expectedDate >= todayStr
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
            friendAdvanceInHand = let {
                // Calculate "Advance In Hand" / "Collected (Not Settled)"
                // This represents physical cash that has been collected but has NOT YET been used to either:
                // 1. Settle transactions (Paid Spend)
                // 2. Pay the bank (Card Payments)
                // paidSpend = Total Gross Spend minus Total Unpaid Spend. (i.e. transactions marked as 'is_paid = true').
                // Note this uses friendTotalGrossSpend, not friendTotalSpend — the latter is already
                // reduced by card payments, which would subtract them twice here.
                val paidSpend = friendTotalGrossSpend - friendTotalUnpaidSpend
                // Advance = (Total Cash Received) - (Cash used to settle txns) - (Cash used to pay the bank directly).
                maxOf(0.0, friendTotalPaid - paidSpend - friendTotalCardPayments)
            },
            payments = payments,
            friendDebts = friendDebts,
        )
        
        com.imvj.cardledger.notif.ReminderScheduler.reschedule(
            c.appContext, cards, c.prefsStore.reminderDays(), c.prefsStore.remindersEnabled()
        )
    }
}

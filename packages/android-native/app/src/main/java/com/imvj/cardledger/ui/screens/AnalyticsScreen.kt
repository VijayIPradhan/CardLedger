package com.imvj.cardledger.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.imvj.cardledger.data.net.CardDto
import com.imvj.cardledger.data.net.HolderDto
import com.imvj.cardledger.feature.HomeUiState
import com.imvj.cardledger.feature.HomeViewModel
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.components.*
import com.imvj.cardledger.ui.nav.BottomBar
import com.imvj.cardledger.ui.theme.*
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.abs

// Desaturated dark-mode chart palette
private val chartColors = listOf(
    Color(0xFF64B5F6), // blue
    Color(0xFFA5D6A7), // green
    Color(0xFFFFCC80), // amber
    Color(0xFFEF9A9A), // red
    Color(0xFFCE93D8), // purple
    Color(0xFF80DEEA), // cyan
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnalyticsScreen(nav: NavHostController, vm: HomeViewModel) {
    val c = app().container
    LifecycleResumeEffect(Unit) {
        vm.load()
        onPauseOrDispose { }
    }
    val s by vm.state.collectAsStateWithLifecycle()
    val reviewQueue by c.reviewStore.queue.collectAsStateWithLifecycle()
    
    var selectedTab by remember { mutableStateOf(0) }
    val tabs = listOf("🛡️ 30% Shield", "⚡ Recommender", "👑 Rewards & Yield", "🤝 Recovery", "📊 Insights")

    Scaffold(
        bottomBar = { BottomBar(nav, reviewQueue.size) },
        containerColor = Base,
    ) { innerPadding ->
        PullToRefreshBox(
            isRefreshing = s.isRefreshing,
            onRefresh = { vm.load(forceRefresh = true) },
            modifier = Modifier.fillMaxSize().padding(innerPadding),
        ) {
            Column(Modifier.fillMaxSize()) {
                // Header & Sub-nav
                Column(
                    Modifier
                        .fillMaxWidth()
                        .background(Base)
                        .padding(top = 16.dp, bottom = 8.dp)
                ) {
                    Text(
                        "Financial Intelligence",
                        style = MaterialTheme.typography.headlineMedium,
                        color = OnDark,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 20.dp)
                    )
                    Text(
                        "State-of-the-art credit optimization & cashflow analytics",
                        style = MaterialTheme.typography.bodySmall,
                        color = Muted,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 2.dp)
                    )
                    Spacer(Modifier.height(12.dp))
                    
                    // Horizontal Tab Bar
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            .padding(horizontal = 20.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        tabs.forEachIndexed { i, title ->
                            val active = selectedTab == i
                            Surface(
                                modifier = Modifier.clickable { selectedTab = i },
                                shape = RoundedCornerShape(20.dp),
                                color = if (active) Gold else Surface1,
                                border = androidx.compose.foundation.BorderStroke(
                                    1.dp,
                                    if (active) Gold else Elevated
                                )
                            ) {
                                Text(
                                    title,
                                    color = if (active) Base else OnDark,
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
                                )
                            }
                        }
                    }
                }

                if (s.cards.isEmpty() && !s.loading) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No cards available to analyze.", color = Muted)
                    }
                    return@PullToRefreshBox
                }

                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(top = 8.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    when (selectedTab) {
                        0 -> shieldTabContent(s)
                        1 -> recommenderTabContent(s)
                        2 -> rewardsTabContent(s)
                        3 -> recoveryTabContent(s)
                        4 -> insightsTabContent(s)
                    }
                }
            }
        }
    }
}

// ── TAB 0: 🛡️ 30% SHIELD & CREDIT HEALTH ─────────────────────────────────
private fun androidx.compose.foundation.lazy.LazyListScope.shieldTabContent(s: HomeUiState) {
    item {
        val totalSpend = s.total.spend
        val totalLimit = s.total.limit
        val overallPct = if (totalLimit > 0) ((totalSpend / totalLimit) * 100).toInt() else 0
        val isSafe = overallPct < 30
        val isCaution = overallPct in 30..50

        // Overall Shield Banner
        Surface(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            shape = RoundedCornerShape(16.dp),
            color = Surface1,
            border = androidx.compose.foundation.BorderStroke(
                1.5.dp,
                when {
                    isSafe -> Success
                    isCaution -> Warning
                    else -> Danger
                }
            )
        ) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("🛡️", fontSize = 20.sp)
                        Text("CREDIT UTILIZATION SHIELD", color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp, fontWeight = FontWeight.Bold)
                    }
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = when {
                            isSafe -> SuccessSubtle
                            isCaution -> Warning.copy(alpha = 0.15f)
                            else -> DangerSubtle
                        }
                    ) {
                        Text(
                            when {
                                isSafe -> "✨ EXCELLENT (<30%)"
                                isCaution -> "⚠️ CAUTION (30-50%)"
                                else -> "🚨 HIGH (>50%)"
                            },
                            color = when {
                                isSafe -> Success
                                isCaution -> Warning
                                else -> Danger
                            },
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
                    Column {
                        Text("Overall Utilization", color = Muted, style = MaterialTheme.typography.bodySmall)
                        Text("$overallPct%", color = OnDark, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.ExtraBold)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("Total Spend vs Limit", color = Muted, style = MaterialTheme.typography.bodySmall)
                        Text("${money(totalSpend)} / ${money(totalLimit)}", color = OnDarkMid, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    }
                }

                LinearProgressIndicator(
                    progress = { (overallPct / 100f).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),
                    color = when {
                        isSafe -> Success
                        isCaution -> Warning
                        else -> Danger
                    },
                    trackColor = Elevated
                )

                Text(
                    "💡 Industry Rule: Keeping card utilization below 30% is the single most effective way to protect and boost your credit score.",
                    color = MutedLow,
                    style = MaterialTheme.typography.labelSmall,
                    lineHeight = 16.sp
                )

                Spacer(Modifier.height(10.dp))

                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Gold.copy(alpha = 0.1f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Gold.copy(alpha = 0.3f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            "🎯 Pro Tip: The Statement Date Hack (Pre-Payment)",
                            color = Gold,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            "Credit bureaus (CIBIL, Experian) only record the balance reported on your statement generation date (cycle day). If you spend heavily during the month, pay off your balance BEFORE your statement date! The pre-paid amount won't be counted in your reported utilization, keeping your credit score pristine!",
                            color = MutedLow,
                            style = MaterialTheme.typography.labelSmall,
                            lineHeight = 16.sp
                        )
                    }
                }
            }
        }
    }

    item {
        Text(
            "CARD HEADROOM CALCULATOR (30% THRESHOLD)",
            color = Muted,
            style = MaterialTheme.typography.labelSmall,
            letterSpacing = 1.sp,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)
        )
    }

    val sortedCards = s.cards.map { card ->
        val limit = card.credit_limit.toDoubleOrNull() ?: 0.0
        val spend = s.spendByCard[card.id] ?: 0.0
        val pct = if (limit > 0) ((spend / limit) * 100).toInt() else 0
        val max30 = limit * 0.30
        val headroom30 = maxOf(0.0, max30 - spend)
        val max50 = limit * 0.50
        val headroom50 = maxOf(0.0, max50 - spend)
        CardHeadroomInfo(card, spend, limit, pct, max30, headroom30, headroom50)
    }.sortedByDescending { it.pct }

    items(sortedCards) { info ->
        val barColor = when {
            info.pct < 30 -> Success
            info.pct <= 50 -> Warning
            else -> Danger
        }
        Surface(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            shape = RoundedCornerShape(12.dp),
            color = Surface1,
            border = androidx.compose.foundation.BorderStroke(1.dp, Elevated)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(info.card.nickname, color = OnDark, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = when {
                            info.pct < 30 -> SuccessSubtle
                            info.pct <= 50 -> Warning.copy(alpha = 0.15f)
                            else -> DangerSubtle
                        }
                    ) {
                        Text(
                            "${info.pct}% UTILIZED",
                            color = barColor,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        )
                    }
                }

                LinearProgressIndicator(
                    progress = { (info.pct / 100f).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                    color = barColor,
                    trackColor = Elevated
                )

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("${money(info.spend)} spent", color = Muted, style = MaterialTheme.typography.bodySmall)
                    Text("${money(info.limit)} limit", color = Muted, style = MaterialTheme.typography.bodySmall)
                }

                HorizontalDivider(color = Elevated.copy(alpha = 0.5f))

                // Headroom Advice Banner
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        when {
                            info.pct < 30 -> "⚡"
                            info.pct <= 50 -> "⚠️"
                            else -> "🚨"
                        },
                        fontSize = 16.sp
                    )
                    Text(
                        when {
                            info.pct < 30 -> "You can spend ₹${info.headroom30.toLong()} more before reaching the 30% safe threshold."
                            info.pct <= 50 -> "30% breached! You have ₹${info.headroom50.toLong()} remaining before hitting 50% utilization."
                            else -> "High utilization! Pay down ₹${(info.spend - info.max30).toLong()} to return to the 30% safe zone."
                        },
                        color = when {
                            info.pct < 30 -> Success
                            info.pct <= 50 -> Warning
                            else -> Danger
                        },
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

private data class CardHeadroomInfo(
    val card: CardDto,
    val spend: Double,
    val limit: Double,
    val pct: Int,
    val max30: Double,
    val headroom30: Double,
    val headroom50: Double
)

// ── TAB 1: ⚡ SMART RECOMMENDER & CASHFLOW ───────────────────────────────
private fun androidx.compose.foundation.lazy.LazyListScope.recommenderTabContent(s: HomeUiState) {
    item {
        Text(
            "SMART CARD RECOMMENDER (INTEREST-FREE WINDOW)",
            color = Muted,
            style = MaterialTheme.typography.labelSmall,
            letterSpacing = 1.sp,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)
        )
    }

    val cardRecommendations = s.cards.mapNotNull { card ->
        val limit = card.credit_limit.toDoubleOrNull() ?: 0.0
        val spend = s.spendByCard[card.id] ?: 0.0
        val pct = if (limit > 0) ((spend / limit) * 100).toInt() else 0
        if (pct >= 50) return@mapNotNull null // Don't recommend highly utilized cards

        val cycleDay = card.billing_cycle_day ?: 1
        val estDaysFree = calculateInterestFreeDays(cycleDay)
        val headroom30 = maxOf(0.0, (limit * 0.30) - spend)
        CardRec(card, estDaysFree, headroom30, pct)
    }.sortedByDescending { it.estDaysFree }

    if (cardRecommendations.isNotEmpty()) {
        val best = cardRecommendations.first()
        item {
            Surface(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                shape = RoundedCornerShape(16.dp),
                color = Surface1,
                border = androidx.compose.foundation.BorderStroke(1.5.dp, Gold)
            ) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("🏆", fontSize = 22.sp)
                            Text("BEST CARD FOR SPENDING TODAY", color = Gold, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp, fontWeight = FontWeight.Bold)
                        }
                        Surface(shape = RoundedCornerShape(6.dp), color = Gold) {
                            Text("~${best.estDaysFree} DAYS FREE", color = Base, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
                        }
                    }

                    Text(best.card.nickname, color = OnDark, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("30% Safe Headroom", color = Muted, style = MaterialTheme.typography.bodySmall)
                        Text(money(best.headroom30), color = Success, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                    }

                    HorizontalDivider(color = Elevated)

                    Text(
                        "💡 Why? This card's statement cycle started recently (Cycle Day ${best.card.billing_cycle_day}). Purchases made today won't be billed until next month, giving you maximum interest-free credit!",
                        color = MutedLow,
                        style = MaterialTheme.typography.labelSmall,
                        lineHeight = 16.sp
                    )
                }
            }
        }

        if (cardRecommendations.size > 1) {
            item {
                Text(
                    "OTHER RECOMMENDED CARDS",
                    color = Muted,
                    style = MaterialTheme.typography.labelSmall,
                    letterSpacing = 1.sp,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)
                )
            }
            items(cardRecommendations.drop(1)) { rec ->
                Surface(
                    Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                    shape = RoundedCornerShape(12.dp),
                    color = Surface1,
                    border = androidx.compose.foundation.BorderStroke(1.dp, Elevated)
                ) {
                    Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(rec.card.nickname, color = OnDark, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            Text("Headroom: ${money(rec.headroom30)} · Utilized: ${rec.pct}%", color = Muted, style = MaterialTheme.typography.labelSmall)
                        }
                        Surface(shape = RoundedCornerShape(6.dp), color = Elevated) {
                            Text("~${rec.estDaysFree}d free", color = Gold, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp))
                        }
                    }
                }
            }
        }
    }

    // Projections & Upcoming Bills
    if (s.projections.isNotEmpty()) {
        item {
            Spacer(Modifier.height(8.dp))
            Text(
                "PROJECTED LIABILITY & CASHFLOW",
                color = Muted,
                style = MaterialTheme.typography.labelSmall,
                letterSpacing = 1.sp,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)
            )
        }

        items(s.projections) { proj ->
            val card = s.cards.firstOrNull { it.id == proj.cardId }
            if (card != null) {
                Surface(
                    Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                    shape = RoundedCornerShape(12.dp),
                    color = Surface1,
                    border = androidx.compose.foundation.BorderStroke(1.dp, Elevated)
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text(card.nickname, color = OnDark, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                            Text("Cycle: ${proj.currentCycleStart.drop(5)} to ${proj.currentCycleEnd.drop(5)}", color = Muted, style = MaterialTheme.typography.labelSmall)
                        }

                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Current unbilled spend", color = Muted, style = MaterialTheme.typography.bodySmall)
                            Text(money(proj.currentUnbilled), color = OnDark, style = MaterialTheme.typography.bodySmall)
                        }

                        if (proj.upcomingBills.isNotEmpty()) {
                            HorizontalDivider(color = Elevated)
                            Text("Upcoming Recurring Bills", color = MutedLow, style = MaterialTheme.typography.labelSmall)
                            proj.upcomingBills.forEach { bill ->
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("↺ ${bill.merchant} (${bill.expectedDate.drop(5)})", color = Muted, style = MaterialTheme.typography.bodySmall)
                                    Text("+${money(bill.amount)}", color = Gold, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }

                        HorizontalDivider(color = Elevated)

                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text("Est. Statement Balance", color = OnDarkMid, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                            Text(money(proj.projectedTotal), color = Danger, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

private data class CardRec(
    val card: CardDto,
    val estDaysFree: Int,
    val headroom30: Double,
    val pct: Int
)

private fun calculateInterestFreeDays(cycleDay: Int): Int {
    val today = LocalDate.now()
    val currentDay = today.dayOfMonth
    val daysSinceCycle = if (currentDay >= cycleDay) {
        currentDay - cycleDay
    } else {
        val lastMonth = today.minusMonths(1)
        val cycleDateLastMonth = try {
            LocalDate.of(lastMonth.year, lastMonth.month, cycleDay.coerceAtMost(lastMonth.lengthOfMonth()))
        } catch (e: Exception) { lastMonth }
        ChronoUnit.DAYS.between(cycleDateLastMonth, today).toInt()
    }
    return (50 - daysSinceCycle).coerceIn(15, 50)
}

// ── TAB 2: 👑 REWARDS & CASHBACK YIELD MAXIMIZER ────────────────────────
private fun androidx.compose.foundation.lazy.LazyListScope.rewardsTabContent(s: HomeUiState) {
    item {
        val totalSpendVal = s.cards.sumOf { it.current_spend?.toDoubleOrNull() ?: 0.0 }
        val estAnnualYield = totalSpendVal * 12 * 0.038
        val estMonthlyYield = totalSpendVal * 0.038

        // Hero Reward Stat Card
        Surface(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            shape = RoundedCornerShape(16.dp),
            color = Surface1,
            border = androidx.compose.foundation.BorderStroke(1.5.dp, Gold)
        ) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("👑", fontSize = 20.sp)
                        Text("WALLET YIELD MAXIMIZER", color = Gold, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp, fontWeight = FontWeight.Bold)
                    }
                    Surface(shape = RoundedCornerShape(6.dp), color = Gold.copy(alpha = 0.2f)) {
                        Text("~3.8% AVG YIELD", color = Gold, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
                    }
                }

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
                    Column {
                        Text("Estimated Annual Reward Value", color = Muted, style = MaterialTheme.typography.labelSmall)
                        Text(money(estAnnualYield), color = Gold, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("Monthly Yield", color = Muted, style = MaterialTheme.typography.labelSmall)
                        Text("${money(estMonthlyYield)} / mo", color = OnDark, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                    }
                }

                HorizontalDivider(color = Elevated.copy(alpha = 0.6f))
                Text(
                    "💡 1% Rule: Matching specific spend categories to the right credit card can boost your reward yield from 1% to over 5%!",
                    color = MutedLow, style = MaterialTheme.typography.labelSmall, lineHeight = 16.sp
                )
            }
        }
    }

    item {
        Spacer(Modifier.height(8.dp))
        Text(
            "CATEGORY OPTIMIZATION ENGINE",
            color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)
        )
    }

    val categories = listOf(
        Triple("🛍️ Online Shopping", "SBI Cashback / Millennia", "5.0%"),
        Triple("✈️ Travel & Flights", "HDFC Infinia / Atlas", "10.0%"),
        Triple("🍽️ Dining & Food", "Axis Airtel / Swiggy", "10.0%"),
        Triple("💡 Utilities & Bills", "Tata Neu / Airtel Axis", "5.0%"),
        Triple("🛒 Groceries & Instamart", "Swiggy HDFC / Amazon Pay", "5.0%"),
        Triple("⛽ Fuel & Petrol", "BPCL SBI / IndianOil", "4.2%")
    )

    items(categories.chunked(2)) { pair ->
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            pair.forEach { (cat, best, yield) ->
                Surface(
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    color = Surface1,
                    border = androidx.compose.foundation.BorderStroke(1.dp, Elevated)
                ) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text(cat.take(12) + "…", color = OnDark, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Surface(shape = RoundedCornerShape(4.dp), color = Gold.copy(alpha = 0.15f)) {
                                Text(yield, color = Gold, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp))
                            }
                        }
                        Text("🥇 Best: $best", color = Gold, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            if (pair.size == 1) {
                Spacer(Modifier.weight(1f))
            }
        }
    }

    item {
        Spacer(Modifier.height(8.dp))
        Surface(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            shape = RoundedCornerShape(16.dp),
            color = Surface1,
            border = androidx.compose.foundation.BorderStroke(1.dp, Elevated)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("⚡ Debt Paydown Simulator", color = OnDark, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Surface(shape = RoundedCornerShape(4.dp), color = SuccessSubtle) {
                        Text("AVALANCHE RECOMMENDED", color = Success, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                    }
                }
                Text(
                    "When paying down card balances, use the Avalanche Method (clearing highest utilization / interest rate cards first) to save maximum interest, or Snowball for rapid momentum!",
                    color = Muted, fontSize = 12.sp, lineHeight = 16.sp
                )
                val sortedCards = s.cards.filter { (it.current_spend?.toDoubleOrNull() ?: 0.0) > 0 }
                    .sortedByDescending { 
                        val sp = it.current_spend?.toDoubleOrNull() ?: 0.0
                        val lim = it.credit_limit?.toDoubleOrNull() ?: 0.0
                        if (lim > 0) sp / lim else 0.0
                    }.take(3)
                sortedCards.forEachIndexed { idx, c ->
                    Row(Modifier.fillMaxWidth().background(Elevated.copy(alpha = 0.4f), RoundedCornerShape(8.dp)).padding(10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("#${idx + 1} Priority: ${c.nickname}", color = OnDark, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Text("${money(c.current_spend?.toDoubleOrNull() ?: 0.0)} balance", color = Gold, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

// ── TAB 3: 🤝 FRIEND DEBT RECOVERY RADAR ─────────────────────────────────
private fun androidx.compose.foundation.lazy.LazyListScope.recoveryTabContent(s: HomeUiState) {
    item {
        val totalFriendSpend = s.friendTotalSpend
        val totalCollected = s.friendTotalPaid
        val remainingToPay = s.friendRemainingToPay
        val recoveryPct = if (totalFriendSpend > 0) ((totalCollected / totalFriendSpend) * 100).toInt().coerceIn(0, 100) else 100

        Surface(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            shape = RoundedCornerShape(16.dp),
            color = Surface1,
            border = androidx.compose.foundation.BorderStroke(1.5.dp, if (remainingToPay > 0) Gold else Success)
        ) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("🤝", fontSize = 20.sp)
                        Text("DEBT RECOVERY RADAR", color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp, fontWeight = FontWeight.Bold)
                    }
                    Surface(shape = RoundedCornerShape(6.dp), color = if (recoveryPct == 100) SuccessSubtle else Warning.copy(alpha = 0.15f)) {
                        Text("$recoveryPct% RECOVERED", color = if (recoveryPct == 100) Success else Gold, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
                    }
                }

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
                    Column(Modifier.weight(1.2f)) {
                        Text("Remaining to pay", color = Muted, style = MaterialTheme.typography.bodySmall)
                        Text(money(remainingToPay), color = if (remainingToPay > 0) Gold else Success, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.ExtraBold)
                    }
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                        Text("Collected (Paid)", color = Muted, style = MaterialTheme.typography.bodySmall)
                        Text(money(totalCollected), color = Success, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    }
                }

                LinearProgressIndicator(
                    progress = { (recoveryPct / 100f).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),
                    color = if (recoveryPct == 100) Success else Gold,
                    trackColor = Elevated
                )
            }
        }
    }

    item {
        Text(
            "WHO OWES WHAT (BY FRIEND)",
            color = Muted,
            style = MaterialTheme.typography.labelSmall,
            letterSpacing = 1.sp,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)
        )
    }

    val friends = s.holders.filter { it.relationship == "friend" }
    val friendDebtList = friends.map { friend ->
        val friendTxns = s.transactions.filter { it.holder_id_at_time == friend.id }
        val totalSpent = friendTxns.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
        val hs = s.spendByHolder.firstOrNull { it.holderId == friend.id }
        val spend = hs?.spend ?: totalSpent
        val paid = s.payments.filter { it.holder_id == friend.id }.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
        val remaining = maxOf(0.0, spend - paid)
        FriendDebtSummary(friend, spend, paid, remaining)
    }.filter { it.spend > 0 || it.paid > 0 }.sortedByDescending { it.remaining }

    if (friendDebtList.isEmpty()) {
        item {
            Surface(Modifier.fillMaxWidth().padding(horizontal = 20.dp), shape = RoundedCornerShape(12.dp), color = Surface1) {
                Text("No friend transactions recorded yet.", color = Muted, modifier = Modifier.padding(16.dp))
            }
        }
    } else {
        items(friendDebtList) { item ->
            val clipboardManager = androidx.compose.ui.platform.LocalClipboardManager.current
            val context = androidx.compose.ui.platform.LocalContext.current
            Surface(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                shape = RoundedCornerShape(12.dp),
                color = Surface1,
                border = androidx.compose.foundation.BorderStroke(1.dp, Elevated)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            HolderBadge(initialsOf(item.friend.name), false)
                            Column {
                                Text(item.friend.name, color = OnDark, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                                Text("Total spend: ${money(item.spend)} · Paid: ${money(item.paid)}", color = Muted, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(money(item.remaining), color = if (item.remaining > 0) Gold else Success, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text("Remaining", color = MutedLow, style = MaterialTheme.typography.labelSmall, fontSize = 10.sp)
                        }
                    }

                    HorizontalDivider(color = Elevated.copy(alpha = 0.6f))

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Surface(shape = RoundedCornerShape(4.dp), color = Gold.copy(alpha = 0.15f)) {
                            Text("🟡 BATCH PAYMENT DUE", color = Gold, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                        }
                        androidx.compose.material3.Button(
                            onClick = {
                                val msg = "Hey ${item.friend.name}! 🌟 Here is your CardLedger batch payment summary: Total Volume: ${money(item.spend)}, Outstanding Balance: ${money(item.spend)}. Please pay when convenient! 🙏"
                                clipboardManager.setText(androidx.compose.ui.text.AnnotatedString(msg))
                                android.widget.Toast.makeText(context, "Copied WhatsApp Summary to clipboard!", android.widget.Toast.LENGTH_SHORT).show()
                            },
                            colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = SuccessSubtle, contentColor = Success),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                            modifier = Modifier.height(30.dp)
                        ) {
                            Text("💬 WhatsApp Summary", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }

    item {
        Spacer(Modifier.height(8.dp))
        Text(
            "OUTSTANDING DEBT BY CARD",
            color = Muted,
            style = MaterialTheme.typography.labelSmall,
            letterSpacing = 1.sp,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)
        )
    }

    val cardsWithDebt = s.cards.mapNotNull { card ->
        val toCollect = s.toCollectByCard[card.id] ?: 0.0
        if (toCollect <= 0) null else card to toCollect
    }.sortedByDescending { it.second }

    if (cardsWithDebt.isEmpty()) {
        item {
            Surface(Modifier.fillMaxWidth().padding(horizontal = 20.dp), shape = RoundedCornerShape(12.dp), color = Surface1) {
                Text("All cards are fully collected or have zero friend debt! 🎉", color = Success, modifier = Modifier.padding(16.dp), fontWeight = FontWeight.Medium)
            }
        }
    } else {
        items(cardsWithDebt) { (card, amt) ->
            Surface(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                shape = RoundedCornerShape(12.dp),
                color = Surface1,
                border = androidx.compose.foundation.BorderStroke(1.dp, Gold.copy(alpha = 0.4f))
            ) {
                Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(card.nickname, color = OnDark, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text("${card.bank} · ${card.network}", color = Muted, style = MaterialTheme.typography.labelSmall)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(money(amt), color = Gold, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text("To Collect", color = MutedLow, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}

private data class FriendDebtSummary(val friend: HolderDto, val spend: Double, val paid: Double, val remaining: Double)

// ── TAB 3: 📊 SPEND VELOCITY & REWARDS INSIGHTS ──────────────────────────
private fun androidx.compose.foundation.lazy.LazyListScope.insightsTabContent(s: HomeUiState) {
    item {
        val projectedMonthEnd = s.avgDailySpend * 30
        Surface(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            shape = RoundedCornerShape(16.dp),
            color = Surface1,
            border = androidx.compose.foundation.BorderStroke(1.dp, Elevated)
        ) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text("30-DAY SPEND VELOCITY", color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp)
                        Text(money(s.monthlySpend), color = OnDark, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                    }
                    if (s.prevMonthSpend > 0) {
                        val rawChange = (s.monthlySpend - s.prevMonthSpend) / s.prevMonthSpend * 100
                        val isUp = rawChange >= 0
                        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("vs prior 30d", color = Muted, style = MaterialTheme.typography.labelSmall)
                            Surface(shape = RoundedCornerShape(6.dp), color = if (isUp) DangerSubtle else SuccessSubtle) {
                                Text(
                                    "${if (isUp) "↑" else "↓"} ${abs(rawChange.toInt())}%",
                                    color = if (isUp) Danger else Success,
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }
                    }
                }

                HorizontalDivider(color = Elevated)

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text("Daily Burn Rate", color = Muted, style = MaterialTheme.typography.labelSmall)
                        Text(money(s.avgDailySpend), color = OnDarkMid, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("Projected 30-Day Spend", color = Muted, style = MaterialTheme.typography.labelSmall)
                        Text(money(projectedMonthEnd), color = Gold, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }

    // 7-Day Spend Chart
    if (s.dailySpend.isNotEmpty()) {
        item {
            Surface(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                shape = RoundedCornerShape(16.dp),
                color = Surface1,
                border = androidx.compose.foundation.BorderStroke(1.dp, Elevated)
            ) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("LAST 7 DAYS VELOCITY", color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp)
                    val maxAmt = (s.dailySpend.maxOfOrNull { it.amount } ?: 1.0).coerceAtLeast(1.0)
                    Row(
                        Modifier.fillMaxWidth().height(80.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.Bottom
                    ) {
                        s.dailySpend.forEach { day ->
                            val frac = (day.amount / maxAmt).toFloat().coerceIn(0.05f, 1f)
                            Column(
                                Modifier.weight(1f).fillMaxHeight(),
                                verticalArrangement = Arrangement.Bottom,
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Box(
                                    Modifier
                                        .fillMaxWidth()
                                        .fillMaxHeight(frac)
                                        .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp))
                                        .background(if (day.isToday) Gold else Elevated)
                                )
                            }
                        }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        s.dailySpend.forEach { day ->
                            Text(
                                day.dayLabel,
                                Modifier.weight(1f),
                                color = if (day.isToday) Gold else Muted,
                                style = MaterialTheme.typography.labelSmall,
                                textAlign = TextAlign.Center,
                                fontWeight = if (day.isToday) FontWeight.Bold else FontWeight.Normal
                            )
                        }
                    }
                }
            }
        }
    }

    // Spend by Network
    if (s.spendByNetwork.size > 1) {
        item {
            Surface(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                shape = RoundedCornerShape(16.dp),
                color = Surface1,
                border = androidx.compose.foundation.BorderStroke(1.dp, Elevated)
            ) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text("SPEND BY NETWORK", color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp)
                    val networkEntries = s.spendByNetwork.entries.sortedByDescending { it.value }
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(20.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val netSlices = networkEntries.mapIndexed { i, (net, amt) ->
                            DonutSlice(net, amt.toFloat(), chartColors[i % chartColors.size])
                        }
                        DonutChart(slices = netSlices, modifier = Modifier.size(100.dp), strokeWidth = 20f)
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
                            networkEntries.forEachIndexed { i, (net, amt) ->
                                Row(
                                    Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Box(Modifier.size(8.dp).clip(CircleShape).background(chartColors[i % chartColors.size]))
                                        Text(net, color = OnDark, style = MaterialTheme.typography.bodySmall)
                                    }
                                    Text(money(amt), color = OnDarkMid, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Top Merchants
    if (s.topMerchants.isNotEmpty()) {
        item {
            Surface(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                shape = RoundedCornerShape(16.dp),
                color = Surface1,
                border = androidx.compose.foundation.BorderStroke(1.dp, Elevated)
            ) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("TOP MERCHANTS (VOLUME)", color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp)
                    val maxAmt = (s.topMerchants.firstOrNull()?.amount ?: 1.0).coerceAtLeast(1.0)
                    s.topMerchants.forEach { m ->
                        Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(m.merchant, color = OnDark, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(money(m.amount), color = Muted, style = MaterialTheme.typography.labelSmall)
                            }
                            Box(Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(2.5.dp)).background(Elevated)) {
                                Box(
                                    Modifier
                                        .fillMaxWidth((m.amount / maxAmt).toFloat().coerceIn(0f, 1f))
                                        .height(5.dp)
                                        .background(Gold)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

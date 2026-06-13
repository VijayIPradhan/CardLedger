package com.imvj.cardledger.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.navigation.NavHostController
import com.imvj.cardledger.feature.HomeViewModel
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.components.*
import com.imvj.cardledger.ui.nav.BottomBar
import com.imvj.cardledger.ui.theme.*

// Desaturated dark-mode chart palette (per research: avoid neon on dark backgrounds)
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

    Scaffold(
        bottomBar = { BottomBar(nav, reviewQueue.size) },
        containerColor = Base,
    ) { innerPadding ->
        PullToRefreshBox(
            isRefreshing = s.isRefreshing,
            onRefresh = { vm.load(forceRefresh = true) },
            modifier = Modifier.fillMaxSize().padding(innerPadding),
        ) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 16.dp, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    Text(
                        "Analytics",
                        style = MaterialTheme.typography.headlineMedium,
                        color = OnDark,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                    )
                }

                if (s.cards.isEmpty() && !s.loading) {
                    item {
                        Text(
                            "No cards available to analyze.",
                            color = Muted,
                            modifier = Modifier.padding(horizontal = 20.dp),
                        )
                    }
                    return@LazyColumn
                }

                // ── Cashflow Projections ─────────────────────────────────
                if (s.projections.isNotEmpty()) {
                    item {
                        Text(
                            "PROJECTED LIABILITY",
                            color = Muted,
                            style = MaterialTheme.typography.labelSmall,
                            letterSpacing = 1.sp,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                        )
                    }

                    items(s.projections) { proj ->
                        val card = s.cards.firstOrNull { it.id == proj.cardId }
                        if (card != null) {
                            Surface(
                                Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                                shape = MaterialTheme.shapes.medium,
                                color = Surface1,
                                border = androidx.compose.foundation.BorderStroke(1.dp, Elevated),
                            ) {
                                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                        Text(card.nickname, color = OnDark, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                                        Surface(color = Surface1, shape = RoundedCornerShape(4.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Muted.copy(alpha=0.3f))) {
                                            Text(
                                                "Cycle: ${proj.currentCycleStart.drop(5)} to ${proj.currentCycleEnd.drop(5)}",
                                                color = Muted, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal=6.dp, vertical=2.dp)
                                            )
                                        }
                                    }

                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text("Current unbilled", color = Muted, style = MaterialTheme.typography.bodySmall)
                                        Text(money(proj.currentUnbilled), color = OnDark, style = MaterialTheme.typography.bodySmall)
                                    }

                                    if (proj.upcomingBills.isNotEmpty()) {
                                        HorizontalDivider(color = Elevated)
                                        Text("Upcoming Bills (Projected)", color = MutedLow, style = MaterialTheme.typography.labelSmall)
                                        proj.upcomingBills.forEach { bill ->
                                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                                    Text("↺", color = Gold, fontSize = 12.sp)
                                                    Text("${bill.merchant} (${bill.expectedDate.drop(5)})", color = Muted, style = MaterialTheme.typography.bodySmall)
                                                }
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

                // ── 30-day spend trend ───────────────────────────────────
                item {
                    Surface(
                        Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                        shape = MaterialTheme.shapes.medium,
                        color = Surface1,
                        border = androidx.compose.foundation.BorderStroke(1.dp, Elevated),
                    ) {
                        Row(
                            Modifier.padding(20.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text("30-DAY SPEND", color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp)
                                Text(money(s.monthlySpend), color = OnDark, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                            }
                            if (s.prevMonthSpend > 0) {
                                val rawChange = (s.monthlySpend - s.prevMonthSpend) / s.prevMonthSpend * 100
                                val isUp = rawChange >= 0
                                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text("vs prior 30d", color = Muted, style = MaterialTheme.typography.labelSmall)
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = if (isUp) DangerSubtle else SuccessSubtle,
                                    ) {
                                        Text(
                                            "${if (isUp) "↑" else "↓"} ${Math.abs(rawChange.toInt())}%",
                                            color = if (isUp) Danger else Success,
                                            style = MaterialTheme.typography.labelMedium,
                                            fontWeight = FontWeight.SemiBold,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // ── Unpaid + Avg daily ───────────────────────────────────
                item {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Surface(
                            Modifier.weight(1f),
                            shape = MaterialTheme.shapes.medium,
                            color = if (s.unpaidAmount > 0) DangerSubtle else Surface1,
                            border = androidx.compose.foundation.BorderStroke(1.dp, if (s.unpaidAmount > 0) Danger.copy(alpha = 0.3f) else Elevated),
                        ) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text("UNPAID", color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp)
                                Text(money(s.unpaidAmount), color = if (s.unpaidAmount > 0) Danger else OnDarkMid, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                                Text("${s.unpaidCount} txn${if (s.unpaidCount != 1) "s" else ""}", color = MutedLow, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                        Surface(
                            Modifier.weight(1f),
                            shape = MaterialTheme.shapes.medium,
                            color = Surface1,
                            border = androidx.compose.foundation.BorderStroke(1.dp, Elevated),
                        ) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text("AVG / DAY", color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp)
                                Text(money(s.avgDailySpend), color = OnDark, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                                Text("30-day avg", color = MutedLow, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }

                // ── 7-day bar chart ──────────────────────────────────────
                if (s.dailySpend.isNotEmpty()) {
                    item {
                        Surface(
                            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                            shape = MaterialTheme.shapes.medium,
                            color = Surface1,
                            border = androidx.compose.foundation.BorderStroke(1.dp, Elevated),
                        ) {
                            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("LAST 7 DAYS", color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp)
                                val maxAmt = (s.dailySpend.maxOfOrNull { it.amount } ?: 1.0).coerceAtLeast(1.0)
                                Row(
                                    Modifier.fillMaxWidth().height(72.dp),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.Bottom,
                                ) {
                                    s.dailySpend.forEach { day ->
                                        val frac = (day.amount / maxAmt).toFloat().coerceIn(0.04f, 1f)
                                        Column(
                                            Modifier.weight(1f).fillMaxHeight(),
                                            verticalArrangement = Arrangement.Bottom,
                                            horizontalAlignment = Alignment.CenterHorizontally,
                                        ) {
                                            Box(
                                                Modifier
                                                    .fillMaxWidth()
                                                    .fillMaxHeight(frac)
                                                    .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp))
                                                    .background(if (day.isToday) Gold else Elevated),
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
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // ── Spend by holder (donut) ──────────────────────────────
                if (s.spendByHolder.size > 1) {
                    item {
                        Surface(
                            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                            shape = MaterialTheme.shapes.medium,
                            color = Surface1,
                            border = androidx.compose.foundation.BorderStroke(1.dp, Elevated),
                        ) {
                            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                                Text("SPEND BY HOLDER", color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp)
                                Row(
                                    Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(20.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    val slices = s.spendByHolder.mapIndexed { i, hs ->
                                        DonutSlice(hs.name, hs.spend.toFloat(), chartColors[i % chartColors.size])
                                    }
                                    DonutChart(slices = slices, modifier = Modifier.size(100.dp), strokeWidth = 20f)
                                    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
                                        s.spendByHolder.forEachIndexed { i, hs ->
                                            Row(
                                                Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically,
                                            ) {
                                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                                    Box(Modifier.size(8.dp).clip(CircleShape).background(chartColors[i % chartColors.size]))
                                                    Text(hs.name, color = OnDark, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                                }
                                                Text(money(hs.spend), color = OnDarkMid, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else if (s.spendByHolder.size == 1) {
                    // Single holder: just show a row, no donut needed
                    item {
                        Surface(
                            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                            shape = MaterialTheme.shapes.medium,
                            color = Surface1,
                            border = androidx.compose.foundation.BorderStroke(1.dp, Elevated),
                        ) {
                            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("SPEND BY HOLDER", color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp)
                                val hs = s.spendByHolder.first()
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                        HolderBadge(initialsOf(hs.name), hs.isMe)
                                        Text(hs.name, color = OnDark, style = MaterialTheme.typography.bodyMedium)
                                    }
                                    Text(money(hs.spend), color = if (hs.isMe) OnDark else Gold, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                    }
                }

                // ── Spend by network (donut) ─────────────────────────────
                if (s.spendByNetwork.size > 1) {
                    item {
                        Surface(
                            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                            shape = MaterialTheme.shapes.medium,
                            color = Surface1,
                            border = androidx.compose.foundation.BorderStroke(1.dp, Elevated),
                        ) {
                            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                                Text("SPEND BY NETWORK", color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp)
                                val networkEntries = s.spendByNetwork.entries.sortedByDescending { it.value }
                                Row(
                                    Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(20.dp),
                                    verticalAlignment = Alignment.CenterVertically,
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
                                                verticalAlignment = Alignment.CenterVertically,
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

                // ── Top merchants ────────────────────────────────────────
                if (s.topMerchants.isNotEmpty()) {
                    item {
                        Surface(
                            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                            shape = MaterialTheme.shapes.medium,
                            color = Surface1,
                            border = androidx.compose.foundation.BorderStroke(1.dp, Elevated),
                        ) {
                            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text("TOP MERCHANTS", color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp)
                                val maxAmt = (s.topMerchants.firstOrNull()?.amount ?: 1.0).coerceAtLeast(1.0)
                                s.topMerchants.forEach { m ->
                                    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                            Text(m.merchant, color = OnDark, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                            Text(money(m.amount), color = Muted, style = MaterialTheme.typography.labelSmall)
                                        }
                                        Box(
                                            Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(Elevated),
                                        ) {
                                            Box(
                                                Modifier
                                                    .fillMaxWidth((m.amount / maxAmt).toFloat().coerceIn(0f, 1f))
                                                    .height(4.dp)
                                                    .background(Gold),
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // ── Card utilization list ────────────────────────────────
                item {
                    Text(
                        "CARD UTILIZATION",
                        color = Muted,
                        style = MaterialTheme.typography.labelSmall,
                        letterSpacing = 1.sp,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                    )
                }

                val analyticsData = s.cards.map { card ->
                    val limit = card.credit_limit.toDoubleOrNull() ?: 0.0
                    val spend = s.spendByCard[card.id] ?: 0.0
                    val pct = if (limit > 0) ((spend / limit) * 100).toInt() else 0
                    Triple(card, spend, pct)
                }.sortedByDescending { it.third }

                items(analyticsData) { (card, spend, pct) ->
                    val barColor = when {
                        pct < 30 -> Success
                        pct <= 50 -> Warning
                        else -> Danger
                    }
                    Surface(
                        Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                        shape = MaterialTheme.shapes.small,
                        color = Surface1,
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(card.nickname, color = OnDark, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = when {
                                        pct < 30 -> SuccessSubtle
                                        pct <= 50 -> Warning.copy(alpha = 0.15f)
                                        else -> DangerSubtle
                                    },
                                ) {
                                    Text(
                                        "$pct%",
                                        color = barColor,
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                    )
                                }
                            }
                            Spacer(Modifier.height(8.dp))
                            LinearProgressIndicator(
                                progress = { (pct / 100f).coerceIn(0f, 1f) },
                                modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                                color = barColor,
                                trackColor = Elevated,
                            )
                            Spacer(Modifier.height(6.dp))
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("${money(spend)} spent", color = Muted, style = MaterialTheme.typography.labelSmall)
                                Text("${money(card.credit_limit.toDoubleOrNull() ?: 0.0)} limit", color = Muted, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            }
        }
    }
}

package com.imvj.cardledger.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.lifecycle.compose.LifecycleResumeEffect

import com.imvj.cardledger.domain.cardUtilization
import com.imvj.cardledger.feature.HomeViewModel
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.components.*
import com.imvj.cardledger.ui.nav.BottomBar
import com.imvj.cardledger.ui.nav.Routes
import com.imvj.cardledger.ui.theme.*

private const val RECENT_TRANSACTIONS_COUNT = 5

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(nav: NavHostController, vm: HomeViewModel) {
    val c = app().container
    LifecycleResumeEffect(Unit) {
        vm.load()
        onPauseOrDispose { }
    }
    val s by vm.state.collectAsStateWithLifecycle()

    val reviewQueue by c.reviewStore.queue.collectAsStateWithLifecycle()
    val reviewCount = reviewQueue.size

    var showAddTxn by remember { mutableStateOf(false) }

    Scaffold(
        bottomBar = { BottomBar(nav, reviewCount) },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddTxn = true },
                containerColor = Gold,
                shape = CircleShape,
            ) {
                Text("+", fontSize = 26.sp, color = Base, fontWeight = FontWeight.Bold)
            }
        },
        containerColor = Base,
    ) { innerPadding ->
        AnimatedContent(
            targetState = s.loading && s.cards.isEmpty(),
            label = "homeContentSwitch",
            transitionSpec = { fadeIn() togetherWith fadeOut() },
        ) { isInitialLoading ->
            if (isInitialLoading) {
                Box(Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Gold)
                }
            } else if (s.cards.isEmpty()) {
                Box(
                    Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.padding(32.dp),
                    ) {
                        Text("No cards yet", color = Muted, style = MaterialTheme.typography.titleMedium)
                        Text(
                            "Add your first credit card to start tracking spend and billing cycles.",
                            color = MutedLow,
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(8.dp))
                        Button(
                            onClick = { nav.navigate(Routes.ADD_CARD) },
                            colors = ButtonDefaults.buttonColors(containerColor = Gold, contentColor = Base),
                            shape = MaterialTheme.shapes.medium,
                        ) {
                            Text("Add card", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            } else {
                PullToRefreshBox(
                    isRefreshing = s.isRefreshing,
                    onRefresh = { vm.load(forceRefresh = true) },
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                ) {
                    LazyColumn(
                        Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = 96.dp),
                    ) {
                        // ── Top bar ──────────────────────────────────────────
                        item {
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 20.dp, vertical = 16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    "CardLedger",
                                    style = MaterialTheme.typography.headlineMedium,
                                    color = OnDark,
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    IconButton(onClick = { nav.navigate(Routes.SEARCH) }) {
                                        Icon(Icons.Filled.Search, contentDescription = "Search", tint = Muted)
                                    }
                                    IconButton(onClick = { nav.navigate(Routes.HOLDERS) }) {
                                        Icon(Icons.Filled.People, contentDescription = "Holders", tint = Muted)
                                    }
                                    IconButton(onClick = { nav.navigate(Routes.SETTINGS) }) {
                                        Icon(Icons.Filled.Settings, contentDescription = "Settings", tint = Muted)
                                    }
                                }
                            }
                        }

                        // ── Hero: total outstanding ───────────────────────────
                        item {
                            Surface(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 20.dp),
                                shape = MaterialTheme.shapes.large,
                                color = Elevated,
                            ) {
                                Column(
                                    Modifier.padding(horizontal = 24.dp, vertical = 20.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Text(
                                        "TOTAL OUTSTANDING",
                                        color = Muted,
                                        style = MaterialTheme.typography.labelSmall,
                                        letterSpacing = 1.2.sp,
                                    )
                                    Text(
                                        money(s.total.spend),
                                        color = OnDark,
                                        style = MaterialTheme.typography.headlineLarge,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Row(
                                        Modifier.fillMaxWidth().padding(top = 8.dp),
                                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                                    ) {
                                        // Utilization
                                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text("Utilization", color = Muted, style = MaterialTheme.typography.labelSmall)
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                SpendRing(s.total.spend, s.total.limit, 28, showText = false)
                                                Text(
                                                    "${s.total.percent}%",
                                                    color = when {
                                                        s.total.percent < 30 -> Success
                                                        s.total.percent <= 50 -> Warning
                                                        else -> Danger
                                                    },
                                                    style = MaterialTheme.typography.titleSmall,
                                                    fontWeight = FontWeight.Bold,
                                                )
                                            }
                                        }
                                        // Limit
                                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text("Credit limit", color = Muted, style = MaterialTheme.typography.labelSmall)
                                            Text(
                                                money(s.total.limit),
                                                color = OnDarkMid,
                                                style = MaterialTheme.typography.titleSmall,
                                                fontWeight = FontWeight.Medium,
                                            )
                                        }
                                        // Next due
                                        val nextDue = s.dues.firstOrNull()
                                        if (nextDue != null) {
                                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                                Text("Next due", color = Muted, style = MaterialTheme.typography.labelSmall)
                                                Text(
                                                    "in ${nextDue.daysUntil}d",
                                                    color = if (nextDue.daysUntil <= 3) Danger else Warning,
                                                    style = MaterialTheme.typography.titleSmall,
                                                    fontWeight = FontWeight.SemiBold,
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // ── Quick stats row ──────────────────────────────────
                        item {
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 20.dp)
                                    .padding(top = 12.dp),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                // To collect from friends
                                Surface(
                                    Modifier.weight(1f),
                                    shape = MaterialTheme.shapes.medium,
                                    color = if (s.totalToCollect > 0) GoldSubtle else Surface1,
                                    border = androidx.compose.foundation.BorderStroke(1.dp, if (s.totalToCollect > 0) Gold.copy(alpha = 0.3f) else Elevated),
                                ) {
                                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                        Text("TO COLLECT", color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 0.8.sp)
                                        Text(
                                            money(s.totalToCollect),
                                            color = if (s.totalToCollect > 0) Gold else OnDarkMid,
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold,
                                        )
                                        Text("From friends", color = MutedLow, style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                                // Unpaid this month
                                Surface(
                                    Modifier.weight(1f),
                                    shape = MaterialTheme.shapes.medium,
                                    color = if (s.unpaidAmount > 0) DangerSubtle else Surface1,
                                    border = androidx.compose.foundation.BorderStroke(1.dp, if (s.unpaidAmount > 0) Danger.copy(alpha = 0.3f) else Elevated),
                                ) {
                                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                        Text("UNPAID", color = Muted, style = MaterialTheme.typography.labelSmall, letterSpacing = 0.8.sp)
                                        Text(
                                            money(s.unpaidAmount),
                                            color = if (s.unpaidAmount > 0) Danger else OnDarkMid,
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold,
                                        )
                                        Text("${s.unpaidCount} transactions", color = MutedLow, style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                            }
                        }

                        // ── Card Pager ───────────────────────────────────────
                        item {
                            val sortedByLimit = s.cards.sortedByDescending { it.credit_limit.toDoubleOrNull() ?: 0.0 }
                            val sortedCards = s.cards.sortedByDescending { s.spendByCard[it.id] ?: 0.0 }

                            Column(Modifier.fillMaxWidth().padding(top = 20.dp)) {
                                Text(
                                    "My Cards  ${s.cards.size}",
                                    color = Muted,
                                    style = MaterialTheme.typography.labelMedium,
                                    modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 10.dp),
                                )

                                val pagerState = rememberPagerState(pageCount = { sortedCards.size })
                                HorizontalPager(
                                    state = pagerState,
                                    modifier = Modifier.fillMaxWidth(),
                                    contentPadding = PaddingValues(horizontal = 20.dp),
                                    pageSpacing = 14.dp,
                                ) { page ->
                                    val card = sortedCards[page]
                                    val limitRank = sortedByLimit.indexOf(card) + 1
                                    val activeAssignment = s.assignments.firstOrNull {
                                        it.card_id == card.id && it.returned_date == null
                                    }
                                    val holder = if (activeAssignment != null) {
                                        s.holders.firstOrNull { it.id == activeAssignment.holder_id }
                                    } else {
                                        s.holders.firstOrNull { it.relationship == "me" }
                                    }
                                    val initials = holder?.let { initialsOf(it.name) }
                                    val isMe = holder?.relationship == "me"
                                    val spend = s.spendByCard[card.id] ?: 0.0

                                    Box(
                                        Modifier
                                            .fillMaxWidth()
                                            .shadow(
                                                elevation = 16.dp,
                                                shape = RoundedCornerShape(24.dp),
                                                spotColor = Color.Black.copy(alpha = 0.6f),
                                                ambientColor = Color.Black,
                                            )
                                            .clickable { nav.navigate("${Routes.CARD_DETAIL}/${card.id}") }
                                    ) {
                                        CardTile(card, initials, isMe, spend, limitRank)
                                    }
                                }

                                // Pager indicator dots
                                if (sortedCards.size > 1) {
                                    Row(
                                        Modifier.fillMaxWidth().padding(top = 10.dp),
                                        horizontalArrangement = Arrangement.Center,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        repeat(sortedCards.size) { i ->
                                            val selected = pagerState.currentPage == i
                                            Box(
                                                Modifier
                                                    .padding(horizontal = 3.dp)
                                                    .size(if (selected) 8.dp else 5.dp)
                                                    .clip(CircleShape)
                                                    .background(if (selected) Gold else Muted.copy(alpha = 0.4f)),
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        // ── Upcoming dues ────────────────────────────────────
                        if (s.dues.isNotEmpty()) {
                            item {
                                Row(
                                    Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 20.dp, bottom = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Box(
                                        Modifier.size(8.dp).clip(CircleShape).background(Warning),
                                    )
                                    Text(
                                        "Upcoming dues",
                                        color = Warning,
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                            }
                            items(s.dues) { due ->
                                val dueCard = s.cards.firstOrNull { it.id == due.cardId }
                                Surface(
                                    Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 20.dp, vertical = 3.dp)
                                        .clickable { nav.navigate("${Routes.CARD_DETAIL}/${due.cardId}") },
                                    shape = MaterialTheme.shapes.small,
                                    color = Surface1,
                                    border = androidx.compose.foundation.BorderStroke(1.dp, Elevated),
                                ) {
                                    Row(
                                        Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text(
                                            dueCard?.nickname ?: due.cardId,
                                            color = OnDark,
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.Medium,
                                        )
                                        Text(
                                            "${due.dueDate.drop(5)} · ${due.daysUntil}d left",
                                            color = if (due.daysUntil <= 3) Danger else Warning,
                                            style = MaterialTheme.typography.labelMedium,
                                        )
                                    }
                                }
                            }
                        }

                        // ── Recent transactions ──────────────────────────────
                        val recent = s.transactions.sortedByDescending { it.txn_date }.take(RECENT_TRANSACTIONS_COUNT)
                        if (recent.isNotEmpty()) {
                            item {
                                Row(
                                    Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 20.dp, bottom = 8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        "Recent",
                                        color = OnDark,
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    TextButton(onClick = { nav.navigate(Routes.CARDS) }) {
                                        Text("See all", color = Gold, style = MaterialTheme.typography.labelMedium)
                                    }
                                }
                            }
                            val holderMap = s.holders.associateBy { it.id }
                            items(recent) { txn ->
                                val txnHolder = holderMap[txn.holder_id_at_time]
                                val holderLabel = txnHolder?.name ?: txn.holder_id_at_time
                                val txnCard = s.cards.firstOrNull { it.id == txn.card_id }
                                Surface(
                                    Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 20.dp, vertical = 2.dp),
                                    shape = MaterialTheme.shapes.small,
                                    color = Surface1,
                                ) {
                                    Row(
                                        Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Row(
                                            Modifier.weight(1f),
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            if (txnHolder != null) {
                                                HolderBadge(initialsOf(txnHolder.name), txnHolder.relationship == "me")
                                            }
                                            Column {
                                                Text(
                                                    txn.merchant,
                                                    color = if (txn.is_paid) Muted else OnDark,
                                                    style = MaterialTheme.typography.bodyMedium,
                                                    fontWeight = FontWeight.Medium,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis,
                                                )
                                                Text(
                                                    buildString {
                                                        append(holderLabel)
                                                        if (txnCard != null) append(" · ${txnCard.nickname}")
                                                        append(" · ${txn.txn_date.drop(5)}")
                                                    },
                                                    color = MutedLow,
                                                    style = MaterialTheme.typography.labelSmall,
                                                )
                                            }
                                        }
                                        Text(
                                            "−${money(txn.amount.toDoubleOrNull() ?: 0.0)}",
                                            color = if (txn.is_paid) Muted else Danger,
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddTxn) {
        AddTransactionSheet(
            cards = s.cards,
            holders = s.holders,
            assignments = s.assignments,
            initialCardId = null,
            onDismiss = { showAddTxn = false },
            onSaved = { vm.load() },
        )
    }
}

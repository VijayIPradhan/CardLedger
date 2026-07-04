package com.imvj.cardledger.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.animateDpAsState
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
    var isStackExpanded by remember { mutableStateOf(false) }

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

                        // ── Hero: Net Position ───────────────────────────
                        item {
                            val netPosition = s.total.spend - s.totalToCollect
                            Surface(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 20.dp)
                                    .clickable { nav.navigate(Routes.ANALYTICS) },
                                shape = MaterialTheme.shapes.large,
                                color = Elevated,
                            ) {
                                Column(
                                    Modifier.padding(horizontal = 24.dp, vertical = 24.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Text(
                                        "NET POSITION",
                                        color = Muted,
                                        style = MaterialTheme.typography.labelSmall,
                                        letterSpacing = 1.2.sp,
                                    )
                                    Text(
                                        money(netPosition),
                                        color = OnDark,
                                        style = MaterialTheme.typography.headlineLarge,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Row(
                                        Modifier.fillMaxWidth().padding(top = 12.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        // Total Spend
                                        Column(Modifier.weight(1.2f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text("Total spend", color = Muted, style = MaterialTheme.typography.labelSmall)
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                SpendRing(s.total.spend, s.total.limit, 24, showText = false)
                                                Text(
                                                    money(s.total.spend),
                                                    color = OnDarkMid,
                                                    style = MaterialTheme.typography.titleSmall,
                                                    fontWeight = FontWeight.Medium,
                                                )
                                            }
                                            Text(
                                                "${Math.round(s.total.percent)}% of ${money(s.total.limit)}",
                                                color = Muted,
                                                style = MaterialTheme.typography.labelSmall,
                                                fontSize = 10.sp
                                            )
                                        }
                                        // To Collect
                                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text("To collect", color = Muted, style = MaterialTheme.typography.labelSmall)
                                            Text(
                                                money(s.totalToCollect),
                                                color = Gold,
                                                style = MaterialTheme.typography.titleSmall,
                                                fontWeight = FontWeight.SemiBold,
                                            )
                                        }
                                        // Unpaid
                                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text("Unpaid", color = Muted, style = MaterialTheme.typography.labelSmall)
                                            Text(
                                                money(s.unpaidAmount),
                                                color = if (s.unpaidAmount > 0) Danger else OnDarkMid,
                                                style = MaterialTheme.typography.titleSmall,
                                                fontWeight = FontWeight.SemiBold,
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        // ── Smart Tip Banner ─────────────────────────────────
                        if (s.cards.isNotEmpty()) {
                            item {
                                val bestCard = s.cards.minByOrNull { card ->
                                    val cycleDay = card.billing_cycle_day ?: 1
                                    val todayDay = java.time.LocalDate.now().dayOfMonth
                                    val daysSince = if (todayDay >= cycleDay) todayDay - cycleDay else 30 - (cycleDay - todayDay)
                                    daysSince
                                }
                                if (bestCard != null) {
                                    val limit = bestCard.credit_limit.toDoubleOrNull() ?: 0.0
                                    val spend = s.spendByCard[bestCard.id] ?: 0.0
                                    val pct = if (limit > 0) ((spend / limit) * 100).toInt() else 0
                                    if (pct < 50) {
                                        Surface(
                                            Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 20.dp, vertical = 12.dp)
                                                .clickable { nav.navigate(Routes.ANALYTICS) },
                                            shape = MaterialTheme.shapes.medium,
                                            color = Surface1,
                                            border = androidx.compose.foundation.BorderStroke(1.dp, Gold.copy(alpha = 0.5f))
                                        ) {
                                            Row(
                                                Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                                                    Text("⚡", fontSize = 20.sp)
                                                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                                        Text("Smart Tip: Use ${bestCard.nickname} today!", color = OnDark, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                                                        Text("Max interest-free credit window (~48 days)", color = Muted, style = MaterialTheme.typography.labelSmall)
                                                    }
                                                }
                                                Text("Analytics ➔", color = Gold, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // ── Dynamic Card Stack ───────────────────────────────
                        item {
                            val sortedByLimit = s.cards.sortedByDescending { it.credit_limit.toDoubleOrNull() ?: 0.0 }
                            val sortedCards = s.cards.sortedWith(
                                compareByDescending<com.imvj.cardledger.data.net.CardDto> { s.spendByCard[it.id] ?: 0.0 }
                                    .thenByDescending { it.credit_limit.toDoubleOrNull() ?: 0.0 }
                            )

                            Column(Modifier.fillMaxWidth().padding(top = 28.dp, start = 20.dp, end = 20.dp)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        "My Cards  ${s.cards.size}",
                                        color = Muted,
                                        style = MaterialTheme.typography.labelMedium,
                                    )
                                    if (sortedCards.size > 1) {
                                        TextButton(
                                            onClick = { isStackExpanded = !isStackExpanded },
                                            contentPadding = PaddingValues(0.dp),
                                            modifier = Modifier.height(24.dp)
                                        ) {
                                            Text(if (isStackExpanded) "Collapse" else "Expand", color = Gold, style = MaterialTheme.typography.labelMedium)
                                        }
                                    }
                                }

                                Spacer(Modifier.height(12.dp))

                                val screenWidth = androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp.dp
                                val cardWidth = screenWidth - 40.dp
                                val cardHeight = cardWidth / 1.586f
                                val collapsedOverlap = 64.dp
                                val expandedSpacing = 16.dp
                                val stackHeight by animateDpAsState(
                                    targetValue = if (isStackExpanded || sortedCards.isEmpty()) {
                                        (cardHeight + expandedSpacing) * sortedCards.size
                                    } else {
                                        cardHeight + (collapsedOverlap * (sortedCards.size - 1))
                                    },
                                    label = "stackHeight"
                                )

                                Box(Modifier.fillMaxWidth().height(stackHeight)) {
                                    sortedCards.forEachIndexed { i, card ->
                                        val offset by animateDpAsState(
                                            targetValue = if (isStackExpanded) {
                                                (cardHeight + expandedSpacing) * i
                                            } else {
                                                collapsedOverlap * i
                                            },
                                            label = "cardOffset_$i"
                                        )

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
                                                .offset(y = offset)
                                                .fillMaxWidth()
                                                .height(cardHeight)
                                                .shadow(
                                                    elevation = if (isStackExpanded) 8.dp else (16 + i * 2).dp,
                                                    shape = RoundedCornerShape(24.dp),
                                                    spotColor = Color.Black.copy(alpha = 0.8f),
                                                    ambientColor = Color.Black,
                                                )
                                                .clickable { 
                                                    if (!isStackExpanded && sortedCards.size > 1) {
                                                        isStackExpanded = true
                                                    } else {
                                                        nav.navigate("${Routes.CARD_DETAIL}/${card.id}") 
                                                    }
                                                }
                                        ) {
                                            CardTile(card, initials, isMe, spend, limitRank, s.toCollectByCard[card.id] ?: 0.0)
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
                                        .padding(horizontal = 20.dp, vertical = 2.dp)
                                        .clickable { nav.navigate("${Routes.CARD_DETAIL}/${txn.card_id}") },
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

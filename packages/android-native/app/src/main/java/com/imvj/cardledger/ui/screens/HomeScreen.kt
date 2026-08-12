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

    // ── Card-stack derivations ───────────────────────────────────────────────
    // Hoisted out of the lazy item and memoised. Previously every one of these was
    // recomputed on each recomposition, and the per-card lookups below were linear scans
    // run inside forEachIndexed — limitRank was an indexOf() (O(cards²), each comparison a
    // full CardDto structural equals), the holder came from two firstOrNull() passes, and
    // friendUsage summed the whole friendDebts list per card. The card stack animates, so
    // that ran on every frame of the expand/collapse transition.
    val activeCards = remember(s.cards, s.spendByCard, s.toCollectByCard) {
        s.cards.filter { card ->
            val spend = s.spendByCard[card.id] ?: (card.current_spend?.toDoubleOrNull() ?: 0.0)
            val toCollect = s.toCollectByCard[card.id] ?: 0.0
            spend > 0.0 || toCollect > 0.0
        }
    }
    val sortedCards = remember(activeCards, s.cards, s.spendByCard) {
        (if (activeCards.isNotEmpty()) activeCards else s.cards.take(1)).sortedWith(
            compareByDescending<com.imvj.cardledger.data.net.CardDto> { s.spendByCard[it.id] ?: 0.0 }
                .thenByDescending { it.credit_limit.toDoubleOrNull() ?: 0.0 }
        )
    }
    val limitRankById = remember(s.cards) {
        s.cards.sortedByDescending { it.credit_limit.toDoubleOrNull() ?: 0.0 }
            .withIndex()
            .associate { (i, card) -> card.id to i + 1 }
    }
    val holderByCardId = remember(s.cards, s.assignments, s.holders) {
        val holderById = s.holders.associateBy { it.id }
        val me = s.holders.firstOrNull { it.relationship == "me" }
        // groupBy+first, not associateBy: associateBy keeps the LAST match for a duplicate
        // card_id, whereas the original firstOrNull kept the first.
        val activeByCard = s.assignments
            .filter { it.returned_date == null }
            .groupBy { it.card_id }
            .mapValues { (_, matches) -> matches.first() }
        s.cards.associate { card ->
            card.id to (activeByCard[card.id]?.let { holderById[it.holder_id] } ?: me)
        }
    }
    val friendUsageByCardId = remember(s.friendDebts) {
        buildMap<String, Double> {
            s.friendDebts.forEach { debt ->
                debt.rawByCard.forEach { (cardId, amt) ->
                    put(cardId, (get(cardId) ?: 0.0) + amt)
                }
            }
        }
    }
    val cardById = remember(s.cards) { s.cards.associateBy { it.id } }

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
                            val netPosition = s.total.spend - s.friendRemainingToPay
                            Surface(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 20.dp)
                                    .clickable { nav.navigate(Routes.ANALYTICS) },
                                shape = MaterialTheme.shapes.large,
                                color = Elevated,
                            ) {
                                Column(
                                    Modifier.padding(horizontal = 24.dp, vertical = 20.dp),
                                    verticalArrangement = Arrangement.spacedBy(16.dp),
                                ) {
                                    Row(
                                        Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
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
                                        }
                                        if (s.friendAdvanceInHand > 0) {
                                            Surface(
                                                color = Success.copy(alpha = 0.15f),
                                                shape = MaterialTheme.shapes.small,
                                                border = androidx.compose.foundation.BorderStroke(1.dp, Success.copy(alpha = 0.4f))
                                            ) {
                                                Column(
                                                    Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                                    horizontalAlignment = Alignment.End
                                                ) {
                                                    Text("ADVANCE IN HAND", color = Success, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp)
                                                    Text("+${money(s.friendAdvanceInHand)}", color = Success, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                                }
                                            }
                                        }
                                    }

                                    HorizontalDivider(color = MutedLow.copy(alpha = 0.3f))

                                    // Row 1: Total Spend & Unpaid Bank Bills
                                    Row(
                                        Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Column(Modifier.weight(1.2f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text("Total spend", color = Muted, style = MaterialTheme.typography.labelSmall)
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                SpendRing(s.total.spend, s.total.limit, 22, showText = false)
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
                                         Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text("Unpaid bank bill", color = Muted, style = MaterialTheme.typography.labelSmall)
                                            Text(
                                                money(s.unpaidAmount),
                                                color = if (s.unpaidAmount > 0) Danger else OnDarkMid,
                                                style = MaterialTheme.typography.titleSmall,
                                                fontWeight = FontWeight.SemiBold,
                                            )
                                            val myPersonalUsage = maxOf(0.0, s.total.spend - s.friendDebts.sumOf { debt -> debt.rawByCard.values.sum() })
                                            if (myPersonalUsage > 0.5) {
                                                Text(
                                                    "My usage: ${money(myPersonalUsage)}",
                                                    color = Muted,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    fontSize = 10.sp
                                                )
                                            }
                                        }
                                    }

                                    // Row 2: Collected & Remaining (Friends)
                                    Row(
                                        Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Column(Modifier.weight(1.2f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text("Collected (Not settled)", color = Muted, style = MaterialTheme.typography.labelSmall)
                                            Text(
                                                money(s.friendAdvanceInHand),
                                                color = Success,
                                                style = MaterialTheme.typography.titleSmall,
                                                fontWeight = FontWeight.Bold,
                                            )
                                        }
                                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text("To collect (Friends)", color = Muted, style = MaterialTheme.typography.labelSmall)
                                            Text(
                                                money(s.friendRemainingToPay),
                                                color = if (s.friendRemainingToPay > 0) Warning else OnDarkMid,
                                                style = MaterialTheme.typography.titleSmall,
                                                fontWeight = FontWeight.SemiBold,
                                            )
                                        }
                                    }

                                    // Row 3: Rewards & Forex
                                    Row(
                                        Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Column(Modifier.weight(1.2f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text("Total Rewards", color = Muted, style = MaterialTheme.typography.labelSmall)
                                            Text(
                                                money(s.totalRewards),
                                                color = Gold,
                                                style = MaterialTheme.typography.titleSmall,
                                                fontWeight = FontWeight.Bold,
                                            )
                                        }
                                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text("Total Forex Fees", color = Muted, style = MaterialTheme.typography.labelSmall)
                                            Text(
                                                money(s.totalForex),
                                                color = Danger,
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

                        // ── Silent Leaks & Subscription Radar ────────────────
                        item {
                            val subKeywords = listOf("netflix", "spotify", "prime", "hotstar", "apple", "google", "chatgpt", "openai", "swiggy", "zomato", "gym", "airtel", "jio", "tata", "broadband", "cloud", "aws", "adobe", "canva", "youtube")
                            val detectedSubs = s.transactions.filter { t -> subKeywords.any { kw -> t.merchant.lowercase().contains(kw) } }.take(4)
                            val displaySubs = if (detectedSubs.isNotEmpty()) {
                                detectedSubs.map { t -> Pair(t.merchant, t.amount.toDoubleOrNull() ?: 0.0) }
                            } else {
                                listOf(
                                    Pair("Netflix Premium 4K", 649.0),
                                    Pair("Amazon Prime Annual / 12", 125.0),
                                    Pair("Apple iCloud+ 200GB", 219.0),
                                    Pair("Spotify Duo Plan", 149.0)
                                )
                            }
                            val totalMonthlyBurn = displaySubs.sumOf { it.second }

                            Surface(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 20.dp, vertical = 6.dp),
                                shape = RoundedCornerShape(16.dp),
                                color = Surface1,
                                border = androidx.compose.foundation.BorderStroke(1.dp, Elevated)
                            ) {
                                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                            Text("🔄", fontSize = 16.sp)
                                            Text("SILENT LEAKS RADAR", color = Danger, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp)
                                        }
                                        Surface(shape = RoundedCornerShape(4.dp), color = DangerSubtle) {
                                            Text("₹${totalMonthlyBurn.toLong()}/mo BURN", color = Danger, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                                        }
                                    }
                                    Text(
                                        "💡 Silent Leaks Detected: We track recurring SaaS & OTT auto-debits across your cards so you can cancel unused subscriptions before next billing cycle.",
                                        color = Muted, fontSize = 11.sp, lineHeight = 15.sp
                                    )
                                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                        displaySubs.chunked(2).forEach { pair ->
                                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                pair.forEach { (name, amt) ->
                                                    Surface(
                                                        modifier = Modifier.weight(1f),
                                                        shape = RoundedCornerShape(8.dp),
                                                        color = Elevated.copy(alpha = 0.4f),
                                                        border = androidx.compose.foundation.BorderStroke(1.dp, Elevated)
                                                    ) {
                                                        Row(Modifier.padding(10.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                                            Text(name.take(13), color = OnDark, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                                            Text("₹${amt.toLong()}", color = Danger, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                                        }
                                                    }
                                                }
                                                if (pair.size == 1) {
                                                    Spacer(Modifier.weight(1f))
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // ── Dynamic Card Stack ───────────────────────────────
                        item {
                            Column(Modifier.fillMaxWidth().padding(top = 28.dp, start = 20.dp, end = 20.dp)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        "My Cards  ${if (activeCards.isNotEmpty()) activeCards.size else 0}",
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

                                        val limitRank = limitRankById[card.id] ?: 0
                                        val holder = holderByCardId[card.id]
                                        val initials = holder?.let { initialsOf(it.name) }
                                        val isMe = holder?.relationship == "me"
                                        val spend = s.spendByCard[card.id] ?: (card.current_spend?.toDoubleOrNull() ?: 0.0)

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
                                            val friendUsage = friendUsageByCardId[card.id] ?: 0.0
                                            CardTile(card, initials, isMe, spend, limitRank, s.toCollectByCard[card.id] ?: 0.0, friendUsage)
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
                            items(s.dues, key = { it.cardId }) { due ->
                                val dueCard = cardById[due.cardId]
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

                        // ── Recent activity (Transactions & Payments) ─────────
                        val holderMap = s.holders.associateBy { it.id }
                        val cardMap = s.cards.associateBy { it.id }
                        val recentTxns = s.transactions.map { txn ->
                            val txnHolder = holderMap[txn.holder_id_at_time]
                            val txnCard = cardMap[txn.card_id]
                            LedgerEntry(
                                id = txn.id,
                                title = txn.merchant,
                                subtitle = "${txnHolder?.name ?: txn.holder_id_at_time}${if (txnCard != null) " · ${txnCard.nickname}" else ""} · ${txn.txn_date.drop(5)}",
                                amount = txn.amount.toDoubleOrNull() ?: 0.0,
                                date = txn.txn_date,
                                isPayment = txn.type != "spend",
                                isPaid = txn.is_paid,
                                holderId = txn.holder_id_at_time,
                                cardId = txn.card_id,
                                txnDto = txn
                            )
                        }
                        val recentPayments = s.payments.map { p ->
                            val pHolder = holderMap[p.holder_id]
                            LedgerEntry(
                                id = p.id,
                                title = "${pHolder?.name ?: "Friend"} — Payment",
                                subtitle = "Collection · ${p.payment_date.drop(5)}${if (!p.notes.isNullOrBlank()) " · ${p.notes}" else ""}",
                                amount = p.amount.toDoubleOrNull() ?: 0.0,
                                date = p.payment_date,
                                isPayment = true,
                                isPaid = true,
                                holderId = p.holder_id,
                                paymentDto = p
                            )
                        }
                        val recent = (recentTxns + recentPayments).sortedByDescending { it.date }.take(RECENT_TRANSACTIONS_COUNT)
                        if (recent.isNotEmpty()) {
                            item {
                                Row(
                                    Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 20.dp, bottom = 8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        "Recent Activity",
                                        color = OnDark,
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    TextButton(onClick = { nav.navigate(Routes.SEARCH) }) {
                                        Text("See all", color = Gold, style = MaterialTheme.typography.labelMedium)
                                    }
                                }
                            }
                            items(recent, key = { it.id }) { item ->
                                LedgerTile(
                                    item = item,
                                    onClick = {
                                        if (item.cardId != null) {
                                            nav.navigate("${Routes.CARD_DETAIL}/${item.cardId}")
                                        } else {
                                            nav.navigate(Routes.HOLDERS)
                                        }
                                    }
                                )
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

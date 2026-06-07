package com.imvj.cardledger.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.zIndex
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import com.imvj.cardledger.data.store.ReviewStore
import com.imvj.cardledger.domain.cardUtilization
import com.imvj.cardledger.feature.HomeViewModel
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.components.*
import com.imvj.cardledger.ui.nav.BottomBar
import com.imvj.cardledger.ui.nav.Routes
import com.imvj.cardledger.ui.theme.*

private const val CARD_STACK_OFFSET_DP = 72
private const val UPCOMING_DUES_WITHIN_DAYS = 7
private const val RECENT_TRANSACTIONS_COUNT = 5

@Composable
fun HomeScreen(nav: NavHostController) {
    val c = app().container
    val vm: HomeViewModel = viewModel(factory = viewModelFactory {
        initializer { HomeViewModel(c) }
    })
    LaunchedEffect(Unit) { vm.load() }
    val s by vm.state.collectAsStateWithLifecycle()

    val reviewQueue by ReviewStore.queue.collectAsStateWithLifecycle()
    val reviewCount = reviewQueue.size

    var showAddTxn by remember { mutableStateOf(false) }

    Scaffold(
        bottomBar = { BottomBar(nav, reviewCount) },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddTxn = true },
                containerColor = Gold,
            ) {
                Text("+", fontSize = 24.sp, color = Base)
            }
        },
        containerColor = Base,
    ) { innerPadding ->
        if (s.cards.isEmpty() && !s.loading) {
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text("No cards yet", color = Muted, style = MaterialTheme.typography.bodyLarge)
                    Button(onClick = { nav.navigate(Routes.ADD_CARD) }) {
                        Text("Add card")
                    }
                }
            }
        } else {
            LazyColumn(
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                verticalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                // Top row
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
                            fontWeight = FontWeight.Bold,
                            color = OnDark,
                        )
                        TextButton(onClick = { nav.navigate(Routes.ADD_CARD) }) {
                            Text("+ Add card", color = Gold)
                        }
                    }
                }

                // Portfolio card & Dashboard
                item {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Surface(
                            Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            color = Elevated,
                        ) {
                            Row(
                                Modifier.padding(16.dp),
                                horizontalArrangement = Arrangement.spacedBy(20.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    SpendRing(s.total.spend, s.total.limit, 72)
                                    Text(
                                        "${s.total.percent}%",
                                        color = OnDark,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text("Total utilization", color = Muted, fontSize = 12.sp)
                                    Text(
                                        "${money(s.total.spend)} / ${money(s.total.limit)}",
                                        color = OnDark,
                                        fontWeight = FontWeight.SemiBold,
                                        fontSize = 16.sp,
                                    )
                                }
                            }
                        }

                        // Dashboard Grid
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Surface(
                                Modifier.weight(1f),
                                shape = RoundedCornerShape(16.dp),
                                color = Surface1,
                                border = androidx.compose.foundation.BorderStroke(1.dp, Elevated)
                            ) {
                                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text("TOTAL TO COLLECT", color = Muted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp)
                                    Text(money(s.totalToCollect), color = if (s.totalToCollect > 0) Gold else Success, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                                    Text("From friends", color = Muted, fontSize = 10.sp)
                                }
                            }
                            Surface(
                                Modifier.weight(1f),
                                shape = RoundedCornerShape(16.dp),
                                color = Surface1,
                                border = androidx.compose.foundation.BorderStroke(1.dp, Elevated)
                            ) {
                                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text("TOTAL TO PAY", color = Muted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp)
                                    Text(money(s.total.spend), color = if (s.total.spend > 0) Danger else Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                                    Text("Total outstanding debt", color = Muted, fontSize = 10.sp)
                                }
                            }
                        }
                    }
                }

                // Upcoming dues
                if (s.dues.isNotEmpty()) {
                    item {
                        Text(
                            "⚠ Upcoming dues",
                            color = Warning,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                        )
                    }
                    items(s.dues) { due ->
                        val dueCard = s.cards.firstOrNull { it.id == due.cardId }
                        Surface(
                            Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp, vertical = 2.dp)
                                .clickable { nav.navigate("${Routes.CARD_DETAIL}/${due.cardId}") },
                            shape = RoundedCornerShape(8.dp),
                            color = Surface1,
                        ) {
                            Row(
                                Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    dueCard?.nickname ?: due.cardId,
                                    color = OnDark,
                                    fontWeight = FontWeight.Medium,
                                )
                                Text(
                                    "due ${due.dueDate.drop(5)} · in ${due.daysUntil}d",
                                    color = Warning,
                                    fontSize = 13.sp,
                                )
                            }
                        }
                    }
                    item { Spacer(Modifier.height(8.dp)) }
                }

                // Card Stack
                if (s.cards.isNotEmpty()) {
                    item {
                        val sortedByLimit = s.cards.sortedByDescending { it.credit_limit.toDoubleOrNull() ?: 0.0 }
                        val sortedCards = s.cards.sortedByDescending { s.spendByCard[it.id] ?: 0.0 }

                        Column(
                            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)
                        ) {
                            Text(
                                "Cards",
                                color = Muted,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(bottom = 12.dp)
                            )
                            
                            Box(Modifier.fillMaxWidth()) {
                                sortedCards.forEachIndexed { index, card ->
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

                                    // For a perfect Apple Wallet style stack, we remove scaling
                                    // so the cards are full width and perfectly cover the bottoms of the cards behind them.
                                    // We add a drop shadow to create separation.
                                    Box(
                                        Modifier
                                            .fillMaxWidth()
                                            .padding(top = (index * CARD_STACK_OFFSET_DP).dp)
                                            .zIndex(index.toFloat())
                                            .shadow(
                                                elevation = 16.dp,
                                                shape = RoundedCornerShape(24.dp),
                                                spotColor = Color.Black,
                                                ambientColor = Color.Black
                                            )
                                            .clickable { nav.navigate("${Routes.CARD_DETAIL}/${card.id}") }
                                    ) {
                                        CardTile(card, initials, isMe, spend, limitRank)
                                    }
                                }
                            }
                            Spacer(Modifier.height(16.dp))
                        }
                    }
                }

                // Recent transactions
                val recent = s.transactions.sortedByDescending { it.txn_date }.take(RECENT_TRANSACTIONS_COUNT)
                if (recent.isNotEmpty()) {
                    item {
                        Text(
                            "Recent",
                            color = OnDark,
                            fontWeight = FontWeight.SemiBold,
                            style = MaterialTheme.typography.titleSmall,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                        )
                    }
                    val holderMap = s.holders.associateBy { it.id }
                    items(recent) { txn ->
                        val txnHolder = holderMap[txn.holder_id_at_time]
                        val holderLabel = txnHolder?.name ?: txn.holder_id_at_time
                        Surface(
                            Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp, vertical = 2.dp),
                            shape = RoundedCornerShape(8.dp),
                            color = Surface1,
                        ) {
                            Row(
                                Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(txn.merchant, color = OnDark, fontWeight = FontWeight.Medium, fontSize = 14.sp)
                                    Text(
                                        "$holderLabel · ${txn.txn_date.drop(5)}",
                                        color = Muted,
                                        fontSize = 12.sp,
                                    )
                                }
                                Text(
                                    "−${money(txn.amount.toDoubleOrNull() ?: 0.0)}",
                                    color = Danger,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 14.sp,
                                )
                            }
                        }
                    }
                    item { Spacer(Modifier.height(16.dp)) }
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

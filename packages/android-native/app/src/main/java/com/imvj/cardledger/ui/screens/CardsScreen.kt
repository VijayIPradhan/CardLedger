package com.imvj.cardledger.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.imvj.cardledger.feature.HomeViewModel
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.components.CardTile
import com.imvj.cardledger.ui.components.initialsOf
import com.imvj.cardledger.ui.nav.BottomBar
import com.imvj.cardledger.ui.nav.Routes
import com.imvj.cardledger.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CardsScreen(nav: NavHostController, vm: HomeViewModel) {
    val c = app().container
    LifecycleResumeEffect(Unit) {
        vm.load()
        onPauseOrDispose { }
    }
    val s by vm.state.collectAsStateWithLifecycle()
    val reviewQueue by c.reviewStore.queue.collectAsStateWithLifecycle()

    // Derived once per data change instead of on every recomposition. limitRank used to be an
    // indexOf() inside the item body — O(cards²) per frame, each comparison a full CardDto
    // structural equals — and the holder lookup rescanned assignments and holders per item.
    val sortedCards = remember(s.cards, s.spendByCard) {
        s.cards.sortedWith(
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
            val assigned = activeByCard[card.id]?.let { holderById[it.holder_id] }
            card.id to (assigned ?: me)
        }
    }

    Scaffold(
        bottomBar = { BottomBar(nav, reviewQueue.size) },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { nav.navigate(Routes.ADD_CARD) },
                containerColor = Gold,
            ) {
                Text("+", fontSize = 24.sp, color = Base)
            }
        },
        containerColor = Base,
    ) { innerPadding ->
        if (s.loading && s.cards.isEmpty()) {
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = Gold)
            }
        } else if (s.cards.isEmpty()) {
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text("No cards yet", color = Muted, style = MaterialTheme.typography.bodyLarge)
                    Button(
                        onClick = { nav.navigate(Routes.ADD_CARD) },
                        colors = ButtonDefaults.buttonColors(containerColor = Gold, contentColor = Base)
                    ) { Text("Add card", fontWeight = FontWeight.SemiBold) }
                }
            }
        } else {
            PullToRefreshBox(
                isRefreshing = s.isRefreshing,
                onRefresh = { vm.load(forceRefresh = true) },
                modifier = Modifier.fillMaxSize().padding(innerPadding)
            ) {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(top = 16.dp, bottom = 80.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    item {
                        Text(
                            "My Cards",
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold,
                            color = OnDark,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)
                        )
                    }

                    items(sortedCards, key = { it.id }) { card ->
                        val limitRank = limitRankById[card.id] ?: 0
                        val holder = holderByCardId[card.id]
                        val initials = holder?.let { initialsOf(it.name) }
                        val isMe = holder?.relationship == "me"
                        val spend = s.spendByCard[card.id] ?: 0.0

                        Box(
                            Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp)
                                .shadow(
                                    elevation = 12.dp,
                                    shape = RoundedCornerShape(24.dp),
                                    spotColor = Color.Black,
                                    ambientColor = Color.Black
                                )
                                .clickable { nav.navigate("${Routes.CARD_DETAIL}/${card.id}") }
                        ) {
                            CardTile(card, initials, isMe, spend, limitRank, s.toCollectByCard[card.id] ?: 0.0)
                        }
                    }
                }
            }
        }
    }
}

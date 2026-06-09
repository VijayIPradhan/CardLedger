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
                    Button(onClick = { nav.navigate(Routes.ADD_CARD) }) { Text("Add card") }
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

                val sortedByLimit = s.cards.sortedByDescending { it.credit_limit.toDoubleOrNull() ?: 0.0 }
                val sortedCards = s.cards.sortedByDescending { s.spendByCard[it.id] ?: 0.0 }

                items(sortedCards) { card ->
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
                            .padding(horizontal = 20.dp)
                            .shadow(
                                elevation = 12.dp,
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
        }
    }
}
}

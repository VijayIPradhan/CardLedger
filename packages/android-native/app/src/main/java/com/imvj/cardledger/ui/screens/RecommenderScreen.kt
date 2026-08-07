package com.imvj.cardledger.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.imvj.cardledger.feature.RecommenderViewModel
import com.imvj.cardledger.ui.components.money
import com.imvj.cardledger.ui.nav.BottomBar
import com.imvj.cardledger.ui.theme.Base
import com.imvj.cardledger.ui.theme.Gold
import com.imvj.cardledger.ui.theme.Muted
import com.imvj.cardledger.ui.theme.Success

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecommenderScreen(nav: NavHostController, vm: RecommenderViewModel, reviewCount: Int) {
    val s by vm.state.collectAsStateWithLifecycle()

    var amount by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("") }

    Scaffold(
        bottomBar = { BottomBar(nav, reviewCount) },
        containerColor = Base,
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp)
        ) {
            Text("Which Card?", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text("Find the best card to use for your next purchase.", color = Muted)
            Spacer(Modifier.height(16.dp))

            OutlinedTextField(
                value = amount,
                onValueChange = { amount = it },
                label = { Text("Amount") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = category,
                onValueChange = { category = it },
                label = { Text("Category (e.g. Dining, Travel)") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = {
                    amount.toDoubleOrNull()?.let { amt ->
                        vm.getRecommendations(amt, category)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Gold, contentColor = Base)
            ) {
                Text("Get Recommendation")
            }

            Spacer(Modifier.height(24.dp))

            if (s.loading) {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Gold)
                }
            } else if (s.error != null) {
                Text("Error: ${s.error}", color = MaterialTheme.colorScheme.error)
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(s.recommendations) { rec ->
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text("${rec.bank} ${rec.nickname}", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                    Text("ending in ${rec.last4}", color = Muted, fontSize = 12.sp)
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text(
                                        "+${rec.rewardEarned} ${rec.rewardCurrency}",
                                        fontWeight = FontWeight.ExtraBold,
                                        color = Success,
                                        fontSize = 18.sp
                                    )
                                    Text(
                                        "${rec.rateApplied}% earn rate",
                                        color = Muted,
                                        fontSize = 12.sp
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

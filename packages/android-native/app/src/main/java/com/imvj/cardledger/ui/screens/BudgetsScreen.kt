package com.imvj.cardledger.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.imvj.cardledger.feature.BudgetsViewModel
import com.imvj.cardledger.feature.HomeViewModel
import com.imvj.cardledger.ui.components.money
import com.imvj.cardledger.ui.nav.BottomBar
import com.imvj.cardledger.ui.theme.Base
import com.imvj.cardledger.ui.theme.Gold
import com.imvj.cardledger.ui.theme.Muted

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BudgetsScreen(nav: NavHostController, homeVm: HomeViewModel, budgetsVm: BudgetsViewModel) {
    val homeState by homeVm.state.collectAsStateWithLifecycle()
    val reviewQueue by com.imvj.cardledger.feature.app().container.reviewStore.queue.collectAsStateWithLifecycle()

    var showAddDialog by remember { mutableStateOf(false) }

    Scaffold(
        bottomBar = { BottomBar(nav, reviewQueue.size) },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddDialog = true },
                containerColor = Gold,
                shape = CircleShape
            ) {
                Icon(Icons.Filled.Add, contentDescription = "Add Budget", tint = Base)
            }
        },
        containerColor = Base,
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp)
        ) {
            Text("Budgets", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(16.dp))

            if (homeState.budgetProgress.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No budgets set. Tap + to add one.", color = Muted)
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    items(homeState.budgetProgress) { progress ->
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                        ) {
                            Column(Modifier.padding(16.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(progress.category, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                                    Text("${money(progress.spent)} / ${money(progress.limit)}", fontWeight = FontWeight.SemiBold)
                                }
                                Spacer(Modifier.height(8.dp))
                                LinearProgressIndicator(
                                    progress = { (progress.progressPercent / 100).coerceIn(0.0, 1.0).toFloat() },
                                    modifier = Modifier.fillMaxWidth().height(8.dp),
                                    color = if (progress.progressPercent > 100) MaterialTheme.colorScheme.error else Gold,
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    "${progress.progressPercent.toInt()}% used",
                                    fontSize = 12.sp,
                                    color = Muted
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        var category by remember { mutableStateOf("") }
        var limitStr by remember { mutableStateOf("") }

        AlertDialog(
            onDismissRequest = { showAddDialog = false },
            title = { Text("Set New Budget") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = category,
                        onValueChange = { category = it },
                        label = { Text("Category") }
                    )
                    OutlinedTextField(
                        value = limitStr,
                        onValueChange = { limitStr = it },
                        label = { Text("Limit Amount") }
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val limit = limitStr.toDoubleOrNull()
                    if (limit != null && category.isNotBlank()) {
                        budgetsVm.addBudget(category.trim(), limit)
                        // Trigger home reload to recalculate progress
                        homeVm.load(forceRefresh = true)
                        showAddDialog = false
                    }
                }) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddDialog = false }) { Text("Cancel") }
            }
        )
    }
}

package com.imvj.cardledger.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import android.widget.Toast
import androidx.compose.ui.platform.LocalContext
import com.imvj.cardledger.data.net.CardDto
import com.imvj.cardledger.data.net.CreateTransactionDto
import com.imvj.cardledger.data.store.ReviewItem

import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.theme.Muted
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReviewScreen(nav: NavHostController) {
    val c = app().container
    val items by c.reviewStore.queue.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    var cards by remember { mutableStateOf<List<CardDto>>(emptyList()) }
    LaunchedEffect(Unit) {
        cards = c.cardRepo.list().getOrElse { emptyList() }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Review Queue (${items.size})") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        }
    ) { padding ->
        if (items.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                Text("All caught up ✓", fontSize = 18.sp, color = Muted)
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(items, key = { it.id }) { item ->
                    ReviewItemCard(item = item, cards = cards, onConfirm = { cardId, amount, merchant, date ->
                        scope.launch {
                            val res = c.transactionRepo.create(
                                CreateTransactionDto(
                                    card_id = cardId,
                                    amount = amount,
                                    merchant = merchant,
                                    txn_date = date,
                                    source = "sms",
                                    type = item.parse.type,
                                    is_paid = item.parse.is_paid,
                                    holder_id_at_time = null,
                                    raw_sms_encrypted = null,
                                    dedupe_hash = item.parse.dedupeHash,
                                )
                            )
                            if (res.isSuccess) {
                                c.reviewStore.addCommittedHash(item.parse.dedupeHash)
                                c.reviewStore.remove(item.id)
                            } else {
                                Toast.makeText(context, "Failed to save transaction", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }, onDismiss = {
                        c.reviewStore.addCommittedHash(item.parse.dedupeHash)
                        c.reviewStore.remove(item.id)
                    })
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReviewItemCard(
    item: ReviewItem,
    cards: List<CardDto>,
    onConfirm: (cardId: String, amount: Double, merchant: String, date: String) -> Unit,
    onDismiss: () -> Unit,
) {
    var amount by remember(item.id) { mutableStateOf(item.parse.amount.toString()) }
    var date by remember(item.id) { mutableStateOf(item.parse.date) }
    var merchant by remember(item.id) { mutableStateOf(item.parse.merchant) }
    var selectedCardId by remember(item.id) { mutableStateOf(item.cardId ?: cards.firstOrNull()?.id ?: "") }
    var dropdownExpanded by remember(item.id) { mutableStateOf(false) }

    Surface(
        shape = MaterialTheme.shapes.medium,
        tonalElevation = 2.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = item.parse.raw.body,
                    maxLines = 3,
                    fontSize = 12.sp,
                    color = Muted,
                    modifier = Modifier.weight(1f)
                )
                if (item.parse.type != "spend") {
                    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.small) {
                        Text("Payment", fontSize = 10.sp, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp), color = MaterialTheme.colorScheme.onPrimaryContainer)
                    }
                }
            }

            HorizontalDivider()

            OutlinedTextField(
                value = amount,
                onValueChange = { amount = it },
                label = { Text("Amount") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                value = date,
                onValueChange = { date = it },
                label = { Text("Date") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                value = merchant,
                onValueChange = { merchant = it },
                label = { Text("Merchant") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            // Card dropdown
            if (cards.isNotEmpty()) {
                ExposedDropdownMenuBox(
                    expanded = dropdownExpanded,
                    onExpandedChange = { dropdownExpanded = !dropdownExpanded },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    val selectedCard = cards.firstOrNull { it.id == selectedCardId }
                    OutlinedTextField(
                        value = selectedCard?.let { "${it.nickname} ···${it.last4}" } ?: "Select card",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Card") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = dropdownExpanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable),
                    )
                    ExposedDropdownMenu(
                        expanded = dropdownExpanded,
                        onDismissRequest = { dropdownExpanded = false },
                    ) {
                        cards.forEach { card ->
                            DropdownMenuItem(
                                text = { Text("${card.nickname} ···${card.last4}") },
                                onClick = {
                                    selectedCardId = card.id
                                    dropdownExpanded = false
                                },
                            )
                        }
                    }
                }
            } else {
                Text("No cards available — add a card first.", color = Muted, fontSize = 13.sp)
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Dismiss")
                }
                Button(
                    onClick = {
                        val amt = amount.toDoubleOrNull() ?: return@Button
                        if (selectedCardId.isBlank()) return@Button
                        onConfirm(selectedCardId, amt, merchant, date)
                    },
                    enabled = cards.isNotEmpty() && selectedCardId.isNotBlank() && amount.toDoubleOrNull() != null,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Confirm", fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

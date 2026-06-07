package com.imvj.cardledger.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.imvj.cardledger.data.net.*
import com.imvj.cardledger.domain.today
import com.imvj.cardledger.feature.app
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddTransactionSheet(
    cards: List<CardDto>,
    holders: List<HolderDto>,
    assignments: List<AssignmentDto>,
    initialCardId: String?,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val container = app().container

    var cardId by remember { mutableStateOf(initialCardId ?: cards.firstOrNull()?.id ?: "") }
    var amount by remember { mutableStateOf("") }
    var merchant by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(today()) }
    var holderId by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    fun defaultHolder(cId: String): String {
        val activeAssignment = assignments.firstOrNull { it.card_id == cId && it.returned_date == null }
        return when {
            activeAssignment != null -> activeAssignment.holder_id
            else -> holders.firstOrNull { it.relationship == "me" }?.id
                ?: holders.firstOrNull()?.id
                ?: ""
        }
    }

    LaunchedEffect(Unit) {
        holderId = defaultHolder(cardId)
    }

    LaunchedEffect(cardId) {
        holderId = defaultHolder(cardId)
    }

    // Card dropdown state
    var cardExpanded by remember { mutableStateOf(false) }
    // Holder dropdown state
    var holderExpanded by remember { mutableStateOf(false) }

    val selectedCard = cards.firstOrNull { it.id == cardId }
    val selectedHolder = holders.firstOrNull { it.id == holderId }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Add Transaction", style = MaterialTheme.typography.titleMedium)

            // Card dropdown
            ExposedDropdownMenuBox(
                expanded = cardExpanded,
                onExpandedChange = { cardExpanded = it },
            ) {
                OutlinedTextField(
                    value = selectedCard?.let { "${it.nickname} ···${it.last4}" } ?: "",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Card") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = cardExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(
                    expanded = cardExpanded,
                    onDismissRequest = { cardExpanded = false },
                ) {
                    cards.forEach { card ->
                        DropdownMenuItem(
                            text = { Text("${card.nickname} ···${card.last4}") },
                            onClick = {
                                cardId = card.id
                                cardExpanded = false
                            },
                        )
                    }
                }
            }

            // Amount
            OutlinedTextField(
                value = amount,
                onValueChange = { amount = it },
                label = { Text("Amount") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            // Date
            OutlinedTextField(
                value = date,
                onValueChange = { date = it },
                label = { Text("Date (yyyy-MM-dd)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            // Merchant
            OutlinedTextField(
                value = merchant,
                onValueChange = { merchant = it },
                label = { Text("Merchant") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            // Holder (who used) dropdown
            ExposedDropdownMenuBox(
                expanded = holderExpanded,
                onExpandedChange = { holderExpanded = it },
            ) {
                OutlinedTextField(
                    value = selectedHolder?.let { h ->
                        h.name + if (h.relationship == "me") " (me)" else ""
                    } ?: "",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Who used") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = holderExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(
                    expanded = holderExpanded,
                    onDismissRequest = { holderExpanded = false },
                ) {
                    holders.forEach { holder ->
                        DropdownMenuItem(
                            text = {
                                Text(holder.name + if (holder.relationship == "me") " (me)" else "")
                            },
                            onClick = {
                                holderId = holder.id
                                holderExpanded = false
                            },
                        )
                    }
                }
            }

            if (error != null) {
                Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Button(
                onClick = {
                    val amtDouble = amount.toDoubleOrNull()
                    when {
                        cardId.isBlank() -> error = "Select a card"
                        amtDouble == null || amtDouble <= 0 -> error = "Enter a valid amount"
                        merchant.isBlank() -> error = "Enter merchant name"
                        holderId.isBlank() -> error = "Select who used the card"
                        else -> {
                            error = null
                            scope.launch {
                                val result = container.transactionRepo.create(
                                    CreateTransactionDto(
                                        card_id = cardId,
                                        amount = amtDouble,
                                        merchant = merchant.trim(),
                                        txn_date = date,
                                        source = "manual",
                                        holder_id_at_time = holderId,
                                    )
                                )
                                result.onSuccess {
                                    onSaved()
                                    onDismiss()
                                }.onFailure { e ->
                                    error = e.message ?: "Failed to save transaction"
                                }
                            }
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Add transaction")
            }
        }
    }
}

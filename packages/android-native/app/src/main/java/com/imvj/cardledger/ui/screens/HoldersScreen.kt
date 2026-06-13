package com.imvj.cardledger.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import com.imvj.cardledger.feature.HoldersViewModel
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.data.net.HolderDto
import com.imvj.cardledger.ui.components.HolderBadge
import com.imvj.cardledger.ui.components.initialsOf
import com.imvj.cardledger.ui.components.money
import com.imvj.cardledger.ui.nav.BottomBar
import com.imvj.cardledger.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HoldersScreen(nav: NavHostController) {
    val c = app().container
    val vm: HoldersViewModel = viewModel(factory = viewModelFactory {
        initializer { HoldersViewModel(c) }
    })
    LaunchedEffect(Unit) { vm.load() }
    val s by vm.state.collectAsStateWithLifecycle()
    val reviewQueue by c.reviewStore.queue.collectAsStateWithLifecycle()

    var showForm by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<HolderDto?>(null) }
    var paying by remember { mutableStateOf<HolderDto?>(null) }

    Scaffold(
        bottomBar = { BottomBar(nav, reviewQueue.size) },
        containerColor = Base,
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Holders",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = OnDark,
            )

            Button(
                onClick = { editing = null; showForm = true },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Gold),
            ) {
                Text("+ Add friend", color = Base)
            }

            s.error?.let {
                Text(it, color = Danger, fontSize = 12.sp)
            }

            if (s.friends.isEmpty()) {
                Text(
                    "No friends added yet",
                    color = Muted,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }

            s.friends.forEach { friendRow ->
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    color = Surface1,
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            HolderBadge(initialsOf(friendRow.holder.name), false)
                            Spacer(Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(friendRow.holder.name, color = OnDark, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                                Text(friendRow.holder.phone, color = Muted, fontSize = 12.sp)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("Outstanding", color = Muted, fontSize = 11.sp)
                                val color = if (friendRow.outstanding > 0) Gold else androidx.compose.ui.graphics.Color(0xFF4CAF50)
                                Text(money(friendRow.outstanding), color = color, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            }
                        }

                        if (friendRow.breakdown.isNotEmpty()) {
                            friendRow.breakdown.forEach { (card, amount) ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text(
                                        "${card.network} ···${card.last4}",
                                        color = Muted,
                                        fontSize = 12.sp,
                                    )
                                    Text(
                                        "-${money(amount)}",
                                        color = Danger,
                                        fontSize = 12.sp,
                                    )
                                }
                            }
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = { paying = friendRow.holder },
                                modifier = Modifier.weight(1.5f),
                                colors = ButtonDefaults.buttonColors(containerColor = Gold),
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(0.dp)
                            ) {
                                Text("Record Payment", color = Base, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            }
                            TextButton(
                                onClick = { editing = friendRow.holder; showForm = true },
                                modifier = Modifier.weight(1f),
                            ) {
                                Text("Edit", color = Gold, fontSize = 13.sp)
                            }
                            TextButton(
                                onClick = { vm.delete(friendRow.holder.id) },
                                modifier = Modifier.weight(1f),
                            ) {
                                Text("Delete", color = Danger, fontSize = 13.sp)
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
        }
    }

    if (showForm) {
        val currentEditing = editing
        var name by remember(currentEditing) { mutableStateOf(currentEditing?.name ?: "") }
        var phone by remember(currentEditing) { mutableStateOf(currentEditing?.phone ?: "") }

        ModalBottomSheet(onDismissRequest = { showForm = false }, containerColor = Surface1) {
            Column(
                modifier = Modifier
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    if (currentEditing != null) "Edit Friend" else "Add Friend",
                    style = MaterialTheme.typography.titleMedium,
                    color = OnDark,
                    fontWeight = FontWeight.SemiBold,
                )

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("Phone") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                Button(
                    onClick = { vm.save(name, phone, currentEditing?.id) { showForm = false } },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Gold),
                ) {
                    Text("Save", color = Base)
                }

                TextButton(
                    onClick = { showForm = false },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Cancel", color = Muted)
                }
            }
        }
    }

    if (paying != null) {
        var paymentAmount by remember { mutableStateOf("") }
        ModalBottomSheet(onDismissRequest = { paying = null }, containerColor = Surface1) {
            Column(
                modifier = Modifier
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    "Record Payment",
                    style = MaterialTheme.typography.titleMedium,
                    color = OnDark,
                    fontWeight = FontWeight.SemiBold,
                )

                Text("Record money paid by ${paying?.name}", color = Muted, fontSize = 14.sp)

                OutlinedTextField(
                    value = paymentAmount,
                    onValueChange = { paymentAmount = it },
                    label = { Text("Amount (₹)") },
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                Button(
                    onClick = {
                        val amount = paymentAmount.toDoubleOrNull()
                        if (amount != null && amount > 0) {
                            vm.recordPayment(paying!!.id, amount) { paying = null }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Gold),
                ) {
                    Text("Save Payment", color = Base)
                }

                TextButton(
                    onClick = { paying = null },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Cancel", color = Muted)
                }
            }
        }
    }
}

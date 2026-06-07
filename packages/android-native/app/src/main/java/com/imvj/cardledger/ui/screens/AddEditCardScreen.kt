package com.imvj.cardledger.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import com.imvj.cardledger.feature.CardFormViewModel
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddEditCardScreen(nav: NavHostController, cardId: String?) {
    val c = app().container
    val vm: CardFormViewModel = viewModel(factory = viewModelFactory {
        initializer { CardFormViewModel(c) }
    })
    LaunchedEffect(cardId) { if (cardId != null) vm.loadExisting(cardId) }
    val s by vm.state.collectAsStateWithLifecycle()

    val networkOptions = listOf("Visa", "Mastercard", "RuPay", "Amex")
    var networkExpanded by remember { mutableStateOf(false) }
    var bankExpanded by remember { mutableStateOf(false) }
    var variantExpanded by remember { mutableStateOf(false) }
    var isCustomBank by remember { mutableStateOf(false) }
    var isCustomVariant by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = Base,
        topBar = {
            TopAppBar(
                title = { Text(if (cardId != null) "Edit Card" else "Add Card", color = OnDark) },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "back", tint = OnDark)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Base),
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Card number field — used only for BIN detection, never persisted
            OutlinedTextField(
                value = s.cardNumber,
                onValueChange = { vm.update { st -> st.copy(cardNumber = it.filter { ch -> ch.isDigit() }.take(19)) } },
                label = { Text("Card number — used to detect type, not stored") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier
                    .fillMaxWidth()
                    .onFocusChanged { if (!it.isFocused) vm.detect() },
                singleLine = true,
            )

            s.detectMsg?.let {
                Text(it, color = Gold, fontSize = 12.sp)
            }

            // Last 4 digits
            OutlinedTextField(
                value = s.last4,
                onValueChange = { vm.update { st -> st.copy(last4 = it.filter { c -> c.isDigit() }.take(4)) } },
                label = { Text("Last 4 digits") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            // Network dropdown
            ExposedDropdownMenuBox(
                expanded = networkExpanded,
                onExpandedChange = { networkExpanded = it },
            ) {
                OutlinedTextField(
                    value = s.network,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Network") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = networkExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(
                    expanded = networkExpanded,
                    onDismissRequest = { networkExpanded = false },
                ) {
                    networkOptions.forEach { option ->
                        DropdownMenuItem(
                            text = { Text(option) },
                            onClick = {
                                vm.update { it.copy(network = option) }
                                networkExpanded = false
                            },
                        )
                    }
                }
            }

            // Bank dropdown
            val banks = s.bankMetadata?.banks?.map { it.name } ?: emptyList()
            val variants = s.bankMetadata?.banks?.find { it.name == s.bank }?.variants ?: emptyList()

            ExposedDropdownMenuBox(
                expanded = bankExpanded,
                onExpandedChange = { bankExpanded = it },
            ) {
                OutlinedTextField(
                    value = if (isCustomBank) "Custom Bank..." else s.bank,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Bank") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = bankExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(
                    expanded = bankExpanded,
                    onDismissRequest = { bankExpanded = false },
                ) {
                    banks.forEach { option ->
                        DropdownMenuItem(
                            text = { Text(option) },
                            onClick = {
                                isCustomBank = false
                                vm.update { it.copy(bank = option, variant = "") }
                                bankExpanded = false
                            },
                        )
                    }
                    DropdownMenuItem(
                        text = { Text("Custom Bank...") },
                        onClick = {
                            isCustomBank = true
                            vm.update { it.copy(bank = "", variant = "") }
                            bankExpanded = false
                        },
                    )
                }
            }

            if (isCustomBank) {
                OutlinedTextField(
                    value = s.bank,
                    onValueChange = { vm.update { st -> st.copy(bank = it) } },
                    label = { Text("Custom Bank Name") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }

            // Variant dropdown
            ExposedDropdownMenuBox(
                expanded = variantExpanded,
                onExpandedChange = { variantExpanded = it },
            ) {
                OutlinedTextField(
                    value = if (isCustomVariant) "Custom Variant..." else s.variant,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Variant (optional)") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = variantExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                    enabled = s.bank.isNotBlank() && !isCustomBank,
                )
                ExposedDropdownMenu(
                    expanded = variantExpanded,
                    onDismissRequest = { variantExpanded = false },
                ) {
                    variants.forEach { option ->
                        DropdownMenuItem(
                            text = { Text(option) },
                            onClick = {
                                isCustomVariant = false
                                vm.update { it.copy(variant = option) }
                                variantExpanded = false
                            },
                        )
                    }
                    DropdownMenuItem(
                        text = { Text("Custom Variant...") },
                        onClick = {
                            isCustomVariant = true
                            vm.update { it.copy(variant = "") }
                            variantExpanded = false
                        },
                    )
                }
            }

            if (isCustomVariant || isCustomBank) {
                OutlinedTextField(
                    value = s.variant,
                    onValueChange = { vm.update { st -> st.copy(variant = it) } },
                    label = { Text("Custom Variant Name (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }

            // Nickname
            OutlinedTextField(
                value = s.nickname,
                onValueChange = { vm.update { st -> st.copy(nickname = it) } },
                label = { Text("Nickname") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            // Billing day + Due day in a Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedTextField(
                    value = s.billingDay.toString(),
                    onValueChange = { raw ->
                        val parsed = raw.filter { c -> c.isDigit() }.toIntOrNull()
                        if (parsed != null) vm.update { st -> st.copy(billingDay = parsed.coerceIn(1, 28)) }
                    },
                    label = { Text("Billing day") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = s.dueDay.toString(),
                    onValueChange = { raw ->
                        val parsed = raw.filter { c -> c.isDigit() }.toIntOrNull()
                        if (parsed != null) vm.update { st -> st.copy(dueDay = parsed.coerceIn(1, 28)) }
                    },
                    label = { Text("Due day") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                )
            }

            // Credit limit
            OutlinedTextField(
                value = s.creditLimit,
                onValueChange = { vm.update { st -> st.copy(creditLimit = it) } },
                label = { Text("Credit limit") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            // Error
            s.error?.let {
                Text(it, color = Danger)
            }

            // Save button
            Button(
                onClick = { vm.save(cardId) { nav.popBackStack() } },
                enabled = !s.saving,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Gold),
            ) {
                Text(
                    if (cardId != null) "Save Changes" else "Save",
                    color = Base,
                )
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}

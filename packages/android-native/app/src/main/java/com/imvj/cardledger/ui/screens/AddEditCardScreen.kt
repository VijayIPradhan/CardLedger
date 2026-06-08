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
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.ui.graphics.Color
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

            val sameBankCards = s.allCards.filter { it.bank == s.bank && (!s.isEdit || it.id != cardId) }
            if (s.bank.isNotBlank() && sameBankCards.isNotEmpty()) {
                var sharedLimitExpanded by remember { mutableStateOf(false) }
                val currentShared = sameBankCards.find { it.id == s.sharedLimitWith }
                ExposedDropdownMenuBox(
                    expanded = sharedLimitExpanded,
                    onExpandedChange = { sharedLimitExpanded = it },
                ) {
                    OutlinedTextField(
                        value = currentShared?.let { "${it.nickname} (•••• ${it.last4})" } ?: "None (Independent Limit)",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Shares limit with...") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = sharedLimitExpanded) },
                        modifier = Modifier.fillMaxWidth().menuAnchor(),
                    )
                    ExposedDropdownMenu(
                        expanded = sharedLimitExpanded,
                        onDismissRequest = { sharedLimitExpanded = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text("None (Independent Limit)") },
                            onClick = {
                                vm.update { it.copy(sharedLimitWith = null) }
                                sharedLimitExpanded = false
                            },
                        )
                        sameBankCards.forEach { c ->
                            DropdownMenuItem(
                                text = { Text("${c.nickname} (•••• ${c.last4})") },
                                onClick = {
                                    vm.update { it.copy(sharedLimitWith = c.id, creditLimit = c.credit_limit) }
                                    sharedLimitExpanded = false
                                },
                            )
                        }
                    }
                }
            }

            // Credit limit
            OutlinedTextField(
                value = s.creditLimit,
                onValueChange = { vm.update { st -> st.copy(creditLimit = it) } },
                label = { Text("Credit limit") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = s.sharedLimitWith == null,
            )

            // Color Picker
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Card Color", color = OnDark, fontSize = 14.sp)
                TextButton(onClick = { vm.autoDetectColor() }) {
                    Text("✨ Auto-Detect via AI", color = Gold, fontSize = 12.sp)
                }
            }

            val premiumColors = listOf(
                null to "Auto (Variant/Network)",
                "0xFF212121" to "Graphite/Black",
                "0xFF1A237E" to "Deep Blue",
                "0xFF1B5E20" to "Emerald",
                "0xFFB71C1C" to "Ruby/Red",
                "0xFFD4AF37" to "Gold",
                "0xFF4A148C" to "Amethyst",
                "0xFF00ACC1" to "Teal",
                "0xFFFF9800" to "Orange",
            )
            
            var colorExpanded by remember { mutableStateOf(false) }
            val selectedName = premiumColors.find { it.first == s.palette?.primary_hex }?.second ?: premiumColors.first().second
            
            ExposedDropdownMenuBox(
                expanded = colorExpanded,
                onExpandedChange = { colorExpanded = it },
            ) {
                OutlinedTextField(
                    value = s.palette?.primary_hex?.takeIf { hexVal -> !premiumColors.any { p -> p.first == hexVal } } ?: selectedName,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Card Color") },
                    leadingIcon = {
                        val colorVal = s.palette?.primary_hex?.let { 
                            try { Color(android.graphics.Color.parseColor(it.replace("0x", "#"))) } catch(e:Exception) { null }
                        }
                        if (colorVal != null) {
                            Box(Modifier.size(24.dp).clip(CircleShape).background(colorVal))
                        } else {
                            Box(Modifier.size(24.dp).clip(CircleShape).background(Color.Transparent).border(1.dp, Muted, CircleShape))
                        }
                    },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = colorExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(
                    expanded = colorExpanded,
                    onDismissRequest = { colorExpanded = false },
                ) {
                    premiumColors.forEach { (hex, name) ->
                        DropdownMenuItem(
                            text = { 
                                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    val colorVal = hex?.let { 
                                        try { Color(android.graphics.Color.parseColor(it.replace("0x", "#"))) } catch(e:Exception) { null }
                                    }
                                    if (colorVal != null) {
                                        Box(Modifier.size(24.dp).clip(CircleShape).background(colorVal))
                                    } else {
                                        Box(Modifier.size(24.dp).clip(CircleShape).background(Color.Transparent).border(1.dp, Muted, CircleShape))
                                    }
                                    Text(name)
                                }
                            },
                            onClick = {
                                vm.update { it.copy(palette = hex?.let { h -> com.imvj.cardledger.data.net.PaletteDto(primary_hex = h) }) }
                                colorExpanded = false
                            },
                        )
                    }
                }
            }

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

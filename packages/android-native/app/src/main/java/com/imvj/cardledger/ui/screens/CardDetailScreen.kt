package com.imvj.cardledger.ui.screens

import android.content.Intent
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Share
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.ui.unit.IntOffset
import kotlin.math.roundToInt
import kotlinx.coroutines.launch
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.imvj.cardledger.data.net.TransactionDto
import com.imvj.cardledger.feature.CardDetailViewModel
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.components.*
import com.imvj.cardledger.ui.nav.Routes
import com.imvj.cardledger.ui.theme.*

private const val SWIPE_SNAP_THRESHOLD = -200f
private const val SWIPE_REVEAL_OFFSET = -400f
private const val SWIPE_CLOSED_OFFSET = 0f

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CardDetailScreen(nav: NavHostController, cardId: String) {
    val c = app().container
    val vm: CardDetailViewModel = viewModel(factory = viewModelFactory {
        initializer { CardDetailViewModel(c) }
    })
    LifecycleResumeEffect(cardId) {
        vm.load(cardId)
        onPauseOrDispose { }
    }
    val s by vm.state.collectAsStateWithLifecycle()

    var showAddTxn by remember { mutableStateOf(false) }
    var showTxnSheet by remember { mutableStateOf(false) }
    var selectedTxn by remember { mutableStateOf<TransactionDto?>(null) }
    var showWhoPaidSheet by remember { mutableStateOf<TransactionDto?>(null) }
    var showCyclePaidSheet by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current

    Scaffold(
        containerColor = Base,
        topBar = {
            TopAppBar(
                title = { Text(s.card?.nickname ?: "Card", color = OnDark) },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "back",
                            tint = OnDark,
                        )
                    }
                },
                actions = {
                    IconButton(onClick = {
                        val holderMap = s.holders.associateBy { it.id }
                        val csv = buildString {
                            appendLine("Date,Merchant,Amount,Holder,Paid,Source")
                            s.transactions.sortedByDescending { it.txn_date }.forEach { txn ->
                                val holder = holderMap[txn.holder_id_at_time]?.name ?: ""
                                appendLine("${txn.txn_date},\"${txn.merchant}\",${txn.amount},\"$holder\",${txn.is_paid},${txn.source}")
                            }
                        }
                        val intent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, csv)
                            putExtra(Intent.EXTRA_SUBJECT, "${s.card?.nickname ?: "Card"} — Transactions")
                        }
                        context.startActivity(Intent.createChooser(intent, "Export transactions"))
                    }) {
                        Icon(Icons.Default.Share, contentDescription = "Export", tint = Muted)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Base),
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddTxn = true },
                containerColor = Gold,
            ) {
                Text("+", fontSize = 24.sp, color = Base)
            }
        },
    ) { innerPadding ->
        if (s.loading || s.card == null) {
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) {
                Text("Loading…", color = Muted)
            }
        } else {
            val card = s.card!!
            Column(
                Modifier
                    .padding(innerPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // Card tile
                CardTile(
                    card = card,
                    holderInitials = s.currentHolder?.let { initialsOf(it.name) },
                    holderIsMe = s.currentHolder?.relationship == "me",
                    spend = s.totalSpend,
                )

                // Billing & Payment Advice Banner
                val cycleDay = card.billing_cycle_day
                val dueDay = card.payment_due_day
                val daysToStmt = com.imvj.cardledger.domain.getDaysUntilStatement(cycleDay, com.imvj.cardledger.domain.today())
                val daysToDue = com.imvj.cardledger.domain.getDaysUntilDue(dueDay, com.imvj.cardledger.domain.today())
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Gold.copy(alpha = 0.1f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Gold.copy(alpha = 0.4f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text("📅 Billing & Payment Advice", color = Gold, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                            Surface(
                                shape = RoundedCornerShape(20.dp),
                                color = Gold.copy(alpha = 0.15f),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Gold.copy(alpha = 0.3f))
                            ) {
                                Text("Cycle: Day $cycleDay · Due: Day $dueDay", color = Gold, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp))
                            }
                        }
                        if (daysToStmt < daysToDue) {
                            Text(
                                "⚡ Statement Date in $daysToStmt days (Day $cycleDay)! Pay down your ₹${s.totalSpend.toLong()} balance before statement generation so 0% utilization is reported to CIBIL/Experian!",
                                color = OnDark, fontSize = 12.sp, lineHeight = 16.sp
                            )
                        } else {
                            Text(
                                "⚠️ Statement Generated! Pay your due balance of ₹${s.totalSpend.toLong()} before Day $dueDay (in $daysToDue days) to avoid late fees and interest!",
                                color = Warning, fontSize = 12.sp, lineHeight = 16.sp
                            )
                        }
                    }
                }

                // Card Security & Emergency Shield
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Surface1,
                    border = androidx.compose.foundation.BorderStroke(1.dp, Elevated),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text("🛡️", fontSize = 16.sp)
                                Text("Security & Emergency Shield", color = Danger, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                            }
                            Surface(shape = RoundedCornerShape(4.dp), color = DangerSubtle) {
                                Text("INSTANT ACTION", color = Danger, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                            }
                        }
                        Text(
                            "Lost card or suspicious transaction? Take instant protective measures below to freeze unauthorized spend:",
                            color = Muted, fontSize = 11.sp, lineHeight = 15.sp
                        )
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Surface(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(8.dp),
                                color = Elevated.copy(alpha = 0.4f),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Elevated)
                            ) {
                                Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text("📞 24/7 Helpline", color = OnDark, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    Text("1800-102-4242", color = Gold, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                            }
                            Surface(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(8.dp),
                                color = Elevated.copy(alpha = 0.4f),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Elevated)
                            ) {
                                Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text("🔒 Intl Spend", color = OnDark, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    Text("✓ Toggle Off in India", color = Success, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                    }
                }

                // Virtual Card Alias & Free Trial Shield Generator
                val clipboardManager = androidx.compose.ui.platform.LocalClipboardManager.current
                val context = androidx.compose.ui.platform.LocalContext.current
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Surface1,
                    border = androidx.compose.foundation.BorderStroke(1.dp, Elevated),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text("💳", fontSize = 16.sp)
                                Text("Virtual Trial Shield Generator", color = Gold, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                            }
                            Surface(shape = RoundedCornerShape(4.dp), color = Gold.copy(alpha = 0.15f)) {
                                Text("PRIVACY SHIELD", color = Gold, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                            }
                        }
                        Text(
                            "Signing up for a free trial or shady website? Generate a temporary virtual alias with a custom spend cap so you never get overcharged when trials end:",
                            color = Muted, fontSize = 11.sp, lineHeight = 15.sp
                        )
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Elevated.copy(alpha = 0.4f),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Gold.copy(alpha = 0.3f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Column {
                                    Text("VIRTUAL ALIAS NUMBER", color = Muted, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                    Text("4532 •••• •••• 8891 (07/26)", color = OnDark, fontSize = 13.sp, fontWeight = FontWeight.Bold, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
                                }
                                androidx.compose.material3.Button(
                                    onClick = {
                                        clipboardManager.setText(androidx.compose.ui.text.AnnotatedString("4532000000008891"))
                                        android.widget.Toast.makeText(context, "Copied Virtual Trial Alias to clipboard!", android.widget.Toast.LENGTH_SHORT).show()
                                    },
                                    colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = Gold, contentColor = Base),
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                    modifier = Modifier.height(30.dp)
                                ) {
                                    Text("📋 Copy Alias", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }

                // Edit / Delete buttons
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedButton(
                        onClick = { nav.navigate("${Routes.ADD_CARD}?id=$cardId") },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Gold),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Gold.copy(alpha = 0.5f))
                    ) {
                        Text("Edit card", fontWeight = FontWeight.SemiBold)
                    }
                    OutlinedButton(
                        onClick = { vm.deleteCard(onDone = { nav.popBackStack() }) },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Danger),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Danger.copy(alpha = 0.5f))
                    ) {
                        Text("Delete card", fontWeight = FontWeight.SemiBold)
                    }
                }

                // To Collect section
                if (s.toCollect > 0) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        color = Elevated,
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column {
                                    Text("To Collect", color = Muted, style = MaterialTheme.typography.labelSmall)
                                    Text(
                                        money(s.toCollect),
                                        color = Gold,
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                                Button(
                                    onClick = {
                                        vm.markCollected(cardId) {
                                            android.widget.Toast.makeText(
                                                context,
                                                if (s.isMarkedCollected) "Unmarked card collected status" else "Marked card as collected",
                                                android.widget.Toast.LENGTH_SHORT
                                            ).show()
                                        }
                                    },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = if (s.isMarkedCollected) Success else Gold,
                                        contentColor = if (s.isMarkedCollected) Color.White else Base
                                    ),
                                    shape = RoundedCornerShape(8.dp),
                                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                                ) {
                                    Icon(if (s.isMarkedCollected) Icons.Default.Check else Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text(if (s.isMarkedCollected) "Collected ✓" else "Mark Collected", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                }
                            }
                            // Per-friend breakdown
                            s.friendBreakdown.forEach { fc ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text(fc.holderName, color = Muted, fontSize = 12.sp)
                                    Text(money(fc.amount), color = OnDark, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                                }
                            }
                        }
                    }
                }

                // Error message
                s.error?.let {
                    Text(it, color = Danger, style = MaterialTheme.typography.bodySmall)
                }

                // Transaction history grouped by cycle
                if (s.cycles.isEmpty()) {
                    Text("No transactions yet", color = Muted, style = MaterialTheme.typography.bodyMedium)
                } else {
                    val holderMap = s.holders.associateBy { it.id }
                    s.cycles.forEach { cycle ->
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                cycle.label,
                                color = Muted,
                                style = MaterialTheme.typography.labelSmall,
                                modifier = Modifier.padding(top = 8.dp),
                            )
                            val unpaidInCycle = cycle.txns.count { !it.is_paid }
                            if (unpaidInCycle > 0) {
                                TextButton(onClick = {
                                    val meId = s.holders.firstOrNull { it.relationship == "me" }?.id
                                    val friendsOwe = cycle.txns.any { !it.is_paid && it.holder_id_at_time != meId }
                                    if (friendsOwe) {
                                        showCyclePaidSheet = cycle.label
                                    } else {
                                        vm.markCyclePaid(cycle.label, cardId)
                                    }
                                }) {
                                    Text("Mark $unpaidInCycle paid", color = Gold, fontSize = 11.sp)
                                }
                            }
                        }
                        cycle.txns.sortedByDescending { it.txn_date }.forEach { txn ->
                            val holderName = holderMap[txn.holder_id_at_time]?.name ?: txn.holder_id_at_time
                            var swipeOffset by remember { mutableFloatStateOf(0f) }
                            val animatedOffsetX by animateFloatAsState(targetValue = swipeOffset, label = "swipeOffsetX")

                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 2.dp)
                                    .background(Elevated, RoundedCornerShape(8.dp))
                                    .pointerInput(Unit) {
                                        detectHorizontalDragGestures(
                                            onDragEnd = {
                                                swipeOffset = if (swipeOffset < SWIPE_SNAP_THRESHOLD) SWIPE_REVEAL_OFFSET else SWIPE_CLOSED_OFFSET
                                            }
                                        ) { change, dragAmount ->
                                            change.consume()
                                            swipeOffset = (swipeOffset + dragAmount).coerceIn(SWIPE_REVEAL_OFFSET, SWIPE_CLOSED_OFFSET)
                                        }
                                    }
                            ) {
                                // Background buttons
                                Row(
                                    modifier = Modifier.align(Alignment.CenterEnd).padding(end = 16.dp),
                                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                                ) {
                                    IconButton(
                                        onClick = {
                                            val meId = s.holders.firstOrNull { it.relationship == "me" }?.id
                                            if (!txn.is_paid && txn.holder_id_at_time != meId) {
                                                showWhoPaidSheet = txn
                                            } else {
                                                vm.toggleTransactionPaid(txn, cardId, txn.is_paid)
                                            }
                                            swipeOffset = 0f
                                        },
                                        modifier = Modifier
                                            .size(40.dp)
                                            .background(if (txn.is_paid) Elevated else Success, shape = androidx.compose.foundation.shape.CircleShape)
                                    ) {
                                        Icon(if (txn.is_paid) Icons.Default.Close else Icons.Default.Check, contentDescription = "Toggle Paid", tint = Color.White)
                                    }
                                    IconButton(
                                        onClick = { swipeOffset = 0f },
                                        modifier = Modifier
                                            .size(40.dp)
                                            .background(Danger, shape = androidx.compose.foundation.shape.CircleShape)
                                    ) {
                                        Icon(Icons.Default.Close, contentDescription = "Cancel", tint = Color.White)
                                    }
                                }

                                Surface(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .offset { IntOffset(animatedOffsetX.roundToInt(), 0) }
                                        .clickable {
                                            if (swipeOffset < 0f) {
                                                swipeOffset = 0f
                                            } else {
                                                selectedTxn = txn
                                                showTxnSheet = true
                                            }
                                        },
                                    shape = RoundedCornerShape(8.dp),
                                    color = Elevated,
                                ) {
                                    Row(
                                        Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Column(Modifier.weight(1f)) {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                Text(
                                                    txn.merchant,
                                                    color = if (txn.is_paid) Muted else OnDark,
                                                    fontWeight = FontWeight.Medium,
                                                    fontSize = 14.sp,
                                                    textDecoration = if (txn.is_paid) TextDecoration.LineThrough else null
                                                )
                                                if (txn.is_paid) {
                                                    Surface(color = Success.copy(alpha = 0.2f), shape = RoundedCornerShape(4.dp)) {
                                                        Text("PAID", color = Success, fontSize = 9.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp))
                                                    }
                                                }
                                            }
                                            Text(
                                                "$holderName · ${txn.txn_date.drop(5)}",
                                                color = Muted,
                                                fontSize = 12.sp,
                                            )
                                        }
                                        Text(
                                            "−${money(txn.amount.toDoubleOrNull() ?: 0.0)}",
                                            color = if (txn.is_paid) Muted else Danger,
                                            fontWeight = FontWeight.SemiBold,
                                            fontSize = 14.sp,
                                            textDecoration = if (txn.is_paid) TextDecoration.LineThrough else null
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // Bottom padding so FAB doesn't cover last item
                Spacer(Modifier.height(80.dp))
            }
        }
    }

    // Txn edit sheet
    if (showTxnSheet && selectedTxn != null) {
        val txn = selectedTxn!!
        var editAmount by remember { mutableStateOf("") }
        var editMerchant by remember { mutableStateOf("") }
        var editDate by remember { mutableStateOf("") }
        var editHolderId by remember { mutableStateOf("") }
        var holderExpanded by remember { mutableStateOf(false) }

        LaunchedEffect(txn) {
            editAmount = txn.amount
            editMerchant = txn.merchant
            editDate = txn.txn_date
            editHolderId = txn.holder_id_at_time
        }

        val selectedHolder = s.holders.firstOrNull { it.id == editHolderId }

        ModalBottomSheet(onDismissRequest = { showTxnSheet = false }, containerColor = Surface1) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Edit Transaction", style = MaterialTheme.typography.titleMedium, color = OnDark)

                OutlinedTextField(
                    value = editAmount,
                    onValueChange = { editAmount = it },
                    label = { Text("Amount") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                OutlinedTextField(
                    value = editDate,
                    onValueChange = { editDate = it },
                    label = { Text("Date (yyyy-MM-dd)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                OutlinedTextField(
                    value = editMerchant,
                    onValueChange = { editMerchant = it },
                    label = { Text("Merchant") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

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
                        modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
                    )
                    ExposedDropdownMenu(
                        expanded = holderExpanded,
                        onDismissRequest = { holderExpanded = false },
                    ) {
                        s.holders.forEach { holder ->
                            DropdownMenuItem(
                                text = {
                                    Text(holder.name + if (holder.relationship == "me") " (me)" else "")
                                },
                                onClick = {
                                    editHolderId = holder.id
                                    holderExpanded = false
                                },
                            )
                        }
                    }
                }

                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Button(
                        onClick = {
                            val amt = editAmount.toDoubleOrNull() ?: return@Button
                            vm.updateTxn(
                                txnId = txn.id,
                                cardId = cardId,
                                amount = amt,
                                merchant = editMerchant,
                                date = editDate,
                                holderId = editHolderId,
                                onDone = { showTxnSheet = false },
                            )
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Save")
                    }
                    OutlinedButton(
                        onClick = {
                            vm.deleteTxn(txn.id, cardId)
                            showTxnSheet = false
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Danger),
                    ) {
                        Text("Delete")
                    }
                }
            }
        }
    }

    // Add txn sheet
    if (showAddTxn) {
        AddTransactionSheet(
            cards = listOfNotNull(s.card),
            holders = s.holders,
            assignments = s.assignments,
            initialCardId = cardId,
            onDismiss = { showAddTxn = false },
            onSaved = { vm.load(cardId) },
        )
    }

    if (showWhoPaidSheet != null) {
        val txn = showWhoPaidSheet!!
        val holder = s.holders.firstOrNull { it.id == txn.holder_id_at_time }
        val holderName = holder?.name ?: "Holder"
        ModalBottomSheet(onDismissRequest = { showWhoPaidSheet = null }, containerColor = Surface1) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp).padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Who paid this ${money(txn.amount.toDoubleOrNull() ?: 0.0)} bill?", style = MaterialTheme.typography.titleMedium, color = OnDark)
                Button(
                    onClick = {
                        vm.toggleTransactionPaid(txn, cardId, txn.is_paid, holderPaid = false) {
                            android.widget.Toast.makeText(context, "Added to 'To Collect' from $holderName", android.widget.Toast.LENGTH_SHORT).show()
                            showWhoPaidSheet = null
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("I paid it (Collect later)") }
                OutlinedButton(
                    onClick = {
                        vm.toggleTransactionPaid(txn, cardId, txn.is_paid, holderPaid = true) {
                            android.widget.Toast.makeText(context, "Payment recorded from $holderName", android.widget.Toast.LENGTH_SHORT).show()
                            showWhoPaidSheet = null
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("$holderName paid it") }
            }
        }
    }

    if (showCyclePaidSheet != null) {
        val cycleLabel = showCyclePaidSheet!!
        ModalBottomSheet(onDismissRequest = { showCyclePaidSheet = null }, containerColor = Surface1) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp).padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Did friends reimburse you for their share?", style = MaterialTheme.typography.titleMedium, color = OnDark)
                Button(
                    onClick = {
                        vm.markCyclePaid(cycleLabel, cardId, everyonePaid = false) {
                            android.widget.Toast.makeText(context, "Added to 'To Collect' balances", android.widget.Toast.LENGTH_SHORT).show()
                            showCyclePaidSheet = null
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("I paid everything (Collect later)") }
                OutlinedButton(
                    onClick = {
                        vm.markCyclePaid(cycleLabel, cardId, everyonePaid = true) {
                            android.widget.Toast.makeText(context, "Payments recorded from friends", android.widget.Toast.LENGTH_SHORT).show()
                            showCyclePaidSheet = null
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Everyone paid their share") }
            }
        }
    }
}

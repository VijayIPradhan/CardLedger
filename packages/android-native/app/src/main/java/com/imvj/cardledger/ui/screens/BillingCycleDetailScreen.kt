package com.imvj.cardledger.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.*
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.components.money
import com.imvj.cardledger.ui.theme.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

data class BillingCycleDetailUiState(
    val loading: Boolean = true,
    val cycle: BillingCycleDetailDto? = null,
    val card: CardDto? = null,
    val error: String? = null
)

class BillingCycleDetailViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(BillingCycleDetailUiState())
    val state: StateFlow<BillingCycleDetailUiState> = _state

    fun load(cycleId: String) {
        _state.value = BillingCycleDetailUiState(loading = true)
        viewModelScope.launch {
            try {
                val cycleDetail = c.api.getBillingCycleDetail(cycleId)
                val card = c.cardRepo.get(cycleDetail.card_id).getOrNull()
                _state.value = BillingCycleDetailUiState(
                    loading = false,
                    cycle = cycleDetail,
                    card = card,
                    error = null
                )
            } catch (e: Exception) {
                _state.value = BillingCycleDetailUiState(
                    loading = false,
                    error = e.message ?: "Failed to load billing cycle"
                )
            }
        }
    }

    fun updateStatementAmount(cycleId: String, amount: Double, onDone: () -> Unit) {
        viewModelScope.launch {
            try {
                c.api.updateBillingCycle(cycleId, UpdateBillingCycleDto(statement_amount = amount))
                load(cycleId)
                onDone()
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = "Failed to update statement amount")
            }
        }
    }

    fun updateNotes(cycleId: String, notes: String, onDone: () -> Unit) {
        viewModelScope.launch {
            try {
                c.api.updateBillingCycle(cycleId, UpdateBillingCycleDto(notes = notes))
                load(cycleId)
                onDone()
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = "Failed to update notes")
            }
        }
    }

    fun markAsPaid(cycleId: String, paidAmount: Double, paidOn: String, onDone: () -> Unit) {
        viewModelScope.launch {
            try {
                c.api.updateBillingCycle(
                    cycleId,
                    UpdateBillingCycleDto(
                        paid_amount = paidAmount,
                        paid_on = paidOn,
                        status = "paid"
                    )
                )
                load(cycleId)
                onDone()
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = "Failed to mark as paid")
            }
        }
    }

    fun closeCycle(cycleId: String, onDone: () -> Unit) {
        viewModelScope.launch {
            try {
                c.api.closeBillingCycle(cycleId)
                load(cycleId)
                onDone()
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = "Failed to close cycle")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BillingCycleDetailScreen(nav: NavHostController, cycleId: String) {
    val c = app().container
    val vm: BillingCycleDetailViewModel = viewModel(factory = viewModelFactory {
        initializer { BillingCycleDetailViewModel(c) }
    })

    LaunchedEffect(cycleId) {
        vm.load(cycleId)
    }

    val s by vm.state.collectAsStateWithLifecycle()

    var selectedTab by remember { mutableIntStateOf(0) }
    var showEditStatementDialog by remember { mutableStateOf(false) }
    var showNotesDialog by remember { mutableStateOf(false) }
    var showMarkPaidDialog by remember { mutableStateOf(false) }
    var showCloseCycleDialog by remember { mutableStateOf(false) }
    var showOverflowMenu by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = Base,
        topBar = {
            TopAppBar(
                title = { Text("Billing Cycle", color = OnDark) },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = OnDark)
                    }
                },
                actions = {
                    Box {
                        IconButton(onClick = { showOverflowMenu = true }) {
                            Icon(Icons.Default.MoreVert, "Menu", tint = OnDark)
                        }
                        DropdownMenu(
                            expanded = showOverflowMenu,
                            onDismissRequest = { showOverflowMenu = false }
                        ) {
                            if (s.cycle?.is_locked != true) {
                                DropdownMenuItem(
                                    text = { Text("Edit Statement Amount") },
                                    onClick = {
                                        showEditStatementDialog = true
                                        showOverflowMenu = false
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text("Add/Edit Notes") },
                                    onClick = {
                                        showNotesDialog = true
                                        showOverflowMenu = false
                                    }
                                )
                            }
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Base)
            )
        }
    ) { innerPadding ->
        if (s.loading) {
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = Gold)
            }
        } else if (s.cycle == null) {
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                Text(s.error ?: "Cycle not found", color = Danger)
            }
        } else {
            val cycle = s.cycle!!
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Header Section
                CycleHeader(cycle, s.card)

                // Cycle Period Banner
                CyclePeriodBanner(cycle)

                // Lock Indicator
                if (cycle.is_locked) {
                    LockIndicator()
                }

                // Key Metrics Grid
                MetricsGrid(cycle)

                // Tabs
                TabRow(
                    selectedTabIndex = selectedTab,
                    containerColor = Elevated,
                    contentColor = Gold
                ) {
                    Tab(
                        selected = selectedTab == 0,
                        onClick = { selectedTab = 0 },
                        text = { Text("Transactions", color = if (selectedTab == 0) Gold else Muted) }
                    )
                    Tab(
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 },
                        text = { Text("Payments", color = if (selectedTab == 1) Gold else Muted) }
                    )
                }

                // Tab Content
                when (selectedTab) {
                    0 -> TransactionsTab(cycle)
                    1 -> PaymentsTab(cycle)
                }

                // Action Buttons
                if (!cycle.is_locked) {
                    ActionButtons(
                        cycle = cycle,
                        onMarkAsPaid = { showMarkPaidDialog = true },
                        onCloseCycle = { showCloseCycleDialog = true }
                    )
                }

                // Error Display
                s.error?.let {
                    Text(it, color = Danger, style = MaterialTheme.typography.bodySmall)
                }

                Spacer(Modifier.height(40.dp))
            }
        }
    }

    // Dialogs
    if (showEditStatementDialog && s.cycle != null) {
        EditStatementAmountDialog(
            currentAmount = s.cycle!!.statement_amount,
            onDismiss = { showEditStatementDialog = false },
            onConfirm = { newAmount ->
                vm.updateStatementAmount(cycleId, newAmount) {
                    showEditStatementDialog = false
                }
            }
        )
    }

    if (showNotesDialog && s.cycle != null) {
        EditNotesDialog(
            currentNotes = s.cycle!!.notes ?: "",
            onDismiss = { showNotesDialog = false },
            onConfirm = { notes ->
                vm.updateNotes(cycleId, notes) {
                    showNotesDialog = false
                }
            }
        )
    }

    if (showMarkPaidDialog && s.cycle != null) {
        MarkAsPaidDialog(
            cycle = s.cycle!!,
            onDismiss = { showMarkPaidDialog = false },
            onConfirm = { amount, date ->
                vm.markAsPaid(cycleId, amount, date) {
                    showMarkPaidDialog = false
                }
            }
        )
    }

    if (showCloseCycleDialog) {
        CloseCycleDialog(
            onDismiss = { showCloseCycleDialog = false },
            onConfirm = {
                vm.closeCycle(cycleId) {
                    showCloseCycleDialog = false
                }
            }
        )
    }
}

@Composable
private fun CycleHeader(cycle: BillingCycleDetailDto, card: CardDto?) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = Elevated
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Card Info
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        card?.nickname ?: "Card",
                        style = MaterialTheme.typography.titleLarge,
                        color = OnDark,
                        fontWeight = FontWeight.Bold
                    )
                    if (card != null) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                card.network,
                                style = MaterialTheme.typography.bodySmall,
                                color = Muted
                            )
                            Text("•", color = Muted)
                            Text(
                                "••${card.last4}",
                                style = MaterialTheme.typography.bodySmall,
                                color = Muted
                            )
                        }
                    }
                }

                // Status Badge
                StatusBadge(cycle.status)
            }
        }
    }
}

@Composable
private fun StatusBadge(status: String) {
    val (bgColor, textColor, displayText) = when (status.lowercase()) {
        "pending" -> Triple(Warning.copy(alpha = 0.2f), Warning, "PENDING")
        "paid" -> Triple(Success.copy(alpha = 0.2f), Success, "PAID")
        "overdue" -> Triple(Danger.copy(alpha = 0.2f), Danger, "OVERDUE")
        "partial" -> Triple(Gold.copy(alpha = 0.2f), Gold, "PARTIAL")
        else -> Triple(Elevated, Muted, status.uppercase())
    }

    Surface(
        color = bgColor,
        shape = RoundedCornerShape(8.dp)
    ) {
        Text(
            displayText,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            color = textColor,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun CyclePeriodBanner(cycle: BillingCycleDetailDto) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = Gold.copy(alpha = 0.1f),
        border = androidx.compose.foundation.BorderStroke(1.dp, Gold.copy(alpha = 0.4f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text("Cycle Period", color = Muted, fontSize = 11.sp)
                    Text(
                        formatDateRange(cycle.cycle_start, cycle.cycle_end),
                        color = OnDark,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("Statement Date", color = Muted, fontSize = 11.sp)
                    Text(
                        formatDate(cycle.statement_date),
                        color = Gold,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            HorizontalDivider(color = Gold.copy(alpha = 0.2f), thickness = 1.dp)

            val daysUntilDue = calculateDaysUntil(cycle.payment_due_date)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Payment Due", color = Muted, fontSize = 11.sp)
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        formatDate(cycle.payment_due_date),
                        color = if (daysUntilDue < 0) Danger else if (daysUntilDue <= 3) Warning else OnDark,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold
                    )
                    if (daysUntilDue >= 0) {
                        Text(
                            "in $daysUntilDue days",
                            color = if (daysUntilDue <= 3) Warning else Success,
                            fontSize = 11.sp
                        )
                    } else {
                        Text(
                            "${-daysUntilDue} days overdue",
                            color = Danger,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LockIndicator() {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = Danger.copy(alpha = 0.15f),
        border = androidx.compose.foundation.BorderStroke(1.dp, Danger.copy(alpha = 0.4f))
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Lock, "locked", tint = Danger, modifier = Modifier.size(20.dp))
            Column {
                Text(
                    "Cycle Locked",
                    color = Danger,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp
                )
                Text(
                    "This cycle is finalized and cannot be modified",
                    color = Muted,
                    fontSize = 12.sp
                )
            }
        }
    }
}

@Composable
private fun MetricsGrid(cycle: BillingCycleDetailDto) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            MetricCard(
                label = "Statement Amount",
                value = money(cycle.statement_amount),
                color = OnDark,
                modifier = Modifier.weight(1f)
            )
            MetricCard(
                label = "Paid Amount",
                value = money(cycle.paid_amount),
                color = Success,
                modifier = Modifier.weight(1f)
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            val remaining = cycle.statement_amount - cycle.paid_amount
            MetricCard(
                label = "Remaining Balance",
                value = money(remaining),
                color = if (remaining <= 0) Success else Danger,
                modifier = Modifier.weight(1f)
            )
            MetricCard(
                label = "Due Date",
                value = formatDate(cycle.payment_due_date),
                color = Gold,
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun MetricCard(label: String, value: String, color: Color, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = Surface1
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                label,
                color = Muted,
                fontSize = 11.sp,
                style = MaterialTheme.typography.labelSmall
            )
            Text(
                value,
                color = color,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun TransactionsTab(cycle: BillingCycleDetailDto) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        val spendTxns = cycle.transactions.filter { it.type == "spend" }
        val refundTxns = cycle.transactions.filter { it.type == "refund" }

        // Summary
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            color = Elevated
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text("Total Transactions", color = Muted, fontSize = 12.sp)
                    Text(
                        "${cycle.transactions.size}",
                        color = OnDark,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("Total Spend", color = Muted, fontSize = 12.sp)
                    Text(
                        money(cycle.total_spend),
                        color = Danger,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                if (cycle.total_refunds > 0) {
                    Column(horizontalAlignment = Alignment.End) {
                        Text("Total Refunds", color = Muted, fontSize = 12.sp)
                        Text(
                            money(cycle.total_refunds),
                            color = Success,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        // Spend Transactions
        if (spendTxns.isNotEmpty()) {
            TransactionSection(title = "Spend", transactions = spendTxns)
        }

        // Refund Transactions
        if (refundTxns.isNotEmpty()) {
            TransactionSection(title = "Refunds", transactions = refundTxns)
        }

        if (cycle.transactions.isEmpty()) {
            EmptyState("No transactions in this cycle")
        }
    }
}

@Composable
private fun TransactionSection(title: String, transactions: List<TransactionDto>) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            title,
            color = Gold,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(vertical = 4.dp)
        )
        transactions.sortedByDescending { it.txn_date }.forEach { txn ->
            TransactionItem(txn)
        }
    }
}

@Composable
private fun TransactionItem(txn: TransactionDto) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = Elevated
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        txn.merchant,
                        color = OnDark,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium
                    )
                    if (txn.is_paid) {
                        Surface(
                            color = Success.copy(alpha = 0.2f),
                            shape = RoundedCornerShape(4.dp)
                        ) {
                            Text(
                                "PAID",
                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                                color = Success,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
                Text(
                    formatDate(txn.txn_date),
                    color = Muted,
                    fontSize = 12.sp
                )
            }
            Text(
                if (txn.type == "refund") "+${money(txn.amount.toDoubleOrNull() ?: 0.0)}"
                else "−${money(txn.amount.toDoubleOrNull() ?: 0.0)}",
                color = if (txn.type == "refund") Success else Danger,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun PaymentsTab(cycle: BillingCycleDetailDto) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Summary
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            color = Elevated
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text("Total Payments", color = Muted, fontSize = 12.sp)
                    Text(
                        "${cycle.card_payments.size}",
                        color = OnDark,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("Amount Paid", color = Muted, fontSize = 12.sp)
                    Text(
                        money(cycle.card_payments.sumOf { it.amount }),
                        color = Success,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        // Payment List
        if (cycle.card_payments.isNotEmpty()) {
            cycle.card_payments.sortedByDescending { it.payment_date }.forEach { payment ->
                PaymentItem(payment)
            }
        } else {
            EmptyState("No payments recorded for this cycle")
        }
    }
}

@Composable
private fun PaymentItem(payment: CardPaymentItemDto) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = Elevated
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Success.copy(alpha = 0.2f),
                    modifier = Modifier.size(40.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text("💰", fontSize = 18.sp)
                    }
                }
                Column {
                    Text(
                        payment.holder_name,
                        color = OnDark,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            formatDate(payment.payment_date),
                            color = Muted,
                            fontSize = 12.sp
                        )
                        if (payment.notes != null) {
                            Text("•", color = Muted, fontSize = 12.sp)
                            Text(
                                payment.notes,
                                color = Muted,
                                fontSize = 11.sp,
                                maxLines = 1
                            )
                        }
                    }
                }
            }
            Text(
                "+${money(payment.amount)}",
                color = Success,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun ActionButtons(
    cycle: BillingCycleDetailDto,
    onMarkAsPaid: () -> Unit,
    onCloseCycle: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (cycle.status != "paid") {
            Button(
                onClick = onMarkAsPaid,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Success,
                    contentColor = OnDark
                ),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text("Mark as Paid", fontWeight = FontWeight.Bold)
            }
        }

        OutlinedButton(
            onClick = onCloseCycle,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Gold),
            border = androidx.compose.foundation.BorderStroke(1.dp, Gold.copy(alpha = 0.5f)),
            shape = RoundedCornerShape(8.dp)
        ) {
            Text("Close Cycle", fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun EmptyState(message: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(32.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            message,
            color = Muted,
            fontSize = 14.sp,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun EditStatementAmountDialog(
    currentAmount: Double,
    onDismiss: () -> Unit,
    onConfirm: (Double) -> Unit
) {
    var amountStr by remember { mutableStateOf(currentAmount.toString()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Statement Amount", color = OnDark) },
        text = {
            OutlinedTextField(
                value = amountStr,
                onValueChange = { amountStr = it },
                label = { Text("Statement Amount") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val amount = amountStr.toDoubleOrNull()
                    if (amount != null && amount > 0) {
                        onConfirm(amount)
                    }
                }
            ) {
                Text("Save", color = Gold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = Muted)
            }
        },
        containerColor = Surface1
    )
}

@Composable
private fun EditNotesDialog(
    currentNotes: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var notes by remember { mutableStateOf(currentNotes) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Cycle Notes", color = OnDark) },
        text = {
            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text("Notes") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                maxLines = 5
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(notes) }) {
                Text("Save", color = Gold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = Muted)
            }
        },
        containerColor = Surface1
    )
}

@Composable
private fun MarkAsPaidDialog(
    cycle: BillingCycleDetailDto,
    onDismiss: () -> Unit,
    onConfirm: (Double, String) -> Unit
) {
    val remaining = cycle.statement_amount - cycle.paid_amount
    var amountStr by remember { mutableStateOf(remaining.toString()) }
    var dateStr by remember { mutableStateOf(LocalDate.now().toString()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Mark as Paid", color = OnDark) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = amountStr,
                    onValueChange = { amountStr = it },
                    label = { Text("Amount Paid") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                OutlinedTextField(
                    value = dateStr,
                    onValueChange = { dateStr = it },
                    label = { Text("Payment Date (yyyy-MM-dd)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val amount = amountStr.toDoubleOrNull()
                    if (amount != null && amount > 0) {
                        onConfirm(amount, dateStr)
                    }
                }
            ) {
                Text("Confirm", color = Success)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = Muted)
            }
        },
        containerColor = Surface1
    )
}

@Composable
private fun CloseCycleDialog(
    onDismiss: () -> Unit,
    onConfirm: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Close Billing Cycle", color = OnDark) },
        text = {
            Text(
                "Closing this cycle will lock it and prevent further modifications. This action cannot be undone. Continue?",
                color = Muted
            )
        },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text("Close Cycle", color = Danger, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = Muted)
            }
        },
        containerColor = Surface1
    )
}

// Helper functions
private fun formatDate(dateStr: String): String {
    return try {
        val date = LocalDate.parse(dateStr)
        val formatter = DateTimeFormatter.ofPattern("dd MMM yyyy")
        date.format(formatter)
    } catch (e: Exception) {
        dateStr
    }
}

private fun formatDateRange(start: String, end: String): String {
    return try {
        val startDate = LocalDate.parse(start)
        val endDate = LocalDate.parse(end)
        val formatter = DateTimeFormatter.ofPattern("dd MMM")
        "${startDate.format(formatter)} - ${endDate.format(formatter)}"
    } catch (e: Exception) {
        "$start - $end"
    }
}

private fun calculateDaysUntil(dateStr: String): Long {
    return try {
        val targetDate = LocalDate.parse(dateStr)
        val today = LocalDate.now()
        ChronoUnit.DAYS.between(today, targetDate)
    } catch (e: Exception) {
        0
    }
}

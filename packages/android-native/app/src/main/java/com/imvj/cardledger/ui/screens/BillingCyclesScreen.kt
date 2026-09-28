package com.imvj.cardledger.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.BillingCycleDto
import com.imvj.cardledger.data.net.CardDto
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.components.money
import com.imvj.cardledger.ui.theme.*
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

// ViewModel
data class BillingCyclesUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val cycles: List<BillingCycleDto> = emptyList(),
    val cards: List<CardDto> = emptyList(),
    val selectedCardId: String? = null,
    val selectedStatus: String = "All",
    val error: String? = null,
)

class BillingCyclesViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(BillingCyclesUiState())
    val state: StateFlow<BillingCyclesUiState> = _state

    fun load(forceRefresh: Boolean = false) {
        viewModelScope.launch {
            if (forceRefresh) {
                _state.value = _state.value.copy(isRefreshing = true)
            } else {
                _state.value = _state.value.copy(loading = true)
            }

            val cardsD = async { c.cardRepo.list().getOrElse { emptyList() } }
            val cyclesD = async {
                val cardFilter = _state.value.selectedCardId
                val statusFilter = if (_state.value.selectedStatus == "All") null else _state.value.selectedStatus.lowercase()
                c.billingCycleRepo.list(cardFilter, statusFilter).getOrElse { emptyList() }
            }

            val cards = cardsD.await()
            val cycles = cyclesD.await()

            _state.value = _state.value.copy(
                loading = false,
                isRefreshing = false,
                cycles = cycles.sortedByDescending { it.statement_date },
                cards = cards,
                error = null
            )
        }
    }

    fun setCardFilter(cardId: String?) {
        _state.value = _state.value.copy(selectedCardId = cardId)
        load()
    }

    fun setStatusFilter(status: String) {
        _state.value = _state.value.copy(selectedStatus = status)
        load()
    }
}

// Screen
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BillingCyclesScreen(nav: NavHostController) {
    val c = app().container
    val vm: BillingCyclesViewModel = viewModel(factory = viewModelFactory {
        initializer { BillingCyclesViewModel(c) }
    })

    LifecycleResumeEffect(Unit) {
        vm.load()
        onPauseOrDispose { }
    }

    val s by vm.state.collectAsStateWithLifecycle()

    Scaffold(
        containerColor = Base,
        topBar = {
            TopAppBar(
                title = { Text("Billing Cycles", color = OnDark) },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = OnDark
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Base)
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { /* TODO: Navigate to create billing cycle screen */ },
                containerColor = Gold,
                shape = CircleShape
            ) {
                Text("+", fontSize = 26.sp, color = Base, fontWeight = FontWeight.Bold)
            }
        }
    ) { innerPadding ->
        AnimatedContent(
            targetState = s.loading && s.cycles.isEmpty(),
            label = "cyclesContentSwitch",
            transitionSpec = { fadeIn() togetherWith fadeOut() }
        ) { isInitialLoading ->
            if (isInitialLoading) {
                Box(
                    Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Gold)
                }
            } else if (s.cycles.isEmpty()) {
                Box(
                    Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.padding(32.dp)
                    ) {
                        Text(
                            "No billing cycles yet",
                            color = Muted,
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            "Track your credit card billing cycles and payment due dates here.",
                            color = MutedLow,
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center
                        )
                        Spacer(Modifier.height(8.dp))
                        Button(
                            onClick = { /* TODO: Navigate to create cycle */ },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Gold,
                                contentColor = Base
                            ),
                            shape = MaterialTheme.shapes.medium
                        ) {
                            Text("Create Cycle", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            } else {
                PullToRefreshBox(
                    isRefreshing = s.isRefreshing,
                    onRefresh = { vm.load(forceRefresh = true) },
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                ) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = 96.dp)
                    ) {
                        // Filter chips section
                        item {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 20.dp, vertical = 16.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                // Card filter chips
                                Text(
                                    "Filter by Card",
                                    color = Muted,
                                    style = MaterialTheme.typography.labelSmall,
                                    letterSpacing = 1.sp
                                )
                                LazyRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    item {
                                        FilterChip(
                                            selected = s.selectedCardId == null,
                                            onClick = { vm.setCardFilter(null) },
                                            label = { Text("All Cards") },
                                            colors = FilterChipDefaults.filterChipColors(
                                                selectedContainerColor = Gold.copy(alpha = 0.2f),
                                                selectedLabelColor = Gold,
                                                containerColor = Elevated,
                                                labelColor = Muted
                                            )
                                        )
                                    }
                                    items(s.cards) { card ->
                                        FilterChip(
                                            selected = s.selectedCardId == card.id,
                                            onClick = { vm.setCardFilter(card.id) },
                                            label = { Text(card.nickname) },
                                            colors = FilterChipDefaults.filterChipColors(
                                                selectedContainerColor = Gold.copy(alpha = 0.2f),
                                                selectedLabelColor = Gold,
                                                containerColor = Elevated,
                                                labelColor = Muted
                                            )
                                        )
                                    }
                                }

                                // Status filter chips
                                Text(
                                    "Filter by Status",
                                    color = Muted,
                                    style = MaterialTheme.typography.labelSmall,
                                    letterSpacing = 1.sp
                                )
                                LazyRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    val statuses = listOf("All", "Projected", "Generated", "Paid", "Overdue")
                                    items(statuses) { status ->
                                        FilterChip(
                                            selected = s.selectedStatus == status,
                                            onClick = { vm.setStatusFilter(status) },
                                            label = { Text(status) },
                                            colors = FilterChipDefaults.filterChipColors(
                                                selectedContainerColor = Gold.copy(alpha = 0.2f),
                                                selectedLabelColor = Gold,
                                                containerColor = Elevated,
                                                labelColor = Muted
                                            )
                                        )
                                    }
                                }
                            }
                        }

                        // Cycles list
                        items(s.cycles, key = { it.id }) { cycle ->
                            val card = s.cards.firstOrNull { it.id == cycle.card_id }
                            BillingCycleCard(
                                cycle = cycle,
                                cardName = card?.nickname ?: "Unknown Card",
                                onClick = {
                                    // TODO: Navigate to billing cycle detail screen
                                    // nav.navigate("${Routes.BILLING_CYCLE_DETAIL}/${cycle.id}")
                                }
                            )
                        }
                    }
                }
            }
        }

        // Error message
        s.error?.let { error ->
            Snackbar(
                modifier = Modifier.padding(16.dp),
                containerColor = Danger,
                contentColor = OnDark
            ) {
                Text(error)
            }
        }
    }
}

@Composable
fun BillingCycleCard(
    cycle: BillingCycleDto,
    cardName: String,
    onClick: () -> Unit
) {
    val statusColor = when (cycle.status.lowercase()) {
        "projected" -> Warning
        "generated" -> Gold
        "paid" -> Success
        "overdue" -> Danger
        else -> Muted
    }

    val daysUntilDue = try {
        val dueDate = LocalDate.parse(cycle.payment_due_date, DateTimeFormatter.ISO_DATE)
        val today = LocalDate.now()
        ChronoUnit.DAYS.between(today, dueDate).toInt()
    } catch (e: Exception) {
        0
    }

    val dueDateText = when {
        daysUntilDue < 0 -> "Overdue by ${-daysUntilDue} day${if (-daysUntilDue != 1) "s" else ""}"
        daysUntilDue == 0 -> "Due today"
        daysUntilDue == 1 -> "Due tomorrow"
        else -> "Due in $daysUntilDue days"
    }

    val cyclePeriod = try {
        val start = LocalDate.parse(cycle.cycle_start, DateTimeFormatter.ISO_DATE)
        val end = LocalDate.parse(cycle.cycle_end, DateTimeFormatter.ISO_DATE)
        "${start.format(DateTimeFormatter.ofPattern("MMM d"))} - ${end.format(DateTimeFormatter.ofPattern("MMM d"))}"
    } catch (e: Exception) {
        "${cycle.cycle_start} - ${cycle.cycle_end}"
    }

    val paidProgress = if (cycle.statement_amount > 0) {
        (cycle.paid_amount / cycle.statement_amount).coerceIn(0.0, 1.0).toFloat()
    } else {
        0f
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 6.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(16.dp),
        color = Surface1,
        tonalElevation = 2.dp
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header: Status badge + Card name
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        cardName,
                        color = OnDark,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        cyclePeriod,
                        color = Muted,
                        style = MaterialTheme.typography.labelMedium,
                        fontSize = 12.sp
                    )
                }

                // Status badge
                Surface(
                    color = statusColor.copy(alpha = 0.15f),
                    shape = RoundedCornerShape(6.dp),
                    border = androidx.compose.foundation.BorderStroke(
                        1.dp,
                        statusColor.copy(alpha = 0.4f)
                    )
                ) {
                    Text(
                        cycle.status.uppercase(),
                        color = statusColor,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        letterSpacing = 0.5.sp
                    )
                }
            }

            HorizontalDivider(color = SurfaceTint, thickness = 1.dp)

            // Amount and due date
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        "Statement Amount",
                        color = Muted,
                        style = MaterialTheme.typography.labelSmall,
                        fontSize = 11.sp
                    )
                    Text(
                        money(cycle.statement_amount),
                        color = OnDark,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    if (cycle.paid_amount > 0) {
                        Text(
                            "Paid: ${money(cycle.paid_amount)}",
                            color = Success,
                            style = MaterialTheme.typography.labelSmall,
                            fontSize = 10.sp
                        )
                    }
                }

                Column(
                    horizontalAlignment = Alignment.End,
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Text(
                        "Payment Due",
                        color = Muted,
                        style = MaterialTheme.typography.labelSmall,
                        fontSize = 11.sp
                    )
                    Text(
                        try {
                            LocalDate.parse(cycle.payment_due_date, DateTimeFormatter.ISO_DATE)
                                .format(DateTimeFormatter.ofPattern("MMM d, yyyy"))
                        } catch (e: Exception) {
                            cycle.payment_due_date
                        },
                        color = OnDark,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        dueDateText,
                        color = when {
                            daysUntilDue < 0 -> Danger
                            daysUntilDue <= 3 -> Warning
                            else -> Success
                        },
                        style = MaterialTheme.typography.labelSmall,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            // Payment progress bar
            if (cycle.paid_amount > 0) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            "Payment Progress",
                            color = Muted,
                            style = MaterialTheme.typography.labelSmall,
                            fontSize = 10.sp
                        )
                        Text(
                            "${(paidProgress * 100).toInt()}%",
                            color = Success,
                            style = MaterialTheme.typography.labelSmall,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(Elevated)
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(paidProgress)
                                .fillMaxHeight()
                                .clip(RoundedCornerShape(3.dp))
                                .background(Success)
                        )
                    }
                }
            }

            // Transaction and payment counts
            if ((cycle.transaction_count ?: 0) > 0 || (cycle.card_payment_count ?: 0) > 0) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    if ((cycle.transaction_count ?: 0) > 0) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("💳", fontSize = 14.sp)
                            Text(
                                "${cycle.transaction_count} transaction${if (cycle.transaction_count != 1) "s" else ""}",
                                color = Muted,
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 11.sp
                            )
                        }
                    }
                    if ((cycle.card_payment_count ?: 0) > 0) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("💰", fontSize = 14.sp)
                            Text(
                                "${cycle.card_payment_count} payment${if (cycle.card_payment_count != 1) "s" else ""}",
                                color = Muted,
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 11.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

package com.imvj.cardledger.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController

import com.imvj.cardledger.feature.SmsViewModel
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.nav.BottomBar
import com.imvj.cardledger.ui.nav.Routes
import com.imvj.cardledger.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun SmsScreen(nav: NavHostController) {
    val ctx = LocalContext.current
    val c = app().container
    val scope = rememberCoroutineScope()

    val vm: SmsViewModel = viewModel(factory = viewModelFactory {
        initializer { SmsViewModel(c) }
    })
    val s by vm.state.collectAsStateWithLifecycle()
    val review by c.reviewStore.queue.collectAsStateWithLifecycle()

    fun hasPermission(p: String) =
        ContextCompat.checkSelfPermission(ctx, p) == PackageManager.PERMISSION_GRANTED

    var granted by remember {
        mutableStateOf(
            hasPermission(Manifest.permission.READ_SMS) && hasPermission(Manifest.permission.RECEIVE_SMS)
        )
    }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        granted = result.values.all { it }
        if (granted) scope.launch { c.prefsStore.setSmsSetup(true) }
    }

    Scaffold(
        bottomBar = { BottomBar(nav, review.size) }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("SMS Import", fontSize = 22.sp, fontWeight = FontWeight.Bold)

            // SMS Statistics & Intelligence Radar
            val stats = s.stats
            if (stats != null) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
                    color = com.imvj.cardledger.ui.theme.Surface1,
                    border = androidx.compose.foundation.BorderStroke(1.dp, com.imvj.cardledger.ui.theme.Elevated)
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("📊 SMS Intelligence Radar", color = com.imvj.cardledger.ui.theme.Gold, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            StatBox("Total Scanned", "${stats.totalScanned}", Modifier.weight(1f))
                            Spacer(Modifier.width(8.dp))
                            StatBox("OTPs Filtered", "${stats.otpsIgnored}", Modifier.weight(1f))
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            StatBox("Auto-Imported", "${stats.importedCount}", Modifier.weight(1f))
                            Spacer(Modifier.width(8.dp))
                            StatBox("In Review Queue", "${stats.queuedCount}", Modifier.weight(1f))
                        }
                        if (stats.byBank.isNotEmpty()) {
                            HorizontalDivider(color = com.imvj.cardledger.ui.theme.Elevated)
                            Text("Bank Detection Breakdown", color = com.imvj.cardledger.ui.theme.OnDark, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            stats.byBank.entries.sortedByDescending { it.value }.forEach { (bank, count) ->
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(bank, color = com.imvj.cardledger.ui.theme.Muted, fontSize = 12.sp)
                                    Text("$count msgs", color = com.imvj.cardledger.ui.theme.OnDark, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            } else {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
                    color = com.imvj.cardledger.ui.theme.Surface1,
                    border = androidx.compose.foundation.BorderStroke(1.dp, com.imvj.cardledger.ui.theme.Elevated)
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("🛡️ On-Device SMS Intelligence", color = com.imvj.cardledger.ui.theme.Gold, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                        Text("• 100% Private: SMS data is processed locally with Kotlin regex & AI parsers.\n• OTP Shield: 2FA codes and personal messages are automatically discarded.\n• Smart Dedup: Prevents duplicate entries across spend alerts and OTP SMS.", color = com.imvj.cardledger.ui.theme.Muted, fontSize = 12.sp, lineHeight = 18.sp)
                    }
                }
            }

            if (!granted) {
                Text(
                    "CardLedger reads bank SMS to auto-import transactions. Messages never leave this device.",
                    color = Muted,
                    fontSize = 14.sp,
                )
                Button(
                    onClick = {
                        launcher.launch(
                            arrayOf(Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS)
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Grant SMS access")
                }
            } else {
                var expanded by remember { mutableStateOf(false) }
                val options = listOf("Current Month", "1 Week (7 days)", "1 Month (30 days)", "2 Months (60 days)", "3 Months (90 days)")
                var selectedOption by remember { mutableStateOf("1 Week (7 days)") }

                @OptIn(ExperimentalMaterial3Api::class)
                ExposedDropdownMenuBox(
                    expanded = expanded,
                    onExpandedChange = { expanded = it },
                ) {
                    OutlinedTextField(
                        value = selectedOption,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Scan range") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                        modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
                        enabled = !s.scanning
                    )
                    ExposedDropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { expanded = false },
                    ) {
                        options.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option) },
                                onClick = {
                                    selectedOption = option
                                    expanded = false
                                },
                            )
                        }
                    }
                }

                Button(
                    onClick = {
                        val days = when (selectedOption) {
                            "Current Month" -> java.util.Calendar.getInstance().get(java.util.Calendar.DAY_OF_MONTH)
                            "1 Week (7 days)" -> 7
                            "1 Month (30 days)" -> 30
                            "2 Months (60 days)" -> 60
                            else -> 90
                        }
                        vm.scan(ctx, days)
                    },
                    enabled = !s.scanning,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (s.scanning) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                        Text("Scanning…")
                    } else {
                        Text("Scan inbox")
                    }
                }

                s.summary?.let {
                    Text(it, color = Success, fontSize = 14.sp)
                }
            }

            if (review.isNotEmpty()) {
                Button(
                    onClick = { nav.navigate(Routes.REVIEW) },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Review queue (${review.size})")
                }
            }
        }
    }
}

@Composable
private fun StatBox(label: String, valStr: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(10.dp),
        color = com.imvj.cardledger.ui.theme.Elevated.copy(alpha = 0.5f)
    ) {
        Column(Modifier.padding(10.dp)) {
            Text(label, color = com.imvj.cardledger.ui.theme.Muted, fontSize = 11.sp)
            Text(valStr, color = com.imvj.cardledger.ui.theme.OnDark, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
    }
}

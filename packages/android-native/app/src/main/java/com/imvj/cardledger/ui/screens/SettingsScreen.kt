package com.imvj.cardledger.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import com.imvj.cardledger.feature.SettingsViewModel
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.components.PinPad
import com.imvj.cardledger.ui.lock.AppLock
import com.imvj.cardledger.ui.nav.BottomBar
import com.imvj.cardledger.ui.nav.Routes
import com.imvj.cardledger.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(nav: NavHostController) {
    val c = app().container
    val vm: SettingsViewModel = viewModel(factory = viewModelFactory { initializer { SettingsViewModel(c) } })
    LaunchedEffect(Unit) { vm.load() }
    val s by vm.state.collectAsState()

    var showPin by remember { mutableStateOf(false) }

    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}

    Scaffold(bottomBar = { BottomBar(nav, 0) }) { innerPadding ->
        Column(
            Modifier
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Settings", style = MaterialTheme.typography.headlineMedium)

            Surface(shape = MaterialTheme.shapes.large, color = Surface1) {
                Column {
                    // Lock app now
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable { AppLock.lock() }
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Lock app now")
                    }

                    HorizontalDivider(color = Elevated)

                    // Set / Change PIN
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable { showPin = true }
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(if (s.pinSet) "Change PIN" else "Set PIN")
                    }

                    HorizontalDivider(color = Elevated)

                    // Biometric unlock
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Biometric unlock")
                        Switch(checked = s.biometric, onCheckedChange = { vm.toggleBiometric() })
                    }

                    HorizontalDivider(color = Elevated)

                    // Due-date reminders
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Due-date reminders")
                        Switch(
                            checked = s.reminders,
                            onCheckedChange = { enabled ->
                                if (enabled && Build.VERSION.SDK_INT >= 33) {
                                    notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                                }
                                vm.toggleReminders()
                            },
                        )
                    }

                    if (s.reminders) {
                        HorizontalDivider(color = Elevated)
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("Remind days before")
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                listOf(1, 2, 3, 5, 7).forEach { n ->
                                    Box(
                                        Modifier
                                            .size(32.dp)
                                            .clip(CircleShape)
                                            .background(if (s.reminderDays == n) Gold else Elevated)
                                            .clickable { vm.setReminderDays(n) },
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Text("$n", color = if (s.reminderDays == n) Base else Muted)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            Surface(shape = MaterialTheme.shapes.large, color = Surface1) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { vm.signOut { nav.navigate(Routes.LOGIN) { popUpTo(0) } } }
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Sign out", color = Danger)
                }
            }
        }
    }

    if (showPin) {
        @OptIn(ExperimentalMaterial3Api::class)
        ModalBottomSheet(onDismissRequest = { showPin = false }) {
            Box(Modifier.padding(24.dp)) {
                PinPad(label = "Enter new PIN") { pin ->
                    vm.setPin(pin)
                    showPin = false
                }
            }
        }
    }
}

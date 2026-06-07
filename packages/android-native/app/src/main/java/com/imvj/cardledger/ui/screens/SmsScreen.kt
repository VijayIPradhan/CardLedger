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
import com.imvj.cardledger.data.store.ReviewStore
import com.imvj.cardledger.feature.SmsViewModel
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.nav.BottomBar
import com.imvj.cardledger.ui.nav.Routes
import com.imvj.cardledger.ui.theme.Muted
import com.imvj.cardledger.ui.theme.Success
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
    val review by ReviewStore.queue.collectAsStateWithLifecycle()

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
                Button(
                    onClick = { vm.scan(ctx) },
                    enabled = !s.scanning,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (s.scanning) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                        Text("Scanning…")
                    } else {
                        Text("Scan inbox (90 days)")
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

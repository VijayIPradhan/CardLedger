package com.imvj.cardledger.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.fragment.app.FragmentActivity
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.components.PinPad
import com.imvj.cardledger.ui.lock.BioResult
import com.imvj.cardledger.ui.lock.authenticate
import kotlinx.coroutines.launch

@Composable
fun LockScreen(onUnlocked: () -> Unit) {
    val c = app().container
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var showPin by remember { mutableStateOf(false) }
    var pinSet by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        pinSet = c.prefsStore.isPinSet()
        val bioOn = c.prefsStore.biometricEnabled()
        if (!pinSet) { showPin = true; return@LaunchedEffect }
        if (bioOn && ctx is FragmentActivity) {
            when (authenticate(ctx)) {
                BioResult.SUCCESS -> onUnlocked()
                else -> showPin = true
            }
        } else showPin = true
    }

    Surface(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            if (showPin) {
                PinPad(
                    label = if (pinSet) "Enter PIN to unlock" else "Set a 6-digit PIN",
                    error = error,
                ) { pin ->
                    scope.launch {
                        if (!pinSet) { c.prefsStore.setPin(pin); onUnlocked() }
                        else if (c.prefsStore.verifyPin(pin)) onUnlocked()
                        else error = "Wrong PIN — try again"
                    }
                }
            }
        }
    }
}

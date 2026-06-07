package com.imvj.cardledger.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.components.PinPad
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChangePinScreen(nav: NavHostController) {
    val c = app().container
    val scope = rememberCoroutineScope()
    var pinSet by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) { pinSet = c.prefsStore.isPinSet() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (pinSet) "Change PIN" else "Set PIN") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(
            Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentAlignment = Alignment.Center,
        ) {
            PinPad(label = "Enter a new 6-digit PIN") { pin ->
                scope.launch {
                    c.prefsStore.setPin(pin)
                    nav.popBackStack()
                }
            }
        }
    }
}

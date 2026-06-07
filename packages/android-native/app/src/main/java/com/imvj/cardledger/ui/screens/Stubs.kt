package com.imvj.cardledger.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController

@Composable private fun Stub(name: String) =
    Surface(Modifier.fillMaxSize()) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(name) } }

@Composable fun HoldersScreen(nav: NavHostController) = Stub("Holders")
@Composable fun SettingsScreen(nav: NavHostController) = Stub("Settings")
@Composable fun SmsScreen(nav: NavHostController) = Stub("SMS")
@Composable fun ReviewScreen(nav: NavHostController) = Stub("Review")

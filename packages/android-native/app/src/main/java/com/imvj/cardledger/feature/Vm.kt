package com.imvj.cardledger.feature

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import com.imvj.cardledger.CardLedgerApp

@Composable
fun app(): CardLedgerApp = LocalContext.current.applicationContext as CardLedgerApp

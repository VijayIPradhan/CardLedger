package com.imvj.cardledger.ui.nav

import androidx.compose.runtime.*
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.lock.AppLock
import com.imvj.cardledger.ui.screens.*
import kotlinx.coroutines.flow.map

@Composable
fun AppNav() {
    val nav = rememberNavController()
    val container = app().container
    // Live token state — recomposes immediately after login (set) and sign-out (clear),
    // so the lock overlay shows after the first login and the user returns to Login on sign-out.
    val hasToken by container.tokenStore.tokenFlow
        .map { it != null }
        .collectAsState(initial = null)
    val locked by AppLock.locked.collectAsState()

    val token = hasToken ?: return
    val start = if (!token) Routes.LOGIN else Routes.HOME

    NavHost(navController = nav, startDestination = start) {
        composable(Routes.LOGIN) {
            LoginScreen(onSuccess = {
                AppLock.lock()
                nav.navigate(Routes.HOME) { popUpTo(Routes.LOGIN) { inclusive = true } }
            })
        }
        composable(Routes.HOME) { HomeScreen(nav) }
        composable(Routes.HOLDERS) { HoldersScreen(nav) }
        composable(Routes.SETTINGS) { SettingsScreen(nav) }
        composable(Routes.CHANGE_PIN) { ChangePinScreen(nav) }
        composable(Routes.SMS) { SmsScreen(nav) }
        composable(Routes.REVIEW) { ReviewScreen(nav) }
        composable(Routes.ADD_CARD) { AddEditCardScreen(nav, null) }
        composable("${Routes.ADD_CARD}?id={id}") { AddEditCardScreen(nav, it.arguments?.getString("id")) }
        composable("${Routes.CARD_DETAIL}/{id}") { CardDetailScreen(nav, it.arguments?.getString("id")!!) }
    }

    if (locked && token) {
        LockScreen(onUnlocked = { AppLock.unlock() })
    }
}

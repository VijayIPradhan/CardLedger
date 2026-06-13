package com.imvj.cardledger.ui.nav

import androidx.compose.runtime.*
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.imvj.cardledger.feature.HomeViewModel
import com.imvj.cardledger.feature.app
import com.imvj.cardledger.ui.lock.AppLock
import com.imvj.cardledger.ui.screens.*
import kotlinx.coroutines.flow.map

@Composable
fun AppNav() {
    val nav = rememberNavController()
    val container = app().container
    // Live token state — recomposes immediately after login (set) and sign-out (clear).
    val hasToken by container.tokenStore.tokenFlow
        .map { it != null }
        .collectAsState(initial = null)
    val locked by AppLock.locked.collectAsState()

    val token = hasToken ?: return
    val start = if (!token) Routes.LOGIN else Routes.HOME

    // Single HomeViewModel shared across Home / Cards / Analytics so all three tabs
    // reflect the same data and only one set of API calls fires per refresh.
    val homeVm: HomeViewModel = viewModel(factory = viewModelFactory {
        initializer { HomeViewModel(container) }
    })

    NavHost(navController = nav, startDestination = start) {
        composable(Routes.LOGIN) {
            LoginScreen(onSuccess = {
                AppLock.unlock()
                nav.navigate(Routes.HOME) { popUpTo(Routes.LOGIN) { inclusive = true } }
            })
        }
        composable(Routes.HOME) { HomeScreen(nav, homeVm) }
        composable(Routes.HOLDERS) { HoldersScreen(nav) }
        composable(Routes.SETTINGS) { SettingsScreen(nav) }
        composable(Routes.CHANGE_PIN) { ChangePinScreen(nav) }
        composable(Routes.SMS) { SmsScreen(nav) }
        composable(Routes.REVIEW) { ReviewScreen(nav) }
        composable(Routes.ADD_CARD) { AddEditCardScreen(nav, null) }
        composable("${Routes.ADD_CARD}?id={id}") { AddEditCardScreen(nav, it.arguments?.getString("id")) }
        composable("${Routes.CARD_DETAIL}/{id}") { CardDetailScreen(nav, it.arguments?.getString("id")!!) }
        composable(Routes.SEARCH) { SearchScreen(nav) }
        composable(Routes.CARDS) { CardsScreen(nav, homeVm) }
        composable(Routes.ANALYTICS) { AnalyticsScreen(nav, homeVm) }
    }

    if (locked && token) {
        LockScreen(onUnlocked = { AppLock.unlock() })
    }
}

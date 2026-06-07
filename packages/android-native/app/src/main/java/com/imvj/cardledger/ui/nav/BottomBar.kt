package com.imvj.cardledger.ui.nav

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState

@Composable
fun BottomBar(nav: NavHostController, reviewCount: Int) {
    val items = listOf(
        Triple(Routes.HOME, "Home", Icons.Filled.Home),
        Triple(Routes.HOLDERS, "Holders", Icons.Filled.People),
        Triple(Routes.SETTINGS, "Settings", Icons.Filled.Settings),
        Triple(Routes.SMS, "SMS", Icons.Filled.Email),
    )
    val current = nav.currentBackStackEntryAsState().value?.destination?.route
    NavigationBar {
        items.forEach { (route, label, icon) ->
            NavigationBarItem(
                selected = current == route,
                onClick = { if (current != route) nav.navigate(route) { launchSingleTop = true; popUpTo(Routes.HOME) } },
                icon = {
                    if (route == Routes.SMS && reviewCount > 0)
                        BadgedBox(badge = { Badge { Text(if (reviewCount > 9) "9+" else "$reviewCount") } }) { Icon(icon, label) }
                    else Icon(icon, label)
                },
                label = { Text(label) },
            )
        }
    }
}

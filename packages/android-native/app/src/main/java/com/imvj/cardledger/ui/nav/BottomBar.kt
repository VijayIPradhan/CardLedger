package com.imvj.cardledger.ui.nav

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.List
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.imvj.cardledger.ui.theme.Base
import com.imvj.cardledger.ui.theme.Elevated
import com.imvj.cardledger.ui.theme.Gold
import com.imvj.cardledger.ui.theme.Muted
import com.imvj.cardledger.ui.theme.Surface1

private data class NavItem(
    val route: String,
    val label: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector,
)

private val navItems = listOf(
    NavItem(Routes.HOME, "Home", Icons.Filled.Home, Icons.Outlined.Home),
    NavItem(Routes.ANALYTICS, "Analytics", Icons.Filled.BarChart, Icons.Outlined.BarChart),
    NavItem(Routes.CARDS, "Cards", Icons.Filled.CreditCard, Icons.Outlined.CreditCard),
    NavItem(Routes.BUDGETS, "Budgets", Icons.Filled.List, Icons.Outlined.List),
    NavItem(Routes.RECOMMENDER, "Recs", Icons.Filled.Star, Icons.Outlined.Star),
    NavItem(Routes.SMS, "Review", Icons.Filled.Email, Icons.Outlined.Email),
)

@Composable
fun BottomBar(nav: NavHostController, reviewCount: Int) {
    val current = nav.currentBackStackEntryAsState().value?.destination?.route

    NavigationBar(
        modifier = Modifier.height(64.dp),
        containerColor = Surface1,
        tonalElevation = 0.dp,
        windowInsets = WindowInsets(0),
    ) {
        navItems.forEach { item ->
            val selected = current == item.route
            val iconTint by animateColorAsState(
                targetValue = if (selected) Gold else Muted,
                animationSpec = tween(200),
                label = "navIconTint_${item.route}",
            )

            NavigationBarItem(
                selected = selected,
                onClick = {
                    if (current != item.route) {
                        nav.navigate(item.route) {
                            launchSingleTop = true
                            popUpTo(Routes.HOME)
                        }
                    }
                },
                icon = {
                    if (item.route == Routes.SMS && reviewCount > 0) {
                        BadgedBox(badge = {
                            Badge(containerColor = Gold, contentColor = Base) {
                                Text(if (reviewCount > 9) "9+" else "$reviewCount")
                            }
                        }) {
                            Icon(
                                if (selected) item.selectedIcon else item.unselectedIcon,
                                contentDescription = item.label,
                                tint = iconTint,
                            )
                        }
                    } else {
                        Icon(
                            if (selected) item.selectedIcon else item.unselectedIcon,
                            contentDescription = item.label,
                            tint = iconTint,
                        )
                    }
                },
                label = null, // No labels — icon-only nav, matches premium finance apps
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = Gold,
                    unselectedIconColor = Muted,
                    indicatorColor = Elevated,
                ),
            )
        }
    }
}

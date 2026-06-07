package com.imvj.cardledger.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp

private val DarkColors = darkColorScheme(
    primary = Gold,
    onPrimary = Base,
    background = Base,
    onBackground = OnDark,
    surface = Surface1,
    onSurface = OnDark,
    surfaceVariant = Elevated,
    error = Danger,
)

val AppShapes = Shapes(
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
)

@Composable
fun CardLedgerTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = DarkColors, typography = AppTypography, shapes = AppShapes, content = content)
}

package com.imvj.cardledger.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import com.imvj.cardledger.data.net.PaletteDto

// Near-black with a subtle cool/blue undertone — premium fintech feel (CRED-inspired)
val Base = Color(0xFF0C0C10)
val Surface1 = Color(0xFF14141A)
val Elevated = Color(0xFF1E1E28)
val SurfaceTint = Color(0xFF24243040)  // 25% alpha tint for separators
val Gold = Color(0xFFC8A96E)
val GoldHi = Color(0xFFD9BE85)
val GoldSubtle = Color(0x33C8A96E)    // 20% alpha gold for backgrounds
val Muted = Color(0xFF888899)
val MutedLow = Color(0xFF55556A)      // lower-contrast muted for less-important text
val Danger = Color(0xFFEF4444)
val DangerSubtle = Color(0x22EF4444)
val Success = Color(0xFF22C55E)
val SuccessSubtle = Color(0x2222C55E)
val Warning = Color(0xFFF59E0B)
val OnDark = Color(0xFFFFFFFF)
val OnDarkMid = Color(0xCCFFFFFF)     // 80% white for secondary text on card backgrounds

val VisaGrad = listOf(Color(0xFF1A237E), Color(0xFF283593))
val MastercardGrad = listOf(Color(0xFFB71C1C), Color(0xFFC62828))
val RupayGrad = listOf(Color(0xFF1B5E20), Color(0xFF2E7D32))
val AmexGrad = listOf(Color(0xFF006064), Color(0xFF00838F))
val DefaultGrad = listOf(Elevated, Surface1)

fun networkGradient(network: String): List<Color> = when (network) {
    "Visa" -> VisaGrad
    "Mastercard" -> MastercardGrad
    "RuPay" -> RupayGrad
    "Amex" -> AmexGrad
    else -> DefaultGrad
}

fun variantGradient(variant: String?, network: String): List<Color> {
    if (variant == null) return networkGradient(network)
    
    return when {
        // ICICI
        variant.contains("Coral", ignoreCase = true) -> listOf(Color(0xFFE53935), Color(0xFFC62828)) // Red/Coral
        variant.contains("Sapphiro", ignoreCase = true) -> listOf(Color(0xFF283593), Color(0xFF1A237E)) // Deep Blue
        variant.contains("Emeralde", ignoreCase = true) -> listOf(Color(0xFF2E7D32), Color(0xFF1B5E20)) // Dark Green
        variant.contains("Rubyx", ignoreCase = true) -> listOf(Color(0xFFD81B60), Color(0xFFAD1457)) // Pink/Red
        variant.contains("Amazon", ignoreCase = true) -> listOf(Color(0xFF212121), Color(0xFF0A0A0A)) // Black/Graphite
        
        // HDFC
        variant.contains("Infinia", ignoreCase = true) || variant.contains("Diners Club Black", ignoreCase = true) -> 
            listOf(Color(0xFF212121), Color(0xFF000000)) // Black/Dark Grey
        variant.contains("Regalia Gold", ignoreCase = true) -> listOf(Color(0xFFD4AF37), Color(0xFFAA8000)) // Gold
        variant.contains("Regalia", ignoreCase = true) -> listOf(Color(0xFF1565C0), Color(0xFF0D47A1)) // Dark Blue
        variant.contains("Millennia", ignoreCase = true) -> listOf(Color(0xFF5E35B1), Color(0xFF3949AB)) // Purple/Blue
        variant.contains("Swiggy", ignoreCase = true) -> listOf(Color(0xFFFF5722), Color(0xFFE64A19)) // Orange
        
        // SBI
        variant.contains("Cashback", ignoreCase = true) -> listOf(Color(0xFF00ACC1), Color(0xFF00838F)) // Teal
        variant.contains("SimplyCLICK", ignoreCase = true) -> listOf(Color(0xFFFFB300), Color(0xFFFB8C00)) // Yellow/Orange
        variant.contains("SimplySAVE", ignoreCase = true) -> listOf(Color(0xFF1E88E5), Color(0xFF1565C0)) // Blue
        variant.contains("Elite", ignoreCase = true) || variant.contains("Aurum", ignoreCase = true) -> 
            listOf(Color(0xFF455A64), Color(0xFF263238)) // Metallic/Dark Blue-Grey
        
        // Axis
        variant.contains("Flipkart", ignoreCase = true) -> listOf(Color(0xFF1976D2), Color(0xFF0D47A1)) // Blue
        variant.contains("Ace", ignoreCase = true) -> listOf(Color(0xFF000000), Color(0xFF1B5E20)) // Black/Green
        variant.contains("Magnus", ignoreCase = true) -> listOf(Color(0xFF4A148C), Color(0xFF311B92)) // Burgundy/Deep Purple
        variant.contains("Atlas", ignoreCase = true) -> listOf(Color(0xFFB71C1C), Color(0xFF880E4F)) // Deep Red
        
        // RBL Bank
        variant.contains("Icon", ignoreCase = true) || variant.contains("Platinum Maxima", ignoreCase = true) -> 
            listOf(Color(0xFF0D47A1), Color(0xFF1976D2)) // Blue
        
        // HSBC Bank
        variant.contains("Visa Platinum", ignoreCase = true) || variant.contains("Premier", ignoreCase = true) -> 
            listOf(Color(0xFF212121), Color(0xFFD32F2F)) // Black/Red
            
        // Default fallback
        else -> networkGradient(network)
    }
}

fun cardBrush(palette: PaletteDto?, variant: String?, network: String): Brush {
    if (palette != null) {
        try {
            val primary = Color(android.graphics.Color.parseColor(palette.primary_hex.replace("0x", "#")))
            val secondary = palette.secondary_hex?.let { Color(android.graphics.Color.parseColor(it.replace("0x", "#"))) }
            
            val colors = if (secondary != null) {
                listOf(primary, secondary)
            } else {
                val dark = Color(
                    red = (primary.red * 0.8f).coerceIn(0f, 1f),
                    green = (primary.green * 0.8f).coerceIn(0f, 1f),
                    blue = (primary.blue * 0.8f).coerceIn(0f, 1f),
                    alpha = primary.alpha
                )
                listOf(primary, dark)
            }
            
            return when (palette.gradient_direction?.lowercase()) {
                "horizontal" -> Brush.horizontalGradient(colors)
                "diagonal" -> Brush.linearGradient(colors)
                "vertical" -> Brush.verticalGradient(colors)
                else -> Brush.linearGradient(colors)
            }
        } catch (e: Exception) {
            // fallback
        }
    }
    return Brush.linearGradient(variantGradient(variant, network))
}

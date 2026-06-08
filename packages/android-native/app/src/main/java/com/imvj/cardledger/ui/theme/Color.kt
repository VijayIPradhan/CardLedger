package com.imvj.cardledger.ui.theme

import androidx.compose.ui.graphics.Color

val Base = Color(0xFF0A0A0A)
val Surface1 = Color(0xFF111111)
val Elevated = Color(0xFF1A1A1A)
val Gold = Color(0xFFC8A96E)
val GoldHi = Color(0xFFD9BE85)
val Muted = Color(0xFF8A8A8A)
val Danger = Color(0xFFE5484D)
val Success = Color(0xFF46A758)
val Warning = Color(0xFFE2A33C)
val OnDark = Color(0xFFFFFFFF)

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
        variant.contains("Amazon", ignoreCase = true) -> listOf(Color(0xFFFF9800), Color(0xFFF57C00)) // Orange
        
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

fun cardGradient(colorHex: String?, variant: String?, network: String): List<Color> {
    if (colorHex != null) {
        try {
            val c = Color(android.graphics.Color.parseColor(colorHex.replace("0x", "#")))
            // Create a subtle gradient from the solid color by darkening it slightly
            val dark = Color(
                red = (c.red * 0.8f).coerceIn(0f, 1f),
                green = (c.green * 0.8f).coerceIn(0f, 1f),
                blue = (c.blue * 0.8f).coerceIn(0f, 1f),
                alpha = c.alpha
            )
            return listOf(c, dark)
        } catch (e: Exception) {
            // fallback
        }
    }
    return variantGradient(variant, network)
}

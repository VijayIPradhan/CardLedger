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

package com.imvj.cardledger.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.googlefonts.Font
import androidx.compose.ui.text.googlefonts.GoogleFont
import androidx.compose.ui.unit.sp
import com.imvj.cardledger.R

private val provider = GoogleFont.Provider(
    providerAuthority = "com.google.android.gms.fonts",
    providerPackage = "com.google.android.gms",
    certificates = R.array.com_google_android_gms_fonts_certs,
)

private val SpaceGrotesk = GoogleFont("Space Grotesk")
private val Inter = GoogleFont("Inter")

val SpaceGroteskFamily: FontFamily = FontFamily(
    Font(googleFont = SpaceGrotesk, fontProvider = provider, weight = FontWeight.Normal),
    Font(googleFont = SpaceGrotesk, fontProvider = provider, weight = FontWeight.Medium),
    Font(googleFont = SpaceGrotesk, fontProvider = provider, weight = FontWeight.SemiBold),
    Font(googleFont = SpaceGrotesk, fontProvider = provider, weight = FontWeight.Bold),
    Font(googleFont = SpaceGrotesk, fontProvider = provider, weight = FontWeight.ExtraBold),
)

val InterFamily: FontFamily = FontFamily(
    Font(googleFont = Inter, fontProvider = provider, weight = FontWeight.Normal),
    Font(googleFont = Inter, fontProvider = provider, weight = FontWeight.Medium),
    Font(googleFont = Inter, fontProvider = provider, weight = FontWeight.SemiBold),
    Font(googleFont = Inter, fontProvider = provider, weight = FontWeight.Bold),
)

val AppTypography = Typography(
    // Display — hero amounts on summary cards
    displayLarge = TextStyle(fontFamily = SpaceGroteskFamily, fontWeight = FontWeight.Bold, fontSize = 57.sp, lineHeight = 64.sp),
    displayMedium = TextStyle(fontFamily = SpaceGroteskFamily, fontWeight = FontWeight.Bold, fontSize = 45.sp, lineHeight = 52.sp),
    displaySmall = TextStyle(fontFamily = SpaceGroteskFamily, fontWeight = FontWeight.Bold, fontSize = 36.sp, lineHeight = 44.sp),
    // Headline — screen titles, card amounts
    headlineLarge = TextStyle(fontFamily = SpaceGroteskFamily, fontWeight = FontWeight.Bold, fontSize = 32.sp, lineHeight = 40.sp),
    headlineMedium = TextStyle(fontFamily = SpaceGroteskFamily, fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 36.sp),
    headlineSmall = TextStyle(fontFamily = SpaceGroteskFamily, fontWeight = FontWeight.SemiBold, fontSize = 24.sp, lineHeight = 32.sp),
    // Title — section labels, bottom-sheet titles
    titleLarge = TextStyle(fontFamily = SpaceGroteskFamily, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp),
    titleMedium = TextStyle(fontFamily = InterFamily, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 24.sp, letterSpacing = 0.15.sp),
    titleSmall = TextStyle(fontFamily = InterFamily, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.1.sp),
    // Body — transaction rows, descriptions
    bodyLarge = TextStyle(fontFamily = InterFamily, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = InterFamily, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontFamily = InterFamily, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp),
    // Label — metadata, chips, badges
    labelLarge = TextStyle(fontFamily = InterFamily, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.1.sp),
    labelMedium = TextStyle(fontFamily = InterFamily, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.5.sp),
    labelSmall = TextStyle(fontFamily = InterFamily, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 16.sp, letterSpacing = 0.5.sp),
)

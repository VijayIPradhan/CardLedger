package com.imvj.cardledger.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.imvj.cardledger.ui.theme.*
import java.text.NumberFormat
import java.util.Locale

fun money(v: Double): String =
    "₹" + NumberFormat.getNumberInstance(Locale("en", "IN")).format(v.toLong())

@Composable
fun SpendRing(spent: Double, limit: Double, size: Int = 56) {
    val pct = if (limit > 0) (spent / limit).coerceIn(0.0, 1.0).toFloat() else 0f
    Box(contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size.dp)) {
            val stroke = 4.dp.toPx()
            val d = Size(this.size.width - stroke, this.size.height - stroke)
            drawArc(Elevated, -90f, 360f, false, Offset(stroke / 2, stroke / 2), d, style = Stroke(stroke))
            drawArc(Gold, -90f, 360f * pct, false, Offset(stroke / 2, stroke / 2), d, style = Stroke(stroke))
        }
    }
}

@Composable
fun NetworkLogo(network: String, modifier: Modifier = Modifier) {
    if (network == "Mastercard") {
        Row(modifier, verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(16.dp).clip(CircleShape).background(Color(0xFFEB001B)))
            Box(Modifier.size(16.dp).offset(x = (-6).dp).clip(CircleShape).background(Color(0x99F79E1B)))
        }
    } else {
        Text(network.uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = modifier)
    }
}

@Composable
fun HolderBadge(initials: String, isMe: Boolean) {
    Box(
        Modifier.size(24.dp).clip(CircleShape).background(if (isMe) Gold else Elevated),
        contentAlignment = Alignment.Center,
    ) { Text(initials, fontSize = 10.sp, color = if (isMe) Base else OnDark, fontWeight = FontWeight.Bold) }
}

fun initialsOf(name: String): String =
    name.trim().split(" ").filter { it.isNotEmpty() }.take(2).joinToString("") { it.first().uppercase() }

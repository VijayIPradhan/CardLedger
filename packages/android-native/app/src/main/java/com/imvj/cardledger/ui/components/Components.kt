package com.imvj.cardledger.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.imvj.cardledger.ui.theme.*
import java.text.NumberFormat
import java.util.Locale

fun money(v: Double): String =
    "₹" + NumberFormat.getNumberInstance(Locale("en", "IN")).format(Math.round(v))

// TextStyle that enables tabular/monospaced number rendering — prevents column jump
// when digit count changes (e.g. ₹999 → ₹1,000 in a live counter).
val TabularNumStyle = TextStyle(fontFeatureSettings = "tnum")

@Composable
fun SpendRing(spent: Double, limit: Double, size: Int = 56, showText: Boolean = true) {
    val pct = if (limit > 0) (spent / limit).coerceIn(0.0, 1.0).toFloat() else 0f
    val pctInt = (pct * 100).toInt()
    val ringColor = when {
        pctInt < 30 -> Success
        pctInt <= 50 -> Warning
        else -> Danger
    }
    // Animate the arc sweep so spend updates feel live rather than instant.
    val animatedPct by animateFloatAsState(targetValue = pct, animationSpec = tween(600), label = "ringPct")

    Box(contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size.dp)) {
            val strokePx = 5.dp.toPx()
            val inset = strokePx / 2f
            val arcSize = Size(this.size.width - strokePx, this.size.height - strokePx)
            drawArc(
                color = Elevated,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = arcSize,
                style = Stroke(strokePx, cap = StrokeCap.Round),
            )
            if (animatedPct > 0f) {
                drawArc(
                    color = ringColor,
                    startAngle = -90f,
                    sweepAngle = 360f * animatedPct,
                    useCenter = false,
                    topLeft = Offset(inset, inset),
                    size = arcSize,
                    style = Stroke(strokePx, cap = StrokeCap.Round),
                )
            }
        }
        if (showText) {
            Text(
                "$pctInt%",
                color = Color.White,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                style = TabularNumStyle,
            )
        }
    }
}

@Composable
fun NetworkLogo(network: String, modifier: Modifier = Modifier) {
    if (network == "Mastercard") {
        // Two overlapping circles in a fixed-width Box to prevent overflow clipping.
        Box(modifier.width(26.dp).height(16.dp)) {
            Box(Modifier.size(16.dp).clip(CircleShape).background(Color(0xFFEB001B)).align(Alignment.CenterStart))
            Box(Modifier.size(16.dp).clip(CircleShape).background(Color(0xCCF79E1B)).align(Alignment.CenterEnd))
        }
    } else {
        Text(network.uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = modifier)
    }
}

@Composable
fun HolderBadge(initials: String, isMe: Boolean) {
    Box(
        Modifier
            .size(26.dp)
            .clip(CircleShape)
            .background(if (isMe) Gold else Elevated),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initials,
            fontSize = 10.sp,
            color = if (isMe) Base else OnDark,
            fontWeight = FontWeight.Bold,
        )
    }
}

fun initialsOf(name: String): String =
    name.trim().split(" ").filter { it.isNotEmpty() }.take(2).joinToString("") { it.first().uppercase() }

data class DonutSlice(val label: String, val value: Float, val color: Color)

@Composable
fun DonutChart(
    slices: List<DonutSlice>,
    modifier: Modifier = Modifier,
    strokeWidth: Float = 28f,
) {
    if (slices.isEmpty() || slices.sumOf { it.value.toDouble() } <= 0.0) return
    val total = slices.sumOf { it.value.toDouble() }.toFloat()
    // Animate all slice fractions together via a single float drive (0→1).
    val animProgress by animateFloatAsState(targetValue = 1f, animationSpec = tween(800), label = "donut")

    Canvas(modifier) {
        val diameter = minOf(size.width, size.height) - strokeWidth
        val topLeft = Offset((size.width - diameter) / 2f, (size.height - diameter) / 2f)
        val arcSize = Size(diameter, diameter)
        val gap = 3f // gap degrees between slices
        var angle = -90f

        slices.forEach { slice ->
            val sweep = (slice.value / total) * 360f * animProgress - gap
            if (sweep > 0f) {
                drawArc(
                    color = slice.color,
                    startAngle = angle,
                    sweepAngle = sweep,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(strokeWidth, cap = StrokeCap.Round),
                )
            }
            angle += (slice.value / total) * 360f
        }
    }
}

package com.imvj.cardledger.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.imvj.cardledger.data.net.CardDto
import com.imvj.cardledger.ui.theme.cardBrush

@Composable
fun CardTile(card: CardDto, holderInitials: String?, holderIsMe: Boolean, spend: Double, limitRank: Int? = null, toCollect: Double = 0.0) {
    val white60 = Color.White.copy(alpha = 0.6f)
    Box(
        Modifier.fillMaxWidth().aspectRatio(1.586f)
            .clip(RoundedCornerShape(24.dp))
            .background(cardBrush(card.palette, card.variant, card.network))
            .padding(20.dp)
    ) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.SpaceBetween) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.weight(1f)) {
                    Text(card.bank, color = white60, fontSize = 12.sp)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(card.nickname, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, maxLines = 1)
                        if (holderInitials != null) HolderBadge(holderInitials, holderIsMe)
                    }
                    card.variant?.let { Text(it, color = white60, fontSize = 12.sp) }
                    
                    val now = java.time.LocalDate.now()
                    var cycleDate = now.withDayOfMonth(minOf(card.billing_cycle_day, now.month.length(now.isLeapYear)))
                    if (!now.isBefore(cycleDate)) {
                        val nextMonth = now.plusMonths(1)
                        cycleDate = nextMonth.withDayOfMonth(minOf(card.billing_cycle_day, nextMonth.month.length(nextMonth.isLeapYear)))
                    }
                    val daysToBill = java.time.temporal.ChronoUnit.DAYS.between(now, cycleDate).toInt()

                    var dueDate = now.withDayOfMonth(minOf(card.payment_due_day, now.month.length(now.isLeapYear)))
                    if (now.isAfter(dueDate)) {
                        val nextMonth = now.plusMonths(1)
                        dueDate = nextMonth.withDayOfMonth(minOf(card.payment_due_day, nextMonth.month.length(nextMonth.isLeapYear)))
                    }
                    val daysToDue = java.time.temporal.ChronoUnit.DAYS.between(now, dueDate).toInt()

                    Spacer(Modifier.height(4.dp))
                    if (daysToBill < daysToDue) {
                        Text("Bill in $daysToBill days", color = com.imvj.cardledger.ui.theme.Warning, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    } else {
                        val formatter = java.time.format.DateTimeFormatter.ofPattern("dd MMM")
                        Text("Payment due on ${dueDate.format(formatter)}", color = com.imvj.cardledger.ui.theme.Danger, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    }
                }
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    NetworkLogo(card.network)
                    if (limitRank != null) {
                        Surface(
                            shape = RoundedCornerShape(percent = 50),
                            color = Color.White.copy(alpha = 0.2f),
                            modifier = Modifier.clip(RoundedCornerShape(percent = 50))
                        ) {
                            Text(
                                "#$limitRank",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 10.sp,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                            )
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
                Column {
                    Text("•••• ${card.last4}", color = white60, fontSize = 12.sp)
                    if (toCollect > 0) {
                        Spacer(Modifier.height(4.dp))
                        Surface(color = Color.Black.copy(alpha = 0.3f), shape = RoundedCornerShape(4.dp)) {
                            Text("To collect: ${com.imvj.cardledger.ui.components.money(toCollect)}", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                        }
                    }
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    SpendRing(spend, card.credit_limit.toDoubleOrNull() ?: 0.0)
                    Text(money(spend), color = white60, fontSize = 10.sp)
                }
            }
            Spacer(Modifier.height(8.dp))
            val limit = card.credit_limit.toDoubleOrNull() ?: 0.0
            val pct = if (limit > 0) (spend / limit).coerceIn(0.0, 1.0).toFloat() else 0f
            androidx.compose.material3.LinearProgressIndicator(
                progress = { pct },
                modifier = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)),
                color = when {
                    pct < 0.3f -> com.imvj.cardledger.ui.theme.Success
                    pct <= 0.5f -> com.imvj.cardledger.ui.theme.Warning
                    else -> com.imvj.cardledger.ui.theme.Danger
                },
                trackColor = Color.White.copy(alpha = 0.2f)
            )
        }
    }
}

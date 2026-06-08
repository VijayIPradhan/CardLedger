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
fun CardTile(card: CardDto, holderInitials: String?, holderIsMe: Boolean, spend: Double, limitRank: Int? = null) {
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
                Text("•••• ${card.last4}", color = white60, fontSize = 12.sp)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    SpendRing(spend, card.credit_limit.toDoubleOrNull() ?: 0.0)
                    Text(money(spend), color = white60, fontSize = 10.sp)
                }
            }
        }
    }
}

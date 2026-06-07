package com.imvj.cardledger.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.imvj.cardledger.ui.theme.Danger
import com.imvj.cardledger.ui.theme.Elevated
import com.imvj.cardledger.ui.theme.Gold
import com.imvj.cardledger.ui.theme.Muted

@Composable
fun PinPad(label: String, error: String? = null, onComplete: (String) -> Unit) {
    var pin by remember { mutableStateOf("") }
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Text(label, color = Muted, fontSize = 14.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            repeat(6) { i ->
                Box(Modifier.size(12.dp).clip(CircleShape).background(if (i < pin.length) Gold else Elevated))
            }
        }
        if (error != null) Text(error, color = Danger, fontSize = 12.sp)
        Column(verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            listOf(
                listOf("1", "2", "3"), listOf("4", "5", "6"),
                listOf("7", "8", "9"), listOf("", "0", "⌫"),
            ).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                    row.forEach { key ->
                        Box(Modifier.size(64.dp), contentAlignment = Alignment.Center) {
                            if (key.isNotEmpty()) Text(
                                key, fontSize = 24.sp, fontWeight = FontWeight.Medium,
                                modifier = Modifier.clickable {
                                    if (key == "⌫") { if (pin.isNotEmpty()) pin = pin.dropLast(1) }
                                    else if (pin.length < 6) {
                                        pin += key
                                        if (pin.length == 6) { onComplete(pin); pin = "" }
                                    }
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

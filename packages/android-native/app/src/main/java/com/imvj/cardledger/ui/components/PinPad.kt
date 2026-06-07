package com.imvj.cardledger.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.imvj.cardledger.ui.theme.Danger
import com.imvj.cardledger.ui.theme.Elevated
import com.imvj.cardledger.ui.theme.Gold
import com.imvj.cardledger.ui.theme.Muted
import com.imvj.cardledger.ui.theme.OnDark

@Composable
fun PinPad(label: String, error: String? = null, onComplete: (String) -> Unit) {
    var pin by remember { mutableStateOf("") }

    fun press(key: String) {
        if (key == "⌫") {
            if (pin.isNotEmpty()) pin = pin.dropLast(1)
        } else if (pin.length < 6) {
            pin += key
            if (pin.length == 6) {
                onComplete(pin)
                pin = ""
            }
        }
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(20.dp),
        modifier = Modifier.padding(bottom = 8.dp),
    ) {
        Text(label, color = Muted, fontSize = 15.sp, fontWeight = FontWeight.Medium)

        // PIN dots — gold when filled, outlined ring when empty (visible on dark)
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            repeat(6) { i ->
                val filled = i < pin.length
                Box(
                    Modifier
                        .size(14.dp)
                        .clip(CircleShape)
                        .then(
                            if (filled) Modifier.background(Gold)
                            else Modifier.border(1.5.dp, Muted, CircleShape),
                        ),
                )
            }
        }

        // Reserve a fixed slot for the error so the keypad doesn't jump
        Box(Modifier.height(16.dp), contentAlignment = Alignment.Center) {
            if (error != null) Text(error, color = Danger, fontSize = 12.sp)
        }

        Column(
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            listOf(
                listOf("1", "2", "3"),
                listOf("4", "5", "6"),
                listOf("7", "8", "9"),
                listOf("", "0", "⌫"),
            ).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                    row.forEach { key ->
                        if (key.isEmpty()) {
                            Spacer(Modifier.size(68.dp))
                        } else {
                            Box(
                                Modifier
                                    .size(68.dp)
                                    .clip(CircleShape)
                                    .background(if (key == "⌫") Color.Transparent else Elevated)
                                    .clickable { press(key) },
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(key, color = OnDark, fontSize = 24.sp, fontWeight = FontWeight.Medium)
                            }
                        }
                    }
                }
            }
        }
    }
}

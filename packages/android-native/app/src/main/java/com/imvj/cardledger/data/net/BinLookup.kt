package com.imvj.cardledger.data.net

import android.util.Log
import com.imvj.cardledger.domain.detectNetwork
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.HttpURLConnection
import java.net.URL

private const val TAG = "BinLookup"
private const val CONNECT_TIMEOUT_MS = 4000
private const val READ_TIMEOUT_MS = 4000

data class BinInfo(val network: String?, val bank: String?, val variant: String?)

suspend fun lookupBin(bin: String): BinInfo = withContext(Dispatchers.IO) {
    val clean = bin.filter { it.isDigit() }.take(6)
    val local = BinInfo(detectNetwork(clean), null, null)
    if (clean.length < 6) return@withContext local
    try {
        val conn = (URL("https://lookup.binlist.net/$clean").openConnection() as HttpURLConnection).apply {
            setRequestProperty("Accept-Version", "3")
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
        }
        if (conn.responseCode != 200) return@withContext local
        val text = conn.inputStream.bufferedReader().use { it.readText() }
        val json = Json { ignoreUnknownKeys = true }.parseToJsonElement(text).jsonObject
        val scheme = json["scheme"]?.jsonPrimitive?.content
        val network = when (scheme?.lowercase()) {
            "visa" -> "Visa"; "mastercard" -> "Mastercard"
            "amex", "american express" -> "Amex"; "rupay" -> "RuPay"; else -> local.network
        }
        val bank = json["bank"]?.jsonObject?.get("name")?.jsonPrimitive?.content
        val type = json["type"]?.jsonPrimitive?.content?.replaceFirstChar { it.uppercase() }
        BinInfo(network, bank, type)
    } catch (e: Exception) {
        Log.w(TAG, "BIN lookup failed for $clean", e)
        local
    }
}

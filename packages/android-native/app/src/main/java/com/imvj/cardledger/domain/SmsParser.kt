package com.imvj.cardledger.domain

import java.security.MessageDigest
import kotlinx.serialization.Serializable

@Serializable
data class SmsInput(val sender: String, val body: String, val timestamp: Long)
@Serializable
data class ParseResult(
    val bank: String, val last4: String, val amount: Double, val merchant: String,
    val date: String, val type: String, val is_paid: Boolean = false, val confidence: String, val dedupeHash: String, val raw: SmsInput,
)

private data class Rule(val bank: String, val senders: List<String>, val patterns: List<Regex>)

private val OTP = Regex("\\bOTP\\b|one[-\\s]?time[-\\s]?pass|verification code", RegexOption.IGNORE_CASE)

private val MONTHS = mapOf(
    "jan" to 1, "feb" to 2, "mar" to 3, "apr" to 4, "may" to 5, "jun" to 6,
    "jul" to 7, "aug" to 8, "sep" to 9, "oct" to 10, "nov" to 11, "dec" to 12,
)

private fun ci(p: String) = Regex(p, RegexOption.IGNORE_CASE)

private val RULES = listOf(
    Rule("HDFC", listOf("BZ-HDFCBK", "HD-HDFCBK", "HDFCBK"), listOf(
        ci("""Rs\.(?<amount>[\d,]+\.?\d*) spent on HDFC Bank[^C]+Card XX(?<last4>\d{4}) at (?<merchant>.+?) on (?<date>\d{2}-\d{2}-\d{4})"""))),
    Rule("ICICI", listOf("BZ-ICICIB", "ICICIB", "ICICIBK"), listOf(
        ci("""Rs\.(?<amount>[\d,]+\.?\d*) spent on .+?Card ending (?<last4>\d{4}) on (?<date>[A-Za-z]+ \d{2},? \d{4}) at (?<merchant>.+?)\."""))),
    Rule("SBI", listOf("AD-SBIINB", "SBI-UPI", "SBIINB", "SBICRD"), listOf(
        ci("""Rs\.(?<amount>[\d,]+\.?\d*) debited from SBI Credit Card XX(?<last4>\d{4}) on (?<date>\d{2}/\d{2}/\d{4}) at (?<merchant>.+?)"""))),
    Rule("Axis", listOf("AX-AXISBK", "AXISBK"), listOf(
        ci("""Rs\.(?<amount>[\d,]+\.?\d*) spent via your Flipkart Axis Bank Card ending (?<last4>\d{4}) on (?<date>\d{2}-[A-Za-z]{3}-\d{2}) at (?<merchant>.+?)"""))),
)

private val FALLBACK = Rule("UNKNOWN", emptyList(), listOf(
    ci("""Rs\.?\s*(?<amount>[\d,]+\.?\d*)\s+spent at (?<merchant>.+?) on (?<date>[\d/]+)"""),
    ci("""Rs\.?\s*(?<amount>[\d,]+\.?\d*).*?(?:card|Card).*?(?<last4>\d{4})"""),
))

private fun groupOrNull(m: MatchResult, name: String): String? =
    try { m.groups[name]?.value } catch (e: Exception) { null }

private fun normalizeAmount(raw: String): Double =
    raw.replace(Regex("^(Rs\\.?|₹|INR)\\s*", RegexOption.IGNORE_CASE), "").replace(",", "").trim().toDoubleOrNull() ?: 0.0

private fun normalizeDate(raw: String): String {
    val s = raw.trim()
    Regex("^(\\d{1,2})[-/](\\d{1,2})[-/](\\d{4})$").find(s)?.let {
        val (d, mm, yy) = it.destructured; return "%s-%02d-%02d".format(yy, mm.toInt(), d.toInt())
    }
    Regex("^(\\d{1,2})[-\\s]([A-Za-z]{3})[-\\s](\\d{2,4})$").find(s)?.let {
        val (d, mon, yr) = it.destructured
        val month = MONTHS[mon.lowercase()] ?: return s
        val y = if (yr.length == 2) "20$yr" else yr
        return "%s-%02d-%02d".format(y, month, d.toInt())
    }
    Regex("^([A-Za-z]{3})\\s+(\\d{1,2}),?\\s+(\\d{4})$").find(s)?.let {
        val (mon, d, y) = it.destructured
        val month = MONTHS[mon.lowercase()] ?: return s
        return "%s-%02d-%02d".format(y, month, d.toInt())
    }
    return s
}

private fun normalizeMerchant(raw: String) = raw.trim().replace(Regex("\\s{2,}"), " ")

fun dedupeHash(input: SmsInput): String {
    val raw = "${input.sender}|${input.body}|${input.timestamp}"
    val md = MessageDigest.getInstance("SHA-256")
    return md.digest(raw.toByteArray()).joinToString("") { "%02x".format(it) }
}

fun parseSms(input: SmsInput, knownLast4s: List<String>? = null): ParseResult? {
    if (OTP.containsMatchIn(input.body)) return null
    val matched = RULES.firstOrNull { r -> r.senders.any { input.sender.contains(it) } }
    val rules = if (matched != null) listOf(matched, FALLBACK) else listOf(FALLBACK)
    for (rule in rules) {
        for (pattern in rule.patterns) {
            val m = pattern.find(input.body) ?: continue
            val rawAmt = groupOrNull(m, "amount") ?: continue
            val last4 = groupOrNull(m, "last4")
            
            if (last4 != null && !knownLast4s.isNullOrEmpty() && !knownLast4s.contains(last4)) {
                return null
            }
            
            val rawDate = groupOrNull(m, "date")
            val rawMerchant = groupOrNull(m, "merchant")
            
            val bodyLower = input.body.lowercase()
            val type = if (bodyLower.contains("credited") || bodyLower.contains("received") || 
                           bodyLower.contains("refund") || bodyLower.contains("reversal")) {
                "payment"
            } else {
                "spend"
            }
            
            var merchant = rawMerchant
            if (merchant == null) {
                val atRegex = Regex("at\\s+([a-zA-Z0-9*.\\s]+?)(?:\\s+on|\\.|(?:$))", RegexOption.IGNORE_CASE)
                merchant = atRegex.find(input.body)?.groupValues?.getOrNull(1)?.trim()
            }
            
            val isFallback = rule.bank == "UNKNOWN"
            val hasAll = last4 != null && rawDate != null && merchant != null
            val confidence = if (!isFallback && hasAll) "high" else "low"
            return ParseResult(
                bank = rule.bank,
                last4 = last4 ?: "",
                amount = normalizeAmount(rawAmt),
                merchant = normalizeMerchant(merchant ?: ""),
                date = if (rawDate != null) normalizeDate(rawDate)
                       else java.time.Instant.ofEpochMilli(input.timestamp).atZone(java.time.ZoneId.systemDefault()).toLocalDate().toString(),
                type = type,
                is_paid = false,
                confidence = confidence,
                dedupeHash = dedupeHash(input),
                raw = input,
            )
        }
    }
    return null
}

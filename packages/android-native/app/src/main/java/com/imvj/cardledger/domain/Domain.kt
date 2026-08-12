package com.imvj.cardledger.domain

import java.time.LocalDate

/**
 * Date, card-number and formatting helpers.
 *
 * Deliberately contains no financial math. Spend, debt, utilisation and billing-cycle grouping
 * all come from the server (@cardledger/shared) — a second implementation here is what made the
 * app and the web client disagree about the same ledger.
 */

fun getDaysUntilDue(paymentDueDay: Int, today: String): Int {
    val (y, m, d) = today.split("-").map { it.toInt() }
    var dy = y; var dm = m
    if (d > paymentDueDay) { dm += 1; if (dm == 13) { dm = 1; dy += 1 } }
    val maxDay = LocalDate.of(dy, dm, 1).lengthOfMonth()
    val due = LocalDate.of(dy, dm, minOf(paymentDueDay, maxDay))
    val now = LocalDate.of(y, m, d)
    return maxOf(0, java.time.temporal.ChronoUnit.DAYS.between(now, due).toInt())
}

fun getDaysUntilStatement(billingCycleDay: Int, today: String): Int {
    val (y, m, d) = today.split("-").map { it.toInt() }
    var sy = y; var sm = m
    if (d > billingCycleDay) { sm += 1; if (sm == 13) { sm = 1; sy += 1 } }
    val maxDay = LocalDate.of(sy, sm, 1).lengthOfMonth()
    val stmt = LocalDate.of(sy, sm, minOf(billingCycleDay, maxDay))
    val now = LocalDate.of(y, m, d)
    return maxOf(0, java.time.temporal.ChronoUnit.DAYS.between(now, stmt).toInt())
}

/** Carrier for the server's utilisation figures — computed there, formatted here. */
data class Utilization(val spend: Double, val limit: Double, val percent: Double)

/** Carrier for one entry of the server's `dues` list. */
data class UpcomingDue(val cardId: String, val dueDate: String, val daysUntil: Int)

fun sanitizeCardNumber(input: String) = input.filter { it.isDigit() }
fun extractBin(num: String) = sanitizeCardNumber(num).let { if (it.length >= 6) it.substring(0, 6) else "" }
fun extractLast4(num: String) = sanitizeCardNumber(num).let { if (it.length >= 4) it.takeLast(4) else "" }

fun detectNetwork(bin: String): String? {
    val b = sanitizeCardNumber(bin)
    if (b.length < 2) return null
    val two = b.substring(0, 2).toInt()
    val three = if (b.length >= 3) b.substring(0, 3).toInt() else 0
    val four = if (b.length >= 4) b.substring(0, 4).toInt() else 0
    return when {
        two == 34 || two == 37 -> "Amex"
        b[0] == '4' -> "Visa"
        (two in 51..55) || (four in 2221..2720) -> "Mastercard"
        two == 60 || two == 65 || two == 81 || two == 82 || three == 508 -> "RuPay"
        else -> null
    }
}

fun luhnValid(num: String): Boolean {
    val d = sanitizeCardNumber(num)
    if (d.length < 12) return false
    var sum = 0; var alt = false
    for (i in d.indices.reversed()) {
        var n = d[i] - '0'
        if (alt) { n *= 2; if (n > 9) n -= 9 }
        sum += n; alt = !alt
    }
    return sum % 10 == 0
}

fun today(): String = LocalDate.now().toString()

package com.imvj.cardledger.domain

import com.imvj.cardledger.data.net.AssignmentDto
import com.imvj.cardledger.data.net.CardDto
import java.time.LocalDate

fun resolveHolder(cardId: String, txnDate: String, assignments: List<AssignmentDto>): String? =
    assignments.firstOrNull {
        it.card_id == cardId &&
            it.handed_over_date <= txnDate &&
            (it.returned_date == null || it.returned_date >= txnDate)
    }?.holder_id

data class CycleRange(val start: String, val end: String)

private fun iso(y: Int, m: Int, d: Int) = "%04d-%02d-%02d".format(y, m, d)

fun getCycleRange(cycleDay: Int, today: String): CycleRange {
    val (y, m, d) = today.split("-").map { it.toInt() }
    var sy = y; var sm = m
    if (d < cycleDay) { sm -= 1; if (sm == 0) { sm = 12; sy -= 1 } }
    val start = iso(sy, sm, cycleDay)
    var em = sm + 1; var ey = sy
    if (em == 13) { em = 1; ey += 1 }
    val end = iso(ey, em, cycleDay - 1)
    return CycleRange(start, end)
}

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

data class Utilization(val spend: Double, val limit: Double, val percent: Double)

private fun pct(spend: Double, limit: Double) =
    if (limit <= 0) 0.0 else Math.round(spend / limit * 1000.0) / 10.0

fun cardUtilization(creditLimit: Double, spend: Double) = Utilization(spend, creditLimit, pct(spend, creditLimit))

fun totalUtilization(cards: List<CardDto>, spendByCard: Map<String, Double>): Utilization {
    val limit = cards.filter { it.shared_limit_with == null }.sumOf { it.credit_limit.toDoubleOrNull() ?: 0.0 }
    val spend = cards.sumOf { spendByCard[it.id] ?: 0.0 }
    return Utilization(spend, limit, pct(spend, limit))
}

data class UpcomingDue(val cardId: String, val dueDate: String, val daysUntil: Int)

fun upcomingDues(cards: List<CardDto>, today: String, withinDays: Int): List<UpcomingDue> {
    val parts = today.split("-").map { it.toInt() }
    val y = parts[0]; val m = parts[1]; val d = parts[2]
    return cards.map { c ->
        var dy = y; var dm = m
        if (d > c.payment_due_day) { dm += 1; if (dm == 13) { dm = 1; dy += 1 } }
        val maxDay = LocalDate.of(dy, dm, 1).lengthOfMonth()
        val safeDay = minOf(c.payment_due_day, maxDay)
        UpcomingDue(c.id, iso(dy, dm, safeDay), getDaysUntilDue(c.payment_due_day, today))
    }.filter { it.daysUntil <= withinDays }.sortedBy { it.daysUntil }
}

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

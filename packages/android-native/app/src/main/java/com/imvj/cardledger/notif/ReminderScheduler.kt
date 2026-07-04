package com.imvj.cardledger.notif

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.imvj.cardledger.data.net.CardDto
import com.imvj.cardledger.domain.getDaysUntilDue
import com.imvj.cardledger.domain.today
import java.util.Calendar

object ReminderScheduler {
    fun reschedule(context: Context, cards: List<CardDto>, daysBefore: Int, enabled: Boolean) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        cards.forEach { card ->
            // 1. Payment Due Reminder
            val dueId = card.id.hashCode() and 0x7FFFFFFF
            val duePi = PendingIntent.getBroadcast(
                context, dueId,
                Intent(context, ReminderReceiver::class.java)
                    .putExtra("title", "⚠️ Payment due soon")
                    .putExtra("body", "${card.nickname} payment is due in $daysBefore days")
                    .putExtra("nid", dueId),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            am.cancel(duePi)

            // 2. Statement Date Reminder (CIBIL Hack Alert)
            val stmtId = (card.id.hashCode() + 100000) and 0x7FFFFFFF
            val stmtPi = PendingIntent.getBroadcast(
                context, stmtId,
                Intent(context, ReminderReceiver::class.java)
                    .putExtra("title", "⚡ Statement date approaching!")
                    .putExtra("body", "${card.nickname} statement generates in $daysBefore days! Pay down balance now for 0% reported CIBIL utilization.")
                    .putExtra("nid", stmtId),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            am.cancel(stmtPi)

            if (!enabled) return@forEach

            // Schedule Due Alarm
            val fireInDueDays = getDaysUntilDue(card.payment_due_day, today()) - daysBefore
            if (fireInDueDays >= 0) {
                val calDue = Calendar.getInstance().apply {
                    add(Calendar.DAY_OF_YEAR, fireInDueDays)
                    set(Calendar.HOUR_OF_DAY, 9); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
                }
                if (calDue.timeInMillis > System.currentTimeMillis()) {
                    am.set(AlarmManager.RTC_WAKEUP, calDue.timeInMillis, duePi)
                }
            }

            // Schedule Statement Alarm
            val fireInStmtDays = com.imvj.cardledger.domain.getDaysUntilStatement(card.billing_cycle_day, today()) - daysBefore
            if (fireInStmtDays >= 0) {
                val calStmt = Calendar.getInstance().apply {
                    add(Calendar.DAY_OF_YEAR, fireInStmtDays)
                    set(Calendar.HOUR_OF_DAY, 10); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
                }
                if (calStmt.timeInMillis > System.currentTimeMillis()) {
                    am.set(AlarmManager.RTC_WAKEUP, calStmt.timeInMillis, stmtPi)
                }
            }
        }
    }
}

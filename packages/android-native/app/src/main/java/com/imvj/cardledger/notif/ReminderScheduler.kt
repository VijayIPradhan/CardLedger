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
            val id = card.id.hashCode() and 0x7FFFFFFF
            val pi = PendingIntent.getBroadcast(
                context, id,
                Intent(context, ReminderReceiver::class.java)
                    .putExtra("title", "Payment due soon")
                    .putExtra("body", "${card.nickname} payment is due in $daysBefore days")
                    .putExtra("nid", id),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            am.cancel(pi)
            if (!enabled) return@forEach
            val fireInDays = getDaysUntilDue(card.payment_due_day, today()) - daysBefore
            if (fireInDays < 0) return@forEach
            val cal = Calendar.getInstance().apply {
                add(Calendar.DAY_OF_YEAR, fireInDays)
                set(Calendar.HOUR_OF_DAY, 9); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
            }
            if (cal.timeInMillis <= System.currentTimeMillis()) return@forEach
            am.set(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pi)
        }
    }
}

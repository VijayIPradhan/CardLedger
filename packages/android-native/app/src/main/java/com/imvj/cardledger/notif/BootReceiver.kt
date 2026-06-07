package com.imvj.cardledger.notif

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.imvj.cardledger.CardLedgerApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as CardLedgerApp
        CoroutineScope(Dispatchers.IO).launch {
            val cards = app.container.cardRepo.list().getOrElse { emptyList() }
            ReminderScheduler.reschedule(
                context, cards,
                app.container.prefsStore.reminderDays(),
                app.container.prefsStore.remindersEnabled(),
            )
        }
    }
}

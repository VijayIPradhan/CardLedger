package com.cardledger.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        Telephony.Sms.Intents.getMessagesFromIntent(intent)?.forEach { msg ->
            SmsPlugin.instance?.notifySms(
                msg.displayOriginatingAddress ?: "",
                msg.messageBody ?: ""
            )
        }
    }
}

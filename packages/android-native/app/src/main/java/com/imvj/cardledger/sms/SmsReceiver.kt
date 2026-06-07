package com.imvj.cardledger.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.imvj.cardledger.domain.SmsInput
import kotlinx.coroutines.flow.MutableSharedFlow

object SmsBus { val flow = MutableSharedFlow<SmsInput>(extraBufferCapacity = 16) }

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        Telephony.Sms.Intents.getMessagesFromIntent(intent)?.forEach { m ->
            SmsBus.flow.tryEmit(SmsInput(m.displayOriginatingAddress ?: "", m.messageBody ?: "", System.currentTimeMillis()))
        }
    }
}

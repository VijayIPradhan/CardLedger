package com.imvj.cardledger.sms

import android.content.Context
import android.net.Uri
import com.imvj.cardledger.domain.SmsInput

fun readInbox(context: Context, daysBack: Int = 90): List<SmsInput> {
    val cutoff = System.currentTimeMillis() - daysBack.toLong() * 24 * 60 * 60 * 1000
    val out = mutableListOf<SmsInput>()
    context.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("address", "body", "date"),
        "date > ?", arrayOf(cutoff.toString()), "date DESC",
    )?.use { c ->
        val a = c.getColumnIndexOrThrow("address"); val b = c.getColumnIndexOrThrow("body"); val d = c.getColumnIndexOrThrow("date")
        while (c.moveToNext()) out.add(SmsInput(c.getString(a) ?: "", c.getString(b) ?: "", c.getLong(d)))
    }
    return out
}

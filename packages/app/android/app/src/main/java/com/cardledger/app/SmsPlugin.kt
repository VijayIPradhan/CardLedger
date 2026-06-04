package com.cardledger.app

import android.Manifest
import android.database.Cursor
import android.net.Uri
import com.getcapacitor.*
import com.getcapacitor.annotation.*

@CapacitorPlugin(
    name = "SmsPlugin",
    permissions = [
        Permission(
            strings = [Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS],
            alias = "sms"
        )
    ]
)
class SmsPlugin : Plugin() {

    companion object {
        @JvmStatic
        var instance: SmsPlugin? = null
    }

    override fun load() {
        instance = this
    }

    /** Called by SmsReceiver when a new SMS arrives. Fires 'smsReceived' to JS. */
    fun notifySms(sender: String, body: String) {
        val data = JSObject()
        data.put("sender", sender)
        data.put("body", body)
        data.put("timestamp", System.currentTimeMillis())
        notifyListeners("smsReceived", data)
    }

    @PluginMethod
    fun readInbox(call: PluginCall) {
        val daysBack = call.getInt("daysBack", 90)!!
        val cutoff = System.currentTimeMillis() - daysBack.toLong() * 24L * 60L * 60L * 1000L

        val messages = JSArray()
        val cursor: Cursor? = context.contentResolver.query(
            Uri.parse("content://sms/inbox"),
            arrayOf("address", "body", "date"),
            "date > ?",
            arrayOf(cutoff.toString()),
            "date DESC"
        )

        cursor?.use { c ->
            val addrIdx = c.getColumnIndexOrThrow("address")
            val bodyIdx = c.getColumnIndexOrThrow("body")
            val dateIdx = c.getColumnIndexOrThrow("date")
            while (c.moveToNext()) {
                val obj = JSObject()
                obj.put("sender", c.getString(addrIdx) ?: "")
                obj.put("body", c.getString(bodyIdx) ?: "")
                obj.put("timestamp", c.getLong(dateIdx))
                messages.put(obj)
            }
        }

        val result = JSObject()
        result.put("messages", messages)
        call.resolve(result)
    }
}

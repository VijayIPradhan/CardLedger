package com.imvj.cardledger.util

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.imvj.cardledger.MainActivity
import com.imvj.cardledger.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

object NotificationHelper {
    private const val CHANNEL_ID_REMINDERS = "reminders"
    private const val CHANNEL_ID_FCM_REMINDERS = "fcm_reminders"

    /**
     * Create notification channels for the app.
     * Should be called on app initialization.
     */
    fun createNotificationChannels(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // Channel for local reminders (existing)
            val localReminderChannel = NotificationChannel(
                CHANNEL_ID_REMINDERS,
                "Payment Reminders",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Reminders for card payments and billing cycles"
                enableVibration(true)
                setShowBadge(true)
            }

            // Channel for FCM push notifications
            val fcmReminderChannel = NotificationChannel(
                CHANNEL_ID_FCM_REMINDERS,
                "Push Reminders",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Push notifications for payment reminders and alerts"
                enableVibration(true)
                setShowBadge(true)
            }

            notificationManager.createNotificationChannel(localReminderChannel)
            notificationManager.createNotificationChannel(fcmReminderChannel)
        }
    }

    /**
     * Show a notification from FCM payload.
     *
     * @param context Application context
     * @param title Notification title
     * @param body Notification body text
     * @param notificationId Unique notification ID
     */
    fun showFcmNotification(
        context: Context,
        title: String,
        body: String,
        notificationId: Int = System.currentTimeMillis().toInt()
    ) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID_FCM_REMINDERS)
            .setSmallIcon(android.R.drawable.ic_dialog_info) // TODO: Replace with app icon
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .build()

        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(notificationId, notification)
    }

    /**
     * Register FCM token with the backend server.
     *
     * @param context Application context
     * @param token FCM registration token
     */
    fun registerFcmToken(context: Context, token: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // Get ApiService from AppContainer
                val app = context.applicationContext as? com.imvj.cardledger.CardLedgerApp
                val apiService = app?.container?.api

                if (apiService == null) {
                    android.util.Log.e("NotificationHelper", "ApiService not available")
                    return@launch
                }

                // Check if token has changed
                val prefs = context.getSharedPreferences("fcm_prefs", Context.MODE_PRIVATE)
                val savedToken = prefs.getString("fcm_token", null)

                if (savedToken == token) {
                    android.util.Log.d("NotificationHelper", "FCM token unchanged, skipping registration")
                    return@launch
                }

                // Register token with server
                val request = com.imvj.cardledger.data.net.FcmTokenRequest(token = token)
                val response = apiService.registerFcmToken(request)

                if (response.isSuccessful) {
                    // Store token locally to avoid redundant registrations
                    prefs.edit()
                        .putString("fcm_token", token)
                        .apply()
                    android.util.Log.d("NotificationHelper", "FCM token registered successfully")
                } else {
                    android.util.Log.e("NotificationHelper", "Failed to register FCM token: ${response.code()}")
                }
            } catch (e: Exception) {
                // Handle error - retry logic can be added
                android.util.Log.e("NotificationHelper", "Failed to register FCM token", e)
            }
        }
    }

    /**
     * Check if notification permission is granted (Android 13+).
     */
    fun hasNotificationPermission(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
        }
        return true // Permission not required below Android 13
    }
}

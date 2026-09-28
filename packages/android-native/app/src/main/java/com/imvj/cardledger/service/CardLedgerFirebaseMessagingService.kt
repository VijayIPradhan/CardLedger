package com.imvj.cardledger.service

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.imvj.cardledger.util.NotificationHelper

/**
 * Firebase Cloud Messaging service for handling push notifications.
 *
 * This service:
 * - Receives FCM messages when the app is in foreground or background
 * - Handles FCM token refresh
 * - Displays notifications for payment reminders
 */
class CardLedgerFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "FCMService"
    }

    /**
     * Called when a new FCM token is generated.
     * This happens on:
     * - First app install
     * - App reinstall
     * - App data cleared
     * - Token rotation
     *
     * The token must be sent to the backend server for push notifications to work.
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM token refreshed: $token")

        // Send token to backend server
        // TODO: Get ApiService instance from AppContainer and register token
        NotificationHelper.registerFcmToken(applicationContext, token)
    }

    /**
     * Called when a message is received from FCM.
     *
     * Expected payload format:
     * {
     *   "notification": {
     *     "title": "Payment Due",
     *     "body": "Your HDFC Credit Card payment is due in 3 days"
     *   },
     *   "data": {
     *     "type": "payment_reminder",
     *     "card_id": "123",
     *     "days_until_due": "3"
     *   }
     * }
     *
     * Note: When app is in background, notification payload is automatically handled by FCM SDK.
     * This method is called when:
     * - App is in foreground
     * - Message contains only data payload (no notification payload)
     */
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        Log.d(TAG, "Message received from: ${message.from}")

        // Handle notification payload
        message.notification?.let { notification ->
            val title = notification.title ?: "CardLedger Reminder"
            val body = notification.body ?: ""

            Log.d(TAG, "Notification payload - Title: $title, Body: $body")

            // Show notification (custom handling when app is in foreground)
            showNotification(title, body, message.data)
        }

        // Handle data payload
        if (message.data.isNotEmpty()) {
            Log.d(TAG, "Data payload: ${message.data}")
            handleDataPayload(message.data)
        }
    }

    /**
     * Show notification from FCM message.
     */
    private fun showNotification(title: String, body: String, data: Map<String, String>) {
        // Generate unique notification ID based on card_id or use timestamp
        val notificationId = data["card_id"]?.hashCode() ?: System.currentTimeMillis().toInt()

        NotificationHelper.showFcmNotification(
            context = applicationContext,
            title = title,
            body = body,
            notificationId = notificationId
        )
    }

    /**
     * Handle data-only payload from FCM.
     * Used for silent notifications or custom actions.
     */
    private fun handleDataPayload(data: Map<String, String>) {
        when (data["type"]) {
            "payment_reminder" -> {
                // Payment reminder notification
                val title = data["title"] ?: "Payment Reminder"
                val body = data["body"] ?: "You have a payment due soon"
                showNotification(title, body, data)
            }
            "statement_reminder" -> {
                // Statement generation reminder
                val title = data["title"] ?: "Statement Reminder"
                val body = data["body"] ?: "Your statement will be generated soon"
                showNotification(title, body, data)
            }
            "sync_request" -> {
                // Silent sync request - trigger background sync
                Log.d(TAG, "Sync request received")
                // TODO: Trigger repository sync if needed
            }
            else -> {
                Log.w(TAG, "Unknown data payload type: ${data["type"]}")
            }
        }
    }

    /**
     * Called when FCM message delivery fails.
     */
    override fun onDeletedMessages() {
        super.onDeletedMessages()
        Log.w(TAG, "Some messages were deleted on the server")
        // This can happen when:
        // - Too many messages pending for delivery (>100)
        // - Device hasn't connected in more than 4 weeks
        // Consider triggering a full sync in this case
    }
}

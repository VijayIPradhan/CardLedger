package com.imvj.cardledger.util

import android.content.Context
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging

/**
 * Helper object for Firebase Cloud Messaging operations.
 */
object FcmHelper {
    private const val TAG = "FcmHelper"

    /**
     * Request and register FCM token.
     * Call this on app initialization after user is logged in.
     *
     * @param context Application context
     */
    fun initializeFcm(context: Context) {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                Log.w(TAG, "Fetching FCM registration token failed", task.exception)
                return@addOnCompleteListener
            }

            // Get new FCM registration token
            val token = task.result
            Log.d(TAG, "FCM token retrieved: $token")

            // Register token with backend server
            NotificationHelper.registerFcmToken(context, token)
        }
    }

    /**
     * Subscribe to a topic for receiving targeted notifications.
     *
     * @param topic Topic name (e.g., "payment_reminders", "all_users")
     */
    fun subscribeToTopic(topic: String) {
        FirebaseMessaging.getInstance().subscribeToTopic(topic)
            .addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    Log.d(TAG, "Subscribed to topic: $topic")
                } else {
                    Log.w(TAG, "Failed to subscribe to topic: $topic", task.exception)
                }
            }
    }

    /**
     * Unsubscribe from a topic.
     *
     * @param topic Topic name
     */
    fun unsubscribeFromTopic(topic: String) {
        FirebaseMessaging.getInstance().unsubscribeFromTopic(topic)
            .addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    Log.d(TAG, "Unsubscribed from topic: $topic")
                } else {
                    Log.w(TAG, "Failed to unsubscribe from topic: $topic", task.exception)
                }
            }
    }

    /**
     * Delete FCM token (e.g., on logout).
     * This will invalidate the current token and generate a new one on next app start.
     */
    fun deleteFcmToken(context: Context) {
        FirebaseMessaging.getInstance().deleteToken().addOnCompleteListener { task ->
            if (task.isSuccessful) {
                Log.d(TAG, "FCM token deleted")
                // Clear locally stored token
                context.getSharedPreferences("fcm_prefs", Context.MODE_PRIVATE)
                    .edit()
                    .remove("fcm_token")
                    .apply()
            } else {
                Log.w(TAG, "Failed to delete FCM token", task.exception)
            }
        }
    }
}

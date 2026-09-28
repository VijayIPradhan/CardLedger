package com.imvj.cardledger.util

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.result.ActivityResultLauncher
import androidx.core.content.ContextCompat

/**
 * Helper for requesting runtime permissions, specifically for notifications on Android 13+.
 *
 * Usage in Activity or Fragment:
 * ```
 * private val notificationPermissionLauncher = registerForActivityResult(
 *     ActivityResultContracts.RequestPermission()
 * ) { isGranted ->
 *     if (isGranted) {
 *         // Permission granted, initialize FCM
 *         FcmHelper.initializeFcm(applicationContext)
 *     } else {
 *         // Permission denied, handle accordingly
 *     }
 * }
 *
 * // Later, when ready to request permission:
 * PermissionHelper.requestNotificationPermission(this, notificationPermissionLauncher)
 * ```
 */
object PermissionHelper {

    /**
     * Check if notification permission is granted.
     * Always returns true for Android 12 and below (permission not required).
     */
    fun hasNotificationPermission(activity: Activity): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                activity,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    /**
     * Request notification permission on Android 13+.
     * Does nothing on Android 12 and below.
     *
     * @param activity The activity context
     * @param launcher ActivityResultLauncher for requesting permission
     */
    fun requestNotificationPermission(
        activity: Activity,
        launcher: ActivityResultLauncher<String>
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (!hasNotificationPermission(activity)) {
                launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    /**
     * Check if permission should be requested with rationale.
     * Returns true if user previously denied the permission.
     */
    fun shouldShowNotificationRationale(activity: Activity): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            false
        }
    }
}

package com.imvj.cardledger.ui.lock

import kotlinx.coroutines.flow.MutableStateFlow

object AppLock {
    val locked = MutableStateFlow(true)
    private var backgroundedAt: Long = 0L
    private const val LOCK_AFTER_MS = 5 * 60 * 1000L

    fun onBackground() { backgroundedAt = System.currentTimeMillis() }
    fun onForeground() {
        if (backgroundedAt != 0L && System.currentTimeMillis() - backgroundedAt > LOCK_AFTER_MS) locked.value = true
        backgroundedAt = 0L
    }
    fun lock() { locked.value = true }
    fun unlock() { locked.value = false }
}

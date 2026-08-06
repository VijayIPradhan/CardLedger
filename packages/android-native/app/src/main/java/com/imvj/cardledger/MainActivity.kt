package com.imvj.cardledger

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.imvj.cardledger.ui.lock.AppLock
import com.imvj.cardledger.ui.nav.AppNav
import com.imvj.cardledger.ui.theme.CardLedgerTheme

class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Request highest available refresh rate for smoothest animations
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            window.let { win ->
                val display = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                    display
                } else {
                    @Suppress("DEPRECATION")
                    win.windowManager.defaultDisplay
                }
                val modes = display?.supportedModes
                modes?.maxByOrNull { it.refreshRate }?.let { maxMode ->
                    val layoutParams = win.attributes
                    layoutParams.preferredDisplayModeId = maxMode.modeId
                    win.attributes = layoutParams
                }
            }
        }

        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStop(owner: LifecycleOwner) { AppLock.onBackground() }
            override fun onStart(owner: LifecycleOwner) { AppLock.onForeground() }
        })
        setContent { CardLedgerTheme { AppNav() } }
    }
}

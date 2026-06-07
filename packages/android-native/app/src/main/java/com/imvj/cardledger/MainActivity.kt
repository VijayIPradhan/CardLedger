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
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStop(owner: LifecycleOwner) { AppLock.onBackground() }
            override fun onStart(owner: LifecycleOwner) { AppLock.onForeground() }
        })
        setContent { CardLedgerTheme { AppNav() } }
    }
}

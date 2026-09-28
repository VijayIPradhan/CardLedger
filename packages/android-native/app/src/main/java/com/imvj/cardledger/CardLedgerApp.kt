package com.imvj.cardledger

import android.app.Application
import com.imvj.cardledger.util.NotificationHelper

class CardLedgerApp : Application() {
    lateinit var container: AppContainer
        private set
    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)

        // Initialize notification channels for FCM and local notifications
        NotificationHelper.createNotificationChannels(this)
    }
}

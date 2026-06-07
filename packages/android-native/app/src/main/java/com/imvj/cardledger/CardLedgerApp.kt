package com.imvj.cardledger

import android.app.Application

class CardLedgerApp : Application() {
    lateinit var container: AppContainer
        private set
    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}

package com.imvj.cardledger

import android.content.Context
import com.imvj.cardledger.data.net.ApiService
import com.imvj.cardledger.data.net.NetworkModule
import com.imvj.cardledger.data.repo.*
import com.imvj.cardledger.data.store.PrefsStore
import com.imvj.cardledger.data.store.TokenStore

class AppContainer(context: Context) {
    val appContext: Context = context.applicationContext
    val tokenStore = TokenStore(appContext)
    val prefsStore = PrefsStore(appContext)
    val api: ApiService = NetworkModule.create(tokenStore)

    val authRepo = AuthRepository(api)
    val cardRepo = CardRepository(api)
    val holderRepo = HolderRepository(api)
    val assignmentRepo = AssignmentRepository(api)
    val transactionRepo = TransactionRepository(api)
}

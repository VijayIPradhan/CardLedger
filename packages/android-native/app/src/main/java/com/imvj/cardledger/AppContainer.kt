package com.imvj.cardledger

import android.content.Context
import com.imvj.cardledger.data.net.ApiService
import com.imvj.cardledger.data.net.NetworkModule
import com.imvj.cardledger.data.repo.*
import com.imvj.cardledger.data.store.PrefsStore
import com.imvj.cardledger.data.store.ReviewStore
import com.imvj.cardledger.data.store.TokenStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

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
    val metadataRepo = MetadataRepository(api)
    val paymentRepo = PaymentRepository(api)
    
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val reviewStore = ReviewStore(prefsStore, appScope)
    
    init {
        appScope.launch {
            reviewStore.init()
        }
    }
}

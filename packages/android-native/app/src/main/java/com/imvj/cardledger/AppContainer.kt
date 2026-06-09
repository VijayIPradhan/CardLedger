package com.imvj.cardledger

import android.content.Context
import com.imvj.cardledger.data.net.ApiService
import com.imvj.cardledger.data.net.NetworkModule
import com.imvj.cardledger.data.repo.*
import com.imvj.cardledger.data.store.PrefsStore
import com.imvj.cardledger.data.store.ReviewStore
import com.imvj.cardledger.data.store.TokenStore
import com.imvj.cardledger.data.store.CacheStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class AppContainer(context: Context) {
    val appContext: Context = context.applicationContext
    val tokenStore = TokenStore(appContext)
    val prefsStore = PrefsStore(appContext)
    val cacheStore = CacheStore(appContext)

    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // Eagerly collect the token flow into a StateFlow so AuthInterceptor can read
    // tokenState.value synchronously — no runBlocking needed on OkHttp threads.
    val tokenState: StateFlow<String?> = tokenStore.tokenFlow.stateIn(
        scope = appScope,
        started = SharingStarted.Eagerly,
        initialValue = null,
    )

    val api: ApiService = NetworkModule.create { tokenState.value }

    val authRepo = AuthRepository(api)
    val cardRepo = CardRepository(api)
    val holderRepo = HolderRepository(api)
    val assignmentRepo = AssignmentRepository(api)
    val transactionRepo = TransactionRepository(api)
    val metadataRepo = MetadataRepository(api)
    val paymentRepo = PaymentRepository(api)

    val reviewStore = ReviewStore(prefsStore, appScope)

    init {
        appScope.launch {
            reviewStore.init()
        }
    }
}

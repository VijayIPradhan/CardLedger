package com.imvj.cardledger.data.net

import com.imvj.cardledger.data.store.TokenStore
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = runBlocking { tokenStore.get() }
        val req = if (token != null)
            chain.request().newBuilder().addHeader("Authorization", "Bearer $token").build()
        else chain.request()
        return chain.proceed(req)
    }
}

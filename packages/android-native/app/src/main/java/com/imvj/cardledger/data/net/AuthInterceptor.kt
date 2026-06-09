package com.imvj.cardledger.data.net

import okhttp3.Interceptor
import okhttp3.Response

/**
 * Attaches the Bearer token to every request.
 * The token is supplied via a lambda so callers can back it with a hot StateFlow.value
 * — a non-blocking field read that avoids runBlocking on OkHttp's dispatcher threads.
 */
class AuthInterceptor(private val tokenProvider: () -> String?) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenProvider()
        val req = if (token != null)
            chain.request().newBuilder().addHeader("Authorization", "Bearer $token").build()
        else
            chain.request()
        return chain.proceed(req)
    }
}

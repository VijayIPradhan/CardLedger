package com.imvj.cardledger.data.net

import com.imvj.cardledger.BuildConfig
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit

object NetworkModule {
    /**
     * @param onMutation invoked after every successful non-GET response. Wired to the offline
     *   cache so a write from any ViewModel supersedes the cached snapshot centrally, instead
     *   of relying on each call site to remember to invalidate.
     */
    @OptIn(ExperimentalSerializationApi::class)
    fun create(tokenProvider: () -> String?, onMutation: () -> Unit = {}): ApiService {
        val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokenProvider))
            .addInterceptor { chain ->
                val response = chain.proceed(chain.request())
                if (response.isSuccessful && chain.request().method != "GET") onMutation()
                response
            }
            .build()
        return Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ApiService::class.java)
    }
}

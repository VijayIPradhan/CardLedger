package com.imvj.cardledger.data.store

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

class TokenStore(private val context: Context) {
    private val ds get() = prefsDataStore(context)
    private val TOKEN = stringPreferencesKey("cl_token")

    val tokenFlow: Flow<String?> = ds.data.map { it[TOKEN] }
    suspend fun get(): String? = tokenFlow.first()
    suspend fun set(token: String) { ds.edit { it[TOKEN] = token } }
    suspend fun clear() { ds.edit { it.remove(TOKEN) } }
}

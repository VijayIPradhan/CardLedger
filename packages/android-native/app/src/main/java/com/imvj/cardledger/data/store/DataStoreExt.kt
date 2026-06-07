package com.imvj.cardledger.data.store

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore

private val Context.appDataStore by preferencesDataStore(name = "cardledger")
fun prefsDataStore(context: Context): DataStore<Preferences> = context.applicationContext.appDataStore

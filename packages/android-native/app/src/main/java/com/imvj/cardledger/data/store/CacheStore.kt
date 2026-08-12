package com.imvj.cardledger.data.store

import android.content.Context
import com.imvj.cardledger.data.net.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

@Serializable
data class OfflineCache(
    val cards: List<CardDto>,
    val holders: List<HolderDto>,
    val assignments: List<AssignmentDto>,
    val transactions: List<TransactionDto>,
    val payments: List<PaymentDto>,
    val savedAtMillis: Long = System.currentTimeMillis(),
)

class CacheStore(context: Context) {
    private val file = File(context.filesDir, "offline_cache.json")
    private val json = Json { ignoreUnknownKeys = true }

    companion object {
        /** Cache considered stale after 5 minutes of inactivity */
        const val MAX_AGE_MS = 5L * 60 * 1000
    }

    /**
     * Wall-clock of the most recent server-side write, set by [invalidate].
     *
     * In-memory only: a cold start has nothing to invalidate, because the first load of a
     * new process always hits the network anyway (its ViewModel has no recorded fetch yet).
     */
    @Volatile private var invalidatedAtMs: Long = 0L

    /**
     * Marks the cached snapshot as superseded by a server-side write.
     *
     * Called for every successful non-GET request, so any mutation from any ViewModel is
     * covered without each call site having to remember. Cheap and thread-safe — this runs
     * on OkHttp's dispatcher threads.
     */
    fun invalidate() {
        invalidatedAtMs = System.currentTimeMillis()
    }

    suspend fun save(cache: OfflineCache) = withContext(Dispatchers.IO) {
        try {
            file.writeText(json.encodeToString(OfflineCache.serializer(), cache))
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun load(): OfflineCache? = withContext(Dispatchers.IO) {
        if (!file.exists()) return@withContext null
        return@withContext try {
            json.decodeFromString(OfflineCache.serializer(), file.readText())
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    /**
     * Returns true if the cached data is still within the staleness window AND has not been
     * superseded by a write since it was captured.
     *
     * The write check matters as much as the age check: a snapshot captured seconds ago is
     * worthless if the user has since recorded a payment, and treating it as fresh is what
     * lets a stale dashboard survive a whole [MAX_AGE_MS] window.
     */
    fun isFresh(cache: OfflineCache): Boolean =
        cache.savedAtMillis > invalidatedAtMs &&
            (System.currentTimeMillis() - cache.savedAtMillis) < MAX_AGE_MS
}

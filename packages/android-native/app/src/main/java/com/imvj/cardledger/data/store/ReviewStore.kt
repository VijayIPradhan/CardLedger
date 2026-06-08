package com.imvj.cardledger.data.store

import com.imvj.cardledger.domain.ParseResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

@Serializable
data class ReviewItem(val id: String, val parse: ParseResult, val cardId: String?)

class ReviewStore(private val prefs: PrefsStore, private val scope: CoroutineScope) {
    val queue = MutableStateFlow<List<ReviewItem>>(emptyList())
    private val _knownHashes = Collections.newSetFromMap(ConcurrentHashMap<String, Boolean>())
    val knownHashes: Set<String> get() = _knownHashes

    suspend fun init() {
        val hashes = prefs.getProcessedHashes()
        _knownHashes.addAll(hashes)
        
        val json = prefs.getReviewQueueJson()
        if (json.isNotBlank() && json != "[]") {
            try {
                val items = Json.decodeFromString<List<ReviewItem>>(json)
                queue.value = items
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun enqueue(item: ReviewItem) {
        queue.update { it + item }
        _knownHashes.add(item.parse.dedupeHash)
        persist()
    }

    fun addHash(h: String) { 
        _knownHashes.add(h)
        persistHashes()
    }
    
    fun remove(id: String) { 
        queue.update { list -> list.filterNot { it.id == id } }
        persistQueue()
    }
    
    private fun persist() {
        persistHashes()
        persistQueue()
    }
    
    private fun persistHashes() {
        scope.launch { prefs.setProcessedHashes(_knownHashes.toSet()) }
    }
    
    private fun persistQueue() {
        val currentQueue = queue.value
        scope.launch { 
            try {
                prefs.setReviewQueueJson(Json.encodeToString(currentQueue))
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}

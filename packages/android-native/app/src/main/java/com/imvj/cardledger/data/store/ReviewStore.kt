package com.imvj.cardledger.data.store

import com.imvj.cardledger.domain.ParseResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap

data class ReviewItem(val id: String, val parse: ParseResult, val cardId: String?)

object ReviewStore {
    val queue = MutableStateFlow<List<ReviewItem>>(emptyList())
    private val _knownHashes = Collections.newSetFromMap(ConcurrentHashMap<String, Boolean>())
    val knownHashes: Set<String> get() = _knownHashes

    fun enqueue(item: ReviewItem) {
        queue.update { it + item }
        _knownHashes.add(item.parse.dedupeHash)
    }

    fun addHash(h: String) { _knownHashes.add(h) }
    fun remove(id: String) { queue.update { list -> list.filterNot { it.id == id } } }
}

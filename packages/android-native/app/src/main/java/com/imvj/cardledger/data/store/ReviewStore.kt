package com.imvj.cardledger.data.store

import com.imvj.cardledger.domain.ParseResult
import kotlinx.coroutines.flow.MutableStateFlow

data class ReviewItem(val id: String, val parse: ParseResult, val cardId: String?)

object ReviewStore {
    val queue = MutableStateFlow<List<ReviewItem>>(emptyList())
    val knownHashes = mutableSetOf<String>()
    fun enqueue(item: ReviewItem) { queue.value = queue.value + item; knownHashes.add(item.parse.dedupeHash) }
    fun addHash(h: String) { knownHashes.add(h) }
    fun remove(id: String) { queue.value = queue.value.filterNot { it.id == id } }
}

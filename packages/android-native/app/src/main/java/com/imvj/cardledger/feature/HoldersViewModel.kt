package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.*
import com.imvj.cardledger.data.repo.isConflict
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class FriendRow(
    val holder: HolderDto,
    val total: Double,
    val breakdown: List<Pair<CardDto, Double>>,
)

data class HoldersUiState(
    val loading: Boolean = true,
    val friends: List<FriendRow> = emptyList(),
    val error: String? = null,
)

class HoldersViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(HoldersUiState())
    val state: StateFlow<HoldersUiState> = _state

    fun load() {
        viewModelScope.launch {
            val holders = c.holderRepo.list().getOrElse { emptyList() }
            val cards = c.cardRepo.list().getOrElse { emptyList() }
            val txns = c.transactionRepo.list().getOrElse { emptyList() }
            val cardMap = cards.associateBy { it.id }
            val friends = holders.filter { it.relationship == "friend" }.map { h ->
                val mine = txns.filter { it.holder_id_at_time == h.id }
                val total = mine.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
                val byCard = mine.groupBy { it.card_id }
                    .mapNotNull { (cid, list) -> cardMap[cid]?.let { it to list.sumOf { t -> t.amount.toDoubleOrNull() ?: 0.0 } } }
                FriendRow(h, total, byCard)
            }
            _state.value = HoldersUiState(false, friends)
        }
    }

    fun save(name: String, phone: String, editingId: String?, onDone: () -> Unit) {
        if (name.isBlank() || phone.length < 10) {
            _state.value = _state.value.copy(error = "Name and a 10-digit phone required")
            return
        }
        val dto = CreateHolderDto(name.trim(), phone.trim(), "friend")
        viewModelScope.launch {
            val res = if (editingId != null) c.holderRepo.update(editingId, dto) else c.holderRepo.create(dto)
            res.onSuccess { load(); onDone() }
                .onFailure { _state.value = _state.value.copy(error = "Could not save friend") }
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            c.holderRepo.delete(id)
                .onSuccess { load() }
                .onFailure { e ->
                    _state.value = _state.value.copy(
                        error = if (isConflict(e)) "Can't delete — this friend has transactions or assignments." else "Could not delete"
                    )
                }
        }
    }
}

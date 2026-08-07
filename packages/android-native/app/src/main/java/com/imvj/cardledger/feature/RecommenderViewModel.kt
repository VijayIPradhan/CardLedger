package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.CardRecommendationDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class RecommenderUiState(
    val loading: Boolean = false,
    val recommendations: List<CardRecommendationDto> = emptyList(),
    val error: String? = null
)

class RecommenderViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(RecommenderUiState())
    val state: StateFlow<RecommenderUiState> = _state

    fun getRecommendations(amount: Double, category: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                val res = c.api.getCardRecommendations(amount.toString(), category.takeIf { it.isNotBlank() })
                _state.value = _state.value.copy(loading = false, recommendations = res)
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message)
            }
        }
    }
}

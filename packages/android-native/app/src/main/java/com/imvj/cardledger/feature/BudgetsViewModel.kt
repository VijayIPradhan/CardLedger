package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.BudgetDto
import com.imvj.cardledger.data.net.CreateBudgetDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class BudgetsUiState(
    val loading: Boolean = true,
    val budgets: List<BudgetDto> = emptyList(),
    val error: String? = null
)

class BudgetsViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(BudgetsUiState())
    val state: StateFlow<BudgetsUiState> = _state

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                val response = c.api.getBudgets()
                _state.value = _state.value.copy(loading = false, budgets = response)
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message)
            }
        }
    }

    fun addBudget(category: String, limit: Double) {
        viewModelScope.launch {
            try {
                val newBudget = c.api.createBudget(CreateBudgetDto(category, limit))
                _state.value = _state.value.copy(
                    budgets = _state.value.budgets + newBudget
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }
}

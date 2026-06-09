package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class LoginUiState(val loading: Boolean = false, val error: String? = null)

class AuthViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state

    fun login(username: String, password: String, onSuccess: () -> Unit) {
        if (username.isBlank() || password.isBlank()) {
            _state.value = LoginUiState(error = "Enter username and password"); return
        }
        _state.value = LoginUiState(loading = true)
        viewModelScope.launch {
            c.authRepo.login(username.trim(), password)
                .onSuccess { token -> c.tokenStore.set(token); _state.value = LoginUiState(); onSuccess() }
                .onFailure { _state.value = LoginUiState(error = "Login failed — check credentials") }
        }
    }

    fun loginWithGoogle(idToken: String, onSuccess: () -> Unit) {
        _state.value = LoginUiState(loading = true)
        viewModelScope.launch {
            c.authRepo.loginWithGoogle(idToken)
                .onSuccess { token -> c.tokenStore.set(token); _state.value = LoginUiState(); onSuccess() }
                .onFailure { _state.value = LoginUiState(error = "Google login failed") }
        }
    }

    fun setError(message: String) {
        _state.value = LoginUiState(error = message)
    }
}

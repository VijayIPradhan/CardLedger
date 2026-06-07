package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.notif.ReminderScheduler
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class SettingsUiState(
    val pinSet: Boolean = false,
    val biometric: Boolean = true,
    val reminders: Boolean = true,
    val reminderDays: Int = 3,
)

class SettingsViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(SettingsUiState())
    val state: StateFlow<SettingsUiState> = _state

    fun load() {
        viewModelScope.launch {
            _state.value = SettingsUiState(
                pinSet = c.prefsStore.isPinSet(),
                biometric = c.prefsStore.biometricEnabled(),
                reminders = c.prefsStore.remindersEnabled(),
                reminderDays = c.prefsStore.reminderDays(),
            )
        }
    }

    fun setPin(pin: String) { viewModelScope.launch { c.prefsStore.setPin(pin); load() } }
    fun toggleBiometric() { viewModelScope.launch { c.prefsStore.setBiometric(!_state.value.biometric); load() } }

    private fun rescheduleNow() {
        viewModelScope.launch {
            val cards = c.cardRepo.list().getOrElse { emptyList() }
            ReminderScheduler.reschedule(c.appContext, cards, c.prefsStore.reminderDays(), c.prefsStore.remindersEnabled())
        }
    }
    fun toggleReminders() { viewModelScope.launch { c.prefsStore.setReminders(!_state.value.reminders); load(); rescheduleNow() } }
    fun setReminderDays(n: Int) { viewModelScope.launch { c.prefsStore.setReminderDays(n); load(); rescheduleNow() } }

    fun signOut(onDone: () -> Unit) { viewModelScope.launch { c.tokenStore.clear(); onDone() } }
}

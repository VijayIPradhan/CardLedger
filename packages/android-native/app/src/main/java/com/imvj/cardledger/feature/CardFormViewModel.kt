package com.imvj.cardledger.feature

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.imvj.cardledger.AppContainer
import com.imvj.cardledger.data.net.CreateCardDto
import com.imvj.cardledger.data.net.lookupBin
import com.imvj.cardledger.domain.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class CardFormState(
    val isEdit: Boolean = false,
    val cardNumber: String = "",      // transient, never persisted
    val last4: String = "",
    val bin: String = "",
    val network: String = "Visa",
    val bank: String = "",
    val variant: String = "",
    val nickname: String = "",
    val billingDay: Int = 1,
    val dueDay: Int = 20,
    val creditLimit: String = "100000",
    val sharedLimitWith: String? = null,
    val palette: com.imvj.cardledger.data.net.PaletteDto? = null,
    val detectMsg: String? = null,
    val saving: Boolean = false,
    val error: String? = null,
    val bankMetadata: com.imvj.cardledger.data.net.BankVariantMetadataDto? = null,
    val allCards: List<com.imvj.cardledger.data.net.CardDto> = emptyList(),
)

class CardFormViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(CardFormState())
    val state: StateFlow<CardFormState> = _state
    fun update(transform: (CardFormState) -> CardFormState) { _state.value = transform(_state.value) }

    init {
        viewModelScope.launch {
            c.metadataRepo.getBankMetadata().onSuccess { metadata ->
                _state.value = _state.value.copy(bankMetadata = metadata)
            }
        }
        viewModelScope.launch {
            c.cardRepo.list().onSuccess { cards ->
                _state.value = _state.value.copy(allCards = cards)
            }
        }
    }

    fun loadExisting(id: String) {
        viewModelScope.launch {
            c.cardRepo.get(id).onSuccess { card ->
                _state.value = _state.value.copy(
                    isEdit = true, last4 = card.last4, bin = card.bin ?: "",
                    network = card.network, bank = card.bank, variant = card.variant ?: "",
                    nickname = card.nickname, billingDay = card.billing_cycle_day,
                    dueDay = card.payment_due_day, creditLimit = card.credit_limit,
                    sharedLimitWith = card.shared_limit_with, palette = card.palette,
                )
            }
        }
    }

    fun detect() {
        val digits = sanitizeCardNumber(_state.value.cardNumber)
        if (digits.length < 13) return
        val bin = extractBin(digits); val last4 = extractLast4(digits)
        _state.value = _state.value.copy(bin = bin, last4 = last4, detectMsg = "Detecting…")
        viewModelScope.launch {
            val info = lookupBin(bin)
            _state.value = _state.value.copy(
                network = info.network ?: _state.value.network,
                bank = info.bank ?: _state.value.bank,
                variant = info.variant ?: _state.value.variant,
                detectMsg = if (info.network != null || info.bank != null)
                    "Detected: ${info.network ?: "—"} · ${info.bank ?: "—"} · ${info.variant ?: "—"}"
                else "Couldn't detect — enter details manually.",
            )
        }
    }

    fun autoDetectColor() {
        val s = _state.value
        if (s.bank.isBlank()) {
            _state.value = s.copy(error = "Select a bank first to detect color")
            return
        }
        _state.value = s.copy(detectMsg = "Detecting colors...")
        viewModelScope.launch {
            try {
                val req = com.imvj.cardledger.data.net.DetectPaletteRequest(
                    bank = s.bank,
                    network = s.network,
                    variant = s.variant.ifBlank { null }
                )
                val response = c.api.detectPalette(req)
                _state.value = _state.value.copy(
                    palette = com.imvj.cardledger.data.net.PaletteDto(
                        identified_card = response.identified_card,
                        confidence = response.confidence,
                        primary_hex = response.primary_hex,
                        secondary_hex = response.secondary_hex,
                        accent_hex = response.accent_hex,
                        background_type = response.background_type,
                        gradient_direction = response.gradient_direction,
                        svg = response.svg
                    ),
                    detectMsg = "Color detected!"
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = "AI detection failed: ${e.message}", detectMsg = null)
            }
        }
    }

    fun save(editId: String?, onDone: () -> Unit) {
        val s = _state.value
        val limit = s.creditLimit.toDoubleOrNull()
        if (s.last4.length != 4) { _state.value = s.copy(error = "Enter last 4 digits"); return }
        if (s.bank.isBlank() || s.nickname.isBlank()) { _state.value = s.copy(error = "Bank and nickname required"); return }
        if (limit == null || limit <= 0) { _state.value = s.copy(error = "Enter a valid credit limit"); return }
        val dto = CreateCardDto(
            last4 = s.last4, network = s.network, bank = s.bank.trim(), nickname = s.nickname.trim(),
            billing_cycle_day = s.billingDay, payment_due_day = s.dueDay, credit_limit = limit,
            bin = s.bin.ifBlank { null }, variant = s.variant.ifBlank { null },
            shared_limit_with = s.sharedLimitWith, palette = s.palette,
        )
        _state.value = s.copy(saving = true, error = null)
        viewModelScope.launch {
            val res = if (editId != null) c.cardRepo.update(editId, dto) else c.cardRepo.create(dto)
            res.onSuccess { onDone() }.onFailure { _state.value = _state.value.copy(saving = false, error = "Failed to save card") }
        }
    }
}

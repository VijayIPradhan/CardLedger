package com.imvj.cardledger.data.net

import kotlinx.serialization.Serializable

@Serializable data class LoginRequest(val username: String, val password: String)
@Serializable data class LoginResponse(val token: String)

@Serializable
data class CardDto(
    val id: String,
    val last4: String,
    val network: String,
    val bank: String,
    val nickname: String,
    val billing_cycle_day: Int,
    val payment_due_day: Int,
    val credit_limit: String,
    val bin: String? = null,
    val variant: String? = null,
    val created_at: String? = null,
)

@Serializable
data class CreateCardDto(
    val last4: String,
    val network: String,
    val bank: String,
    val nickname: String,
    val billing_cycle_day: Int,
    val payment_due_day: Int,
    val credit_limit: Double,
    val bin: String? = null,
    val variant: String? = null,
)

@Serializable
data class HolderDto(
    val id: String,
    val name: String,
    val phone: String,
    val relationship: String,
    val created_at: String? = null,
)

@Serializable
data class CreateHolderDto(val name: String, val phone: String, val relationship: String)

@Serializable
data class AssignmentDto(
    val id: String,
    val card_id: String,
    val holder_id: String,
    val handed_over_date: String,
    val returned_date: String? = null,
    val created_at: String? = null,
)

@Serializable
data class CreateAssignmentDto(val card_id: String, val holder_id: String, val handed_over_date: String)

@Serializable
data class TransactionDto(
    val id: String,
    val card_id: String,
    val amount: String,
    val merchant: String,
    val txn_date: String,
    val source: String,
    val type: String,
    val is_paid: Boolean = false,
    val holder_id_at_time: String,
    val raw_sms_encrypted: String? = null,
    val dedupe_hash: String? = null,
    val created_at: String? = null,
)

@Serializable
data class CreateTransactionDto(
    val card_id: String,
    val amount: Double,
    val merchant: String,
    val txn_date: String,
    val source: String,
    val type: String = "spend",
    val is_paid: Boolean = false,
    val holder_id_at_time: String? = null,
    val raw_sms_encrypted: String? = null,
    val dedupe_hash: String? = null,
)

@Serializable
data class UpdateTransactionDto(
    val amount: Double? = null,
    val merchant: String? = null,
    val txn_date: String? = null,
    val is_paid: Boolean? = null,
    val holder_id_at_time: String? = null,
)

@Serializable
data class PaymentDto(
    val id: String,
    val holder_id: String,
    val amount: String,
    val payment_date: String,
    val notes: String? = null,
    val created_at: String? = null,
)

@Serializable
data class CreatePaymentDto(
    val holder_id: String,
    val amount: Double,
    val payment_date: String,
    val notes: String? = null,
)

@Serializable
data class BankVariantDto(
    val name: String,
    val variants: List<String>,
)

@Serializable
data class BankVariantMetadataDto(
    val banks: List<BankVariantDto>,
)

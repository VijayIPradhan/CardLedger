package com.imvj.cardledger.data.net

import kotlinx.serialization.Serializable

@Serializable data class LoginRequest(val username: String, val password: String)
@Serializable data class LoginResponse(val token: String)

@Serializable data class GoogleLoginRequest(val idToken: String)

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
    val current_spend: String? = null,
    val bin: String? = null,
    val variant: String? = null,
    val shared_limit_with: String? = null,
    val palette: PaletteDto? = null,
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
    val shared_limit_with: String? = null,
    val palette: PaletteDto? = null,
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
data class UpdateAssignmentDto(val returned_date: String? = null)

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
    val funded_by_holder_id: String? = null,
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
    val transaction_id: String? = null,
    val amount: String,
    val payment_date: String,
    val notes: String? = null,
    val created_at: String? = null,
)

@Serializable
data class CreatePaymentDto(
    val holder_id: String,
    val transaction_id: String? = null,
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

@Serializable
data class DetectPaletteRequest(
    val bank: String,
    val network: String? = null,
    val variant: String? = null,
)

@Serializable
data class PaletteDto(
    val identified_card: String? = null,
    val confidence: Double? = null,
    val primary_hex: String,
    val secondary_hex: String? = null,
    val accent_hex: String? = null,
    val background_type: String? = null,
    val gradient_direction: String? = null,
    val svg: String? = null,
)

@Serializable
data class PaletteResponse(
    val identified_card: String? = null,
    val confidence: Double? = null,
    val primary_hex: String,
    val secondary_hex: String? = null,
    val accent_hex: String? = null,
    val background_type: String? = null,
    val gradient_direction: String? = null,
    val svg: String? = null,
)

@Serializable
data class DueItemDto(
    val cardId: String,
    val dueDate: String,
    val daysUntil: Int,
)

@Serializable
data class SpendByHolderDto(
    val holderId: String,
    val holderName: String,
    val isMe: Boolean = false,
    val spend: Double = 0.0,
)

@Serializable
data class TopMerchantDto(
    val merchant: String,
    val amount: Double = 0.0,
    val count: Int = 0,
)

@Serializable
data class DailySpendDto(
    val date: String,
    val dayLabel: String,
    val amount: Double = 0.0,
    val isToday: Boolean = false,
)

@Serializable
data class UpcomingBillDto(
    val merchant: String,
    val amount: Double = 0.0,
    val expectedDate: String,
)

@Serializable
data class ProjectionDto(
    val cardId: String,
    val currentCycleStart: String,
    val currentCycleEnd: String,
    val currentUnbilled: Double = 0.0,
    val upcomingBills: List<UpcomingBillDto> = emptyList(),
    val projectedTotal: Double = 0.0,
)

@Serializable
data class FriendDebtDto(
    val holderId: String,
    val holderName: String,
    val phone: String = "",
    val totalSpend: Double = 0.0,
    val totalPaid: Double = 0.0,
    val remainingToPay: Double = 0.0,
    val byCard: Map<String, Double> = emptyMap(),
    val rawByCard: Map<String, Double> = emptyMap(),
)

@Serializable
data class DashboardSummaryDto(
    val totalSpend: Double = 0.0,
    val totalLimit: Double = 0.0,
    val totalUtilizationPercent: Double = 0.0,
    val friendTotalSpend: Double = 0.0,
    val friendTotalPaid: Double = 0.0,
    val friendRemainingToPay: Double = 0.0,
    val totalToCollect: Double = 0.0,
    val netPosition: Double = 0.0,
    val unpaidCount: Int = 0,
    val unpaidAmount: Double = 0.0,
    val monthlySpend: Double = 0.0,
    val prevMonthSpend: Double = 0.0,
    val avgDailySpend: Double = 0.0,
    val spendByNetwork: Map<String, Double> = emptyMap(),
    val spendByCard: Map<String, Double> = emptyMap(),
    val toCollectByCard: Map<String, Double> = emptyMap(),
    val dues: List<DueItemDto> = emptyList(),
    val spendByHolder: List<SpendByHolderDto> = emptyList(),
    val topMerchants: List<TopMerchantDto> = emptyList(),
    val dailySpend: List<DailySpendDto> = emptyList(),
    val projections: List<ProjectionDto> = emptyList(),
    val friendDebts: List<FriendDebtDto> = emptyList(),
)

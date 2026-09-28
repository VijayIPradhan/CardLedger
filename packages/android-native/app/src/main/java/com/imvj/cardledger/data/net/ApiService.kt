package com.imvj.cardledger.data.net

import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    @POST("auth/login") suspend fun login(@Body body: LoginRequest): LoginResponse
    @POST("auth/google") suspend fun loginWithGoogle(@Body body: GoogleLoginRequest): LoginResponse

    @GET("cards") suspend fun getCards(): List<CardDto>
    @GET("cards/{id}") suspend fun getCard(@Path("id") id: String): CardDto
    @POST("cards") suspend fun createCard(@Body body: CreateCardDto): CardDto
    @PATCH("cards/{id}") suspend fun updateCard(@Path("id") id: String, @Body body: CreateCardDto): CardDto
    @DELETE("cards/{id}") suspend fun deleteCard(@Path("id") id: String): Response<Unit>

    @GET("holders") suspend fun getHolders(): List<HolderDto>
    @POST("holders") suspend fun createHolder(@Body body: CreateHolderDto): HolderDto
    @PATCH("holders/{id}") suspend fun updateHolder(@Path("id") id: String, @Body body: CreateHolderDto): HolderDto
    @DELETE("holders/{id}") suspend fun deleteHolder(@Path("id") id: String): Response<Unit>

    @GET("assignments") suspend fun getAssignments(
        @Query("card_id") cardId: String? = null,
        @Query("active") active: String? = null,
    ): List<AssignmentDto>
    @POST("assignments") suspend fun createAssignment(@Body body: CreateAssignmentDto): AssignmentDto
    @PATCH("assignments/{id}") suspend fun updateAssignment(@Path("id") id: String, @Body body: UpdateAssignmentDto): AssignmentDto
    @DELETE("assignments/{id}") suspend fun deleteAssignment(@Path("id") id: String): Response<Unit>

    @GET("transactions") suspend fun getTransactions(
        @Query("card_id") cardId: String? = null,
        @Query("holder_id") holderId: String? = null,
    ): List<TransactionDto>
    @POST("transactions") suspend fun createTransaction(@Body body: CreateTransactionDto): TransactionDto
    @PATCH("transactions/{id}") suspend fun updateTransaction(@Path("id") id: String, @Body body: UpdateTransactionDto): TransactionDto
    @DELETE("transactions/{id}") suspend fun deleteTransaction(@Path("id") id: String): Response<Unit>

    @GET("metadata/banks") suspend fun getBankMetadata(): BankVariantMetadataDto
    @POST("metadata/detect-palette") suspend fun detectPalette(@Body body: DetectPaletteRequest): PaletteResponse

    @GET("payments") suspend fun getPayments(@Query("holder_id") holderId: String? = null): List<PaymentDto>
    @POST("payments") suspend fun createPayment(@Body body: CreatePaymentDto): PaymentDto
    @DELETE("payments") suspend fun deletePaymentByTransaction(@Query("transaction_id") txnId: String): Response<Unit>

    @POST("sms/parse/ai") suspend fun parseSmsAi(@Body body: com.imvj.cardledger.domain.SmsInput): com.imvj.cardledger.domain.ParseResult

    @GET("dashboard/summary") suspend fun getDashboardSummary(): DashboardSummaryDto
    @GET("dashboard/card/{cardId}") suspend fun getCardDetail(@Path("cardId") cardId: String): CardDetailDto
    @GET("dashboard/holders") suspend fun getHolderDetails(): List<HolderDetailDto>

    @GET("budgets") suspend fun getBudgets(): List<BudgetDto>
    @POST("budgets") suspend fun createBudget(@Body body: CreateBudgetDto): BudgetDto
    @PATCH("budgets/{id}") suspend fun updateBudget(@Path("id") id: String, @Body body: CreateBudgetDto): BudgetDto
    @DELETE("budgets/{id}") suspend fun deleteBudget(@Path("id") id: String): Response<Unit>

    @GET("cards/recommend") suspend fun getCardRecommendations(
        @Query("amount") amount: String,
        @Query("category") category: String? = null
    ): List<CardRecommendationDto>

    @Multipart
    @POST("statements/upload") suspend fun uploadStatement(
        @Query("card_id") cardId: String,
        @Part file: okhttp3.MultipartBody.Part
    ): okhttp3.ResponseBody

    // Reminders
    @GET("reminders") suspend fun getReminders(@Query("status") status: String? = null): List<ReminderDto>
    @POST("reminders") suspend fun createReminder(@Body body: CreateReminderDto): ReminderDto
    @PATCH("reminders/{id}/dismiss") suspend fun dismissReminder(@Path("id") id: String): ReminderDto
    @DELETE("reminders/{id}") suspend fun deleteReminder(@Path("id") id: String): Response<Unit>

    // Notification Preferences
    @GET("notification-preferences") suspend fun getNotificationPreferences(): List<NotificationPreferenceDto>
    @POST("notification-preferences") suspend fun updateNotificationPreference(@Body body: UpdateNotificationPreferenceDto): NotificationPreferenceDto

    // FCM Token Registration
    @POST("fcm/register") suspend fun registerFcmToken(@Body body: FcmTokenRequest): Response<Unit>

    // Billing Cycles
    @GET("billing-cycles") suspend fun getBillingCycles(
        @Query("card_id") cardId: String? = null,
        @Query("status") status: String? = null
    ): List<BillingCycleDto>
    @GET("billing-cycles/{id}") suspend fun getBillingCycleDetail(@Path("id") id: String): BillingCycleDetailDto
    @POST("billing-cycles") suspend fun createBillingCycle(@Body body: CreateBillingCycleDto): BillingCycleDto
    @PATCH("billing-cycles/{id}") suspend fun updateBillingCycle(@Path("id") id: String, @Body body: UpdateBillingCycleDto): BillingCycleDto
    @POST("billing-cycles/{id}/close") suspend fun closeBillingCycle(@Path("id") id: String): BillingCycleDto
}

package com.imvj.cardledger.data.net

import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    @POST("auth/login") suspend fun login(@Body body: LoginRequest): LoginResponse

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
    @POST("assignments/{id}/return") suspend fun returnAssignment(@Path("id") id: String): AssignmentDto
    @DELETE("assignments/{id}") suspend fun deleteAssignment(@Path("id") id: String): Response<Unit>

    @GET("transactions") suspend fun getTransactions(
        @Query("card_id") cardId: String? = null,
        @Query("holder_id") holderId: String? = null,
    ): List<TransactionDto>
    @POST("transactions") suspend fun createTransaction(@Body body: CreateTransactionDto): TransactionDto
    @PATCH("transactions/{id}") suspend fun updateTransaction(@Path("id") id: String, @Body body: UpdateTransactionDto): TransactionDto
    @DELETE("transactions/{id}") suspend fun deleteTransaction(@Path("id") id: String): Response<Unit>

    @GET("metadata/banks") suspend fun getBankMetadata(): BankVariantMetadataDto

    @GET("payments") suspend fun getPayments(@Query("holder_id") holderId: String? = null): List<PaymentDto>
    @POST("payments") suspend fun createPayment(@Body body: CreatePaymentDto): PaymentDto
}

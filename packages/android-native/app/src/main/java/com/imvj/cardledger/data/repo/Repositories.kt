package com.imvj.cardledger.data.repo

import com.imvj.cardledger.data.net.*
import retrofit2.HttpException

private suspend fun <T> call(block: suspend () -> T): Result<T> =
    try { Result.success(block()) } catch (e: Exception) { Result.failure(e) }

fun isConflict(e: Throwable): Boolean = e is HttpException && e.code() == 409
fun isUnauthorized(e: Throwable): Boolean = e is HttpException && e.code() == 401

class AuthRepository(private val api: ApiService) {
    suspend fun login(username: String, password: String): Result<String> =
        call { api.login(LoginRequest(username, password)).token }
}

class CardRepository(private val api: ApiService) {
    suspend fun list() = call { api.getCards() }
    suspend fun get(id: String) = call { api.getCard(id) }
    suspend fun create(b: CreateCardDto) = call { api.createCard(b) }
    suspend fun update(id: String, b: CreateCardDto) = call { api.updateCard(id, b) }
    suspend fun delete(id: String) = call { api.deleteCard(id); Unit }
}

class HolderRepository(private val api: ApiService) {
    suspend fun list() = call { api.getHolders() }
    suspend fun create(b: CreateHolderDto) = call { api.createHolder(b) }
    suspend fun update(id: String, b: CreateHolderDto) = call { api.updateHolder(id, b) }
    suspend fun delete(id: String) = call { api.deleteHolder(id); Unit }
}

class AssignmentRepository(private val api: ApiService) {
    suspend fun list(cardId: String? = null, active: Boolean? = null) =
        call { api.getAssignments(cardId, if (active == true) "true" else null) }
    suspend fun create(b: CreateAssignmentDto) = call { api.createAssignment(b) }
    suspend fun returnCard(id: String) = call { api.returnAssignment(id) }
    suspend fun delete(id: String) = call { api.deleteAssignment(id); Unit }
}

class TransactionRepository(private val api: ApiService) {
    suspend fun list(cardId: String? = null, holderId: String? = null) = call { api.getTransactions(cardId, holderId) }
    suspend fun create(b: CreateTransactionDto) = call { api.createTransaction(b) }
    suspend fun update(id: String, b: UpdateTransactionDto) = call { api.updateTransaction(id, b) }
    suspend fun delete(id: String) = call { api.deleteTransaction(id); Unit }
}

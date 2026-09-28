package com.imvj.cardledger.domain

import org.junit.Test
import kotlin.test.assertEquals

data class BillAmount(val transactionId: String, val remainingAmount: Double)
data class PaymentAllocation(val transactionId: String, val amount: Double)
data class DistributionResult(val allocations: List<PaymentAllocation>, val excess: Double)

class PaymentDistributionTest {

    @Test
    fun `distributes exact payment to single bill`() {
        val bills = listOf(BillAmount("txn1", 100.0))
        val paymentAmount = 100.0

        val result = distributePayment(paymentAmount, bills)

        assertEquals(1, result.allocations.size)
        assertEquals("txn1", result.allocations[0].transactionId)
        assertEquals(100.0, result.allocations[0].amount)
        assertEquals(0.0, result.excess)
    }

    @Test
    fun `distributes partial payment to single bill`() {
        val bills = listOf(BillAmount("txn1", 100.0))
        val paymentAmount = 60.0

        val result = distributePayment(paymentAmount, bills)

        assertEquals(1, result.allocations.size)
        assertEquals("txn1", result.allocations[0].transactionId)
        assertEquals(60.0, result.allocations[0].amount)
        assertEquals(0.0, result.excess)
    }

    @Test
    fun `distributes excess payment to single bill`() {
        val bills = listOf(BillAmount("txn1", 100.0))
        val paymentAmount = 150.0

        val result = distributePayment(paymentAmount, bills)

        assertEquals(1, result.allocations.size)
        assertEquals("txn1", result.allocations[0].transactionId)
        assertEquals(100.0, result.allocations[0].amount)
        assertEquals(50.0, result.excess)
    }

    @Test
    fun `distributes payment across multiple bills in order`() {
        val bills = listOf(
            BillAmount("txn1", 100.0),
            BillAmount("txn2", 50.0),
            BillAmount("txn3", 75.0)
        )
        val paymentAmount = 200.0

        val result = distributePayment(paymentAmount, bills)

        assertEquals(3, result.allocations.size)
        assertEquals("txn1", result.allocations[0].transactionId)
        assertEquals(100.0, result.allocations[0].amount)
        assertEquals("txn2", result.allocations[1].transactionId)
        assertEquals(50.0, result.allocations[1].amount)
        assertEquals("txn3", result.allocations[2].transactionId)
        assertEquals(50.0, result.allocations[2].amount)
        assertEquals(0.0, result.excess)
    }

    @Test
    fun `stops at first partially paid bill`() {
        val bills = listOf(
            BillAmount("txn1", 100.0),
            BillAmount("txn2", 50.0),
            BillAmount("txn3", 75.0)
        )
        val paymentAmount = 120.0

        val result = distributePayment(paymentAmount, bills)

        assertEquals(2, result.allocations.size)
        assertEquals("txn1", result.allocations[0].transactionId)
        assertEquals(100.0, result.allocations[0].amount)
        assertEquals("txn2", result.allocations[1].transactionId)
        assertEquals(20.0, result.allocations[1].amount)
        assertEquals(0.0, result.excess)
    }

    @Test
    fun `handles zero payment amount`() {
        val bills = listOf(BillAmount("txn1", 100.0))
        val paymentAmount = 0.0

        val result = distributePayment(paymentAmount, bills)

        assertEquals(0, result.allocations.size)
        assertEquals(0.0, result.excess)
    }

    @Test
    fun `handles empty bills list`() {
        val bills = emptyList<BillAmount>()
        val paymentAmount = 100.0

        val result = distributePayment(paymentAmount, bills)

        assertEquals(0, result.allocations.size)
        assertEquals(100.0, result.excess)
    }

    @Test
    fun `distributes payment with large excess`() {
        val bills = listOf(
            BillAmount("txn1", 50.0),
            BillAmount("txn2", 30.0)
        )
        val paymentAmount = 500.0

        val result = distributePayment(paymentAmount, bills)

        assertEquals(2, result.allocations.size)
        assertEquals("txn1", result.allocations[0].transactionId)
        assertEquals(50.0, result.allocations[0].amount)
        assertEquals("txn2", result.allocations[1].transactionId)
        assertEquals(30.0, result.allocations[1].amount)
        assertEquals(420.0, result.excess)
    }
}

package com.imvj.cardledger.domain

data class BillAmount(val transactionId: String, val remainingAmount: Double)
data class PaymentAllocation(val transactionId: String, val amount: Double)
data class DistributionResult(val allocations: List<PaymentAllocation>, val excess: Double)

fun distributePayment(paymentAmount: Double, bills: List<BillAmount>): DistributionResult {
    if (paymentAmount <= 0.0 || bills.isEmpty()) {
        return DistributionResult(
            allocations = emptyList(),
            excess = if (bills.isEmpty()) paymentAmount else 0.0
        )
    }

    val allocations = mutableListOf<PaymentAllocation>()
    var remaining = paymentAmount

    for (bill in bills) {
        if (remaining <= 0.0) break

        val amountToAllocate = minOf(remaining, bill.remainingAmount)
        allocations.add(PaymentAllocation(bill.transactionId, amountToAllocate))
        remaining -= amountToAllocate
    }

    return DistributionResult(allocations, remaining)
}

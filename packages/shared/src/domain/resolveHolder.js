export function resolveHolder(cardId, txnDate, assignments) {
    const match = assignments.find((a) => a.card_id === cardId &&
        a.handed_over_date <= txnDate &&
        (a.returned_date === null || a.returned_date >= txnDate));
    return match?.holder_id ?? null;
}

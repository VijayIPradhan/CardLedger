function toISO(y, m, d) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function getCycleRange(cycleDay, today) {
    const [y, m, d] = today.split('-').map(Number);
    let startYear = y, startMonth = m;
    if (d < cycleDay) {
        startMonth -= 1;
        if (startMonth === 0) {
            startMonth = 12;
            startYear -= 1;
        }
    }
    const start = toISO(startYear, startMonth, cycleDay);
    let endMonth = startMonth + 1, endYear = startYear;
    if (endMonth === 13) {
        endMonth = 1;
        endYear += 1;
    }
    const end = toISO(endYear, endMonth, cycleDay - 1);
    return { start, end };
}
export function getDaysUntilDue(paymentDueDay, today) {
    const [y, m, d] = today.split('-').map(Number);
    let dueYear = y, dueMonth = m;
    if (d > paymentDueDay) {
        dueMonth += 1;
        if (dueMonth === 13) {
            dueMonth = 1;
            dueYear += 1;
        }
    }
    const due = new Date(dueYear, dueMonth - 1, paymentDueDay);
    const now = new Date(y, m - 1, d);
    return Math.max(0, Math.round((due.getTime() - now.getTime()) / 86400000));
}

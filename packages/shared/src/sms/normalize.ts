const MONTH_MAP: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export function normalizeAmount(raw: string): number {
  const cleaned = raw
    .replace(/^(Rs\.?|₹|INR)\s*/i, '')
    .replace(/,/g, '')
    .trim();
  return parseFloat(cleaned);
}

export function normalizeDate(raw: string): string {
  const s = raw.trim();

  // DD-MM-YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  // DD-MMM-YY or DD-MMM-YYYY or DD MMM YYYY
  const dmY = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})$/);
  if (dmY) {
    const month = MONTH_MAP[dmY[2].toLowerCase()];
    const year = dmY[3].length === 2 ? `20${dmY[3]}` : dmY[3];
    return `${year}-${String(month).padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
  }

  // MMM DD, YYYY  (e.g. "Jun 01, 2026")
  const mdy = s.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdy) {
    const month = MONTH_MAP[mdy[1].toLowerCase()];
    return `${mdy[3]}-${String(month).padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }

  return s; // fallback: return as-is
}

export function normalizeMerchant(raw: string): string {
  return raw.trim().replace(/\s{2,}/g, ' ');
}

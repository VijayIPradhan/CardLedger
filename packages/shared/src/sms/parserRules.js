// Named-group regex patterns for each bank.
// Required groups: amount, last4, date, merchant → confidence = 'high'
// Missing any group → confidence = 'low'
export const PARSER_RULES = [
    {
        bank: 'HDFC',
        senderPatterns: ['BZ-HDFCBK', 'HD-HDFCBK', 'HDFCBK'],
        patterns: [
            // "Rs.1,500.00 spent on HDFC Bank Regalia Card XX9876 at Swiggy on 01-06-2026."
            String.raw `Rs\.(?<amount>[\d,]+\.?\d*) spent on HDFC Bank[^C]+Card XX(?<last4>\d{4}) at (?<merchant>[A-Za-z ]+?) on (?<date>\d{2}-\d{2}-\d{4})`,
        ],
    },
    {
        bank: 'ICICI',
        senderPatterns: ['BZ-ICICIB', 'ICICIB', 'ICICIBK'],
        patterns: [
            // "ICICI Bank: Rs.899.00 spent on Amazon Pay Card ending 5432 on Jun 01, 2026 at Amazon."
            String.raw `Rs\.(?<amount>[\d,]+\.?\d*) spent on .+?Card ending (?<last4>\d{4}) on (?<date>[A-Za-z]+ \d{2},? \d{4}) at (?<merchant>[A-Za-z ]+?)\.`,
        ],
    },
    {
        bank: 'SBI',
        senderPatterns: ['AD-SBIINB', 'SBI-UPI', 'SBIINB', 'SBICRD'],
        patterns: [
            // "Rs.2,300.50 debited from SBI Credit Card XX1111 on 01/06/2026 at BigBazaar."
            String.raw `Rs\.(?<amount>[\d,]+\.?\d*) debited from SBI Credit Card XX(?<last4>\d{4}) on (?<date>\d{2}\/\d{2}\/\d{4}) at (?<merchant>[A-Za-z]+)`,
        ],
    },
    {
        bank: 'Axis',
        senderPatterns: ['AX-AXISBK', 'AXISBK'],
        patterns: [
            // "Rs.1,999.00 spent via your Flipkart Axis Bank Card ending 7890 on 01-Jun-26 at Flipkart."
            String.raw `Rs\.(?<amount>[\d,]+\.?\d*) spent via your Flipkart Axis Bank Card ending (?<last4>\d{4}) on (?<date>\d{2}-[A-Za-z]{3}-\d{2}) at (?<merchant>[A-Za-z]+)`,
        ],
    },
];
// Fallback: tried when no bank rule matches the sender
export const FALLBACK_RULE = {
    bank: 'UNKNOWN',
    senderPatterns: [],
    patterns: [
        // Generic spend pattern — captures amount + merchant + date, no last4 → always low confidence
        String.raw `Rs\.?\s*(?<amount>[\d,]+\.?\d*)\s+spent at (?<merchant>.+?) on (?<date>[\d\/]+)`,
        // Generic debit pattern — captures amount + last4, no merchant/date
        String.raw `Rs\.?\s*(?<amount>[\d,]+\.?\d*).*?(?:card|Card).*?(?<last4>\d{4})`,
    ],
};

// packages/shared/src/sms/types.ts
export interface SmsInput {
  sender: string;
  body: string;
  timestamp?: number; // Unix ms — optional (fallback to Date.now())
}

export interface ParseResult {
  bank: string;
  last4: string;
  amount: number;
  merchant: string;
  date: string; // ISO yyyy-MM-dd
  confidence: 'high' | 'low';
  dedupeHash: string;
  raw: SmsInput;
}

export interface ParserRule {
  bank: string;
  senderPatterns: string[];
  patterns: string[]; // RegExp source strings — named groups: amount, last4, date, merchant
  flags?: string; // RegExp flags, defaults to 'i'
}

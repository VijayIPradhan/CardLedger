export type Network = 'Visa' | 'Mastercard' | 'RuPay' | 'Amex';
export type Relationship = 'me' | 'friend';
export type TransactionSource = 'sms' | 'manual';
export type Confidence = 'high' | 'low';

export interface Card {
  id: string;
  last4: string;
  network: Network;
  bank: string;
  nickname: string;
  billing_cycle_day: number;
  payment_due_day: number;
  credit_limit: number;
  bin: string | null;
  variant: string | null;
  shared_limit_with: string | null;
  current_spend?: number;
  created_at: string;
}

export interface Holder {
  id: string;
  name: string;
  phone: string;
  relationship: Relationship;
  created_at: string;
}

export interface Assignment {
  id: string;
  card_id: string;
  holder_id: string;
  handed_over_date: string;
  returned_date: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  card_id: string;
  amount: number;
  merchant: string;
  txn_date: string;
  source: TransactionSource;
  type: 'spend' | 'payment';
  is_paid: boolean;
  holder_id_at_time: string;
  raw_sms_encrypted: string | null;
  dedupe_hash: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  holder_id: string;
  amount: number;
  payment_date: string;
  notes: string | null;
  created_at: string;
}

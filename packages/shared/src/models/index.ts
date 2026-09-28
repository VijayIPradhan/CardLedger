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
  type: 'spend' | 'payment' | 'bill_payment';
  is_paid: boolean;
  holder_id_at_time: string;
  raw_sms_encrypted: string | null;
  dedupe_hash: string | null;
  created_at: string;
  bank_paid_amount?: number;
  linked_transaction_id?: string;
}

export interface Payment {
  id: string;
  holder_id: string;
  amount: number;
  payment_date: string;
  notes: string | null;
  created_at: string;
}

export type ReminderType = 'payment_due' | 'statement_date' | 'overdue' | 'cycle_usage_threshold';

export type ReminderStatus = 'scheduled' | 'fired' | 'dismissed' | 'cancelled';

export interface Reminder {
  id: string;
  user_id: string;
  card_id?: string;
  reminder_type: ReminderType;
  scheduled_for: string;
  card_cycle_start?: string;
  card_cycle_end?: string;
  threshold_amount?: number;
  requires_usage: boolean;
  status: ReminderStatus;
  fired_at?: string;
  dismissed_at?: string;
  notified_via?: ('push' | 'email')[];
  created_at: string;
  updated_at: string;
}

export interface NotificationPreference {
  id: string;
  user_id: string;
  card_id?: string;
  reminder_type: ReminderType;
  days_before?: number;
  enabled: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
  preferred_time: string;
  created_at: string;
  updated_at: string;
}

export type BillingCycleStatus = 'projected' | 'generated' | 'paid' | 'overdue';

export interface BillingCycle {
  id: string;
  user_id: string;
  card_id: string;
  cycle_start: string;
  cycle_end: string;
  statement_date: string;
  payment_due_date: string;
  total_spend: number;
  total_refunds: number;
  previous_balance: number;
  statement_amount: number;
  minimum_due?: number;
  paid_amount: number;
  paid_on?: string;
  status: BillingCycleStatus;
  is_locked: boolean;
  statement_pdf_url?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

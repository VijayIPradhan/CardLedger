import { z } from 'zod';

export const NetworkSchema = z.enum(['Visa', 'Mastercard', 'RuPay', 'Amex']);
export const RelationshipSchema = z.enum(['me', 'friend']);
export const TransactionSourceSchema = z.enum(['sms', 'manual']);

export const CreateCardSchema = z.object({
  last4: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits'),
  network: NetworkSchema,
  bank: z.string().min(1).max(100),
  nickname: z.string().min(1).max(100),
  billing_cycle_day: z.number().int().min(1).max(28),
  payment_due_day: z.number().int().min(1).max(28),
  credit_limit: z.number().positive(),
  bin: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  variant: z.string().max(100).optional(),
});

export const UpdateCardSchema = CreateCardSchema.partial();

export const CreateHolderSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(10).max(15),
  relationship: RelationshipSchema,
});

export const UpdateHolderSchema = CreateHolderSchema.partial();

export const CreateAssignmentSchema = z.object({
  card_id: z.string().uuid(),
  holder_id: z.string().uuid(),
  handed_over_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const CreateTransactionSchema = z.object({
  card_id: z.string().uuid(),
  amount: z.number().positive(),
  merchant: z.string().min(1).max(200),
  txn_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: TransactionSourceSchema,
  holder_id_at_time: z.string().uuid().optional(), // "who used" — manual override
  raw_sms_encrypted: z.string().nullable().optional(),
  dedupe_hash: z.string().nullable().optional(),
});

export const UpdateTransactionSchema = z.object({
  amount: z.number().positive().optional(),
  merchant: z.string().min(1).max(200).optional(),
  txn_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  holder_id_at_time: z.string().uuid().optional(),
});

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(8),
});

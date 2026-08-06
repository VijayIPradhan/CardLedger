import { z } from 'zod';

export const NetworkSchema = z.enum(['Visa', 'Mastercard', 'RuPay', 'Amex']);
export const RelationshipSchema = z.enum(['me', 'friend']);
export const TransactionSourceSchema = z.enum(['sms', 'manual']);
export const TransactionTypeSchema = z.enum(['spend', 'payment', 'bill_payment']);

export const CreateCardSchema = z.object({
  last4: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits'),
  network: NetworkSchema,
  bank: z.string().min(1).max(100),
  nickname: z.string().min(1).max(100),
  billing_cycle_day: z.number().int().min(1).max(28),
  payment_due_day: z.number().int().min(1).max(28),
  credit_limit: z.number().positive(),
  palette: z.any().nullable().optional(),
  bin: z
    .string()
    .regex(/^\d{6}$/)
    .nullable()
    .optional(),
  variant: z.string().max(100).nullable().optional(),
  shared_limit_with: z.string().uuid().nullable().optional(),
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

export const UpdateAssignmentSchema = CreateAssignmentSchema.extend({
  returned_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
}).partial();

export const CreateTransactionSchema = z.object({
  card_id: z.string().uuid(),
  amount: z.number().positive(),
  merchant: z.string().min(1).max(200),
  txn_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: TransactionSourceSchema,
  type: TransactionTypeSchema.default('spend'),
  is_paid: z.boolean().default(false),
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
  type: TransactionTypeSchema.optional(),
  is_paid: z.boolean().optional(),
  holder_id_at_time: z.string().uuid().optional(),
});

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(8),
});

export const GoogleLoginSchema = z.object({
  idToken: z.string().min(1),
});

export const CreatePaymentSchema = z.object({
  holder_id: z.string().uuid(),
  transaction_id: z.string().uuid().optional().nullable(),
  amount: z.number().positive(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(200).optional().nullable(),
});

export const UpdatePaymentSchema = CreatePaymentSchema.partial();

export const BankVariantMetadataSchema = z.object({
  banks: z.array(
    z.object({
      name: z.string(),
      variants: z.array(z.string()),
    }),
  ),
});

export type BankVariantMetadata = z.infer<typeof BankVariantMetadataSchema>;

export const DetectPaletteSchema = z.object({
  bank: z.string(),
  network: z.string().optional(),
  variant: z.string().optional(),
});
export type DetectPaletteDto = z.infer<typeof DetectPaletteSchema>;

export const PaletteSchema = z.object({
  identified_card: z.string().optional(),
  confidence: z.number().optional(),
  primary_hex: z.string(),
  secondary_hex: z.string().optional(),
  accent_hex: z.string().optional(),
  background_type: z.string().optional(),
  gradient_direction: z.string().optional(),
  svg: z.string().optional(),
});
export type PaletteDto = z.infer<typeof PaletteSchema>;

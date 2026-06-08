import {
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  date,
  timestamp,
  text,
  boolean,
  jsonb,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  password_hash: text('password_hash').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const holders = pgTable('holders', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 15 }).notNull(),
  relationship: varchar('relationship', { length: 10 }).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const cards = pgTable('cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  last4: varchar('last4', { length: 4 }).notNull(),
  network: varchar('network', { length: 20 }).notNull(),
  bank: varchar('bank', { length: 100 }).notNull(),
  nickname: varchar('nickname', { length: 100 }).notNull(),
  billing_cycle_day: integer('billing_cycle_day').notNull(),
  payment_due_day: integer('payment_due_day').notNull(),
  credit_limit: numeric('credit_limit', { precision: 12, scale: 2 }).notNull(),
  palette: jsonb('palette'),
  bin: varchar('bin', { length: 6 }),
  variant: varchar('variant', { length: 100 }),
  shared_limit_with: uuid('shared_limit_with'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  card_id: uuid('card_id')
    .references(() => cards.id)
    .notNull(),
  holder_id: uuid('holder_id')
    .references(() => holders.id)
    .notNull(),
  handed_over_date: date('handed_over_date').notNull(),
  returned_date: date('returned_date'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  card_id: uuid('card_id')
    .references(() => cards.id)
    .notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  merchant: varchar('merchant', { length: 200 }).notNull(),
  txn_date: date('txn_date').notNull(),
  source: varchar('source', { length: 10 }).notNull(),
  type: varchar('type', { length: 20 }).default('spend').notNull(),
  is_paid: boolean('is_paid').default(false).notNull(),
  holder_id_at_time: uuid('holder_id_at_time')
    .references(() => holders.id)
    .notNull(),
  raw_sms_encrypted: text('raw_sms_encrypted'),
  dedupe_hash: varchar('dedupe_hash', { length: 64 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  holder_id: uuid('holder_id')
    .references(() => holders.id)
    .notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  payment_date: date('payment_date').notNull(),
  notes: varchar('notes', { length: 200 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

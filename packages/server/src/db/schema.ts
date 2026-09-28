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
  index,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  email: varchar('email', { length: 255 }).unique(),
  password_hash: text('password_hash'),
  google_id: varchar('google_id', { length: 255 }).unique(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const holders = pgTable(
  'holders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    phone: varchar('phone', { length: 15 }).notNull(),
    relationship: varchar('relationship', { length: 10 }).notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('holders_user_id_idx').on(table.user_id),
  }),
);

export const cards = pgTable(
  'cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .references(() => users.id)
      .notNull(),
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
    rewards_schema: jsonb('rewards_schema'),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('cards_user_id_idx').on(table.user_id),
  }),
);

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    category: varchar('category', { length: 100 }).notNull(),
    limit_amount: numeric('limit_amount', { precision: 12, scale: 2 }).notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('budgets_user_id_idx').on(table.user_id),
  }),
);

export const assignments = pgTable(
  'assignments',
  {
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
  },
  (table) => ({
    cardIdIdx: index('assignments_card_id_idx').on(table.card_id),
    holderIdIdx: index('assignments_holder_id_idx').on(table.holder_id),
  }),
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    card_id: uuid('card_id')
      .references(() => cards.id)
      .notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    merchant: varchar('merchant', { length: 200 }).notNull(),
    txn_date: date('txn_date').notNull(),
    source: varchar('source', { length: 10 }).notNull(),
    type: varchar('type', { length: 20 }).default('spend').notNull(),
    category: varchar('category', { length: 100 }),
    tags: jsonb('tags'),
    original_currency: varchar('original_currency', { length: 3 }),
    original_amount: numeric('original_amount', { precision: 12, scale: 2 }),
    forex_markup_fee: numeric('forex_markup_fee', { precision: 12, scale: 2 }),
    reward_earned: numeric('reward_earned', { precision: 12, scale: 2 }),
    reward_currency: varchar('reward_currency', { length: 20 }),
    is_paid: boolean('is_paid').default(false).notNull(),
    /** Total card_payments received against this transaction. Auto-sets is_paid when >= amount */
    payments_received: numeric('payments_received', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),
    holder_id_at_time: uuid('holder_id_at_time')
      .references(() => holders.id)
      .notNull(),
    billing_cycle_id: uuid('billing_cycle_id').references(() => billing_cycles.id),
    parent_payment_id: uuid('parent_payment_id'),
    is_parent: boolean('is_parent').default(false),
    linked_transaction_id: uuid('linked_transaction_id'),
    raw_sms_encrypted: text('raw_sms_encrypted'),
    dedupe_hash: varchar('dedupe_hash', { length: 64 }),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    cardIdIdx: index('transactions_card_id_idx').on(table.card_id),
    holderIdIdx: index('transactions_holder_id_idx').on(table.holder_id_at_time),
    txnDateIdx: index('transactions_txn_date_idx').on(table.txn_date),
    cycleIdx: index('idx_transactions_cycle').on(table.billing_cycle_id),
    parentIdx: index('idx_transactions_parent').on(table.parent_payment_id),
    isParentIdx: index('idx_transactions_is_parent').on(table.is_parent),
    linkedIdx: index('idx_transactions_linked').on(table.linked_transaction_id),
  }),
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    holder_id: uuid('holder_id')
      .references(() => holders.id)
      .notNull(),
    transaction_id: uuid('transaction_id').references(() => transactions.id),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    payment_date: date('payment_date').notNull(),
    notes: varchar('notes', { length: 200 }),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    holderIdIdx: index('payments_holder_id_idx').on(table.holder_id),
  }),
);

export const card_payments = pgTable(
  'card_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    card_id: uuid('card_id')
      .references(() => cards.id)
      .notNull(),
    holder_id: uuid('holder_id')
      .references(() => holders.id)
      .notNull(),
    transaction_id: uuid('transaction_id').references(() => transactions.id),
    billing_cycle_id: uuid('billing_cycle_id').references(() => billing_cycles.id),
    parent_payment_id: uuid('parent_payment_id'),
    is_parent: boolean('is_parent').default(false),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    payment_date: date('payment_date').notNull(),
    notes: varchar('notes', { length: 200 }),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    cardIdIdx: index('card_payments_card_id_idx').on(table.card_id),
    holderIdIdx: index('card_payments_holder_id_idx').on(table.holder_id),
    cycleIdx: index('idx_card_payments_cycle').on(table.billing_cycle_id),
    parentIdx: index('idx_card_payments_parent').on(table.parent_payment_id),
    isParentIdx: index('idx_card_payments_is_parent').on(table.is_parent),
  }),
);

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    card_id: uuid('card_id').references(() => cards.id, { onDelete: 'cascade' }),
    reminder_type: varchar('reminder_type', { length: 30 }).notNull(),
    scheduled_for: timestamp('scheduled_for').notNull(),
    card_cycle_start: date('card_cycle_start'),
    card_cycle_end: date('card_cycle_end'),
    threshold_amount: numeric('threshold_amount', { precision: 12, scale: 2 }),
    requires_usage: boolean('requires_usage').default(false),
    status: varchar('status', { length: 20 }).default('scheduled').notNull(),
    fired_at: timestamp('fired_at'),
    dismissed_at: timestamp('dismissed_at'),
    notified_via: jsonb('notified_via'),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userScheduledIdx: index('idx_reminders_user_scheduled').on(table.user_id, table.scheduled_for),
    cardCycleIdx: index('idx_reminders_card_cycle').on(
      table.card_id,
      table.card_cycle_start,
      table.card_cycle_end,
    ),
  }),
);

export const notification_preferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  card_id: uuid('card_id').references(() => cards.id, { onDelete: 'cascade' }),
  reminder_type: varchar('reminder_type', { length: 30 }).notNull(),
  days_before: integer('days_before'),
  enabled: boolean('enabled').default(true).notNull(),
  push_enabled: boolean('push_enabled').default(true).notNull(),
  email_enabled: boolean('email_enabled').default(false).notNull(),
  preferred_time: varchar('preferred_time', { length: 8 }).default('09:00:00'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const billing_cycles = pgTable(
  'billing_cycles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    card_id: uuid('card_id')
      .references(() => cards.id, { onDelete: 'cascade' })
      .notNull(),
    cycle_start: date('cycle_start').notNull(),
    cycle_end: date('cycle_end').notNull(),
    statement_date: date('statement_date').notNull(),
    payment_due_date: date('payment_due_date').notNull(),
    total_spend: numeric('total_spend', { precision: 12, scale: 2 }).default('0').notNull(),
    total_refunds: numeric('total_refunds', { precision: 12, scale: 2 }).default('0').notNull(),
    previous_balance: numeric('previous_balance', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),
    statement_amount: numeric('statement_amount', { precision: 12, scale: 2 }).notNull(),
    minimum_due: numeric('minimum_due', { precision: 12, scale: 2 }),
    paid_amount: numeric('paid_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    paid_on: date('paid_on'),
    status: varchar('status', { length: 20 }).default('projected').notNull(),
    is_locked: boolean('is_locked').default(false).notNull(),
    statement_pdf_url: text('statement_pdf_url'),
    notes: text('notes'),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    cardDateIdx: index('idx_cycles_card_date').on(table.card_id, table.statement_date),
    dueDateIdx: index('idx_cycles_due_date').on(table.payment_due_date),
  }),
);

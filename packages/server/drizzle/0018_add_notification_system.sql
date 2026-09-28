-- Migration: Add notification system tables
-- Date: 2026-09-28

-- Create reminders table
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id UUID REFERENCES cards(id) ON DELETE CASCADE,
  reminder_type VARCHAR(30) NOT NULL, -- 'payment_due', 'statement_date', 'overdue', 'cycle_usage_threshold'
  scheduled_for TIMESTAMP NOT NULL,
  card_cycle_start DATE, -- Which billing cycle this reminder is for (nullable)
  card_cycle_end DATE,

  -- Alert conditions
  threshold_amount NUMERIC(12,2), -- For usage threshold alerts
  requires_usage BOOLEAN DEFAULT false, -- Only fire if cycle has unpaid transactions

  -- Status tracking
  status VARCHAR(20) DEFAULT 'scheduled', -- 'scheduled', 'fired', 'dismissed', 'cancelled'
  fired_at TIMESTAMP,
  dismissed_at TIMESTAMP,
  notified_via JSONB, -- ['push', 'email'] - which channels were used

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_reminders_user_scheduled ON reminders(user_id, scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_reminders_card_cycle ON reminders(card_id, card_cycle_start, card_cycle_end);

-- Create notification preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id UUID REFERENCES cards(id) ON DELETE CASCADE, -- NULL = default for all cards

  reminder_type VARCHAR(30) NOT NULL, -- 'payment_due', 'statement_date', 'overdue'

  days_before INTEGER, -- For due/statement reminders
  enabled BOOLEAN DEFAULT true,

  -- Channels (at least one must be true if enabled)
  push_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT false,

  -- Smart scheduling
  preferred_time TIME DEFAULT '09:00:00',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, card_id, reminder_type),
  CHECK (NOT enabled OR (push_enabled OR email_enabled))
);

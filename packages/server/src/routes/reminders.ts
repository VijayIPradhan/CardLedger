import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { reminders, notification_preferences, cards } from '../db/schema.js';
import { eq, and, asc, sql } from 'drizzle-orm';

/**
 * Routes for /reminders endpoints
 */
export async function reminderRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  /**
   * GET /reminders
   * List all reminders for authenticated user with optional status filter
   */
  app.get<{ Querystring: { status?: string } }>('/', auth, async (req) => {
    const userId = req.user.sub;
    const { status } = req.query;

    const conditions = [eq(reminders.user_id, userId)];
    if (status) {
      conditions.push(eq(reminders.status, status));
    }

    return db
      .select()
      .from(reminders)
      .where(and(...conditions))
      .orderBy(asc(reminders.scheduled_for));
  });

  /**
   * POST /reminders
   * Create a new reminder
   */
  app.post<{
    Body: {
      card_id?: string;
      reminder_type: string;
      scheduled_for: string;
      card_cycle_start?: string;
      card_cycle_end?: string;
      threshold_amount?: number;
      requires_usage?: boolean;
    };
  }>('/', auth, async (req, reply) => {
    const userId = req.user.sub;
    const {
      card_id,
      reminder_type,
      scheduled_for,
      card_cycle_start,
      card_cycle_end,
      threshold_amount,
      requires_usage,
    } = req.body;

    // Validate required fields
    if (!reminder_type || !scheduled_for) {
      return reply
        .status(400)
        .send({ error: 'Missing required fields: reminder_type, scheduled_for' });
    }

    // Validate card ownership if card_id is provided
    if (card_id) {
      const [card] = await db
        .select({ id: cards.id })
        .from(cards)
        .where(and(eq(cards.id, card_id), eq(cards.user_id, userId)));

      if (!card) {
        return reply.status(404).send({ error: 'Card not found' });
      }
    }

    const [reminder] = await db
      .insert(reminders)
      .values({
        user_id: userId,
        card_id: card_id ?? null,
        reminder_type,
        scheduled_for: new Date(scheduled_for),
        card_cycle_start: card_cycle_start ?? null,
        card_cycle_end: card_cycle_end ?? null,
        threshold_amount: threshold_amount ? String(threshold_amount) : null,
        requires_usage: requires_usage ?? false,
        status: 'scheduled',
      })
      .returning();

    return reply.status(201).send(reminder);
  });

  /**
   * PATCH /reminders/:id/dismiss
   * Dismiss a reminder
   */
  app.patch<{ Params: { id: string } }>('/:id/dismiss', auth, async (req, reply) => {
    const userId = req.user.sub;
    const { id } = req.params;

    // Verify ownership
    const [existing] = await db
      .select({ id: reminders.id, status: reminders.status })
      .from(reminders)
      .where(and(eq(reminders.id, id), eq(reminders.user_id, userId)));

    if (!existing) {
      return reply.status(404).send({ error: 'Reminder not found' });
    }

    const [updated] = await db
      .update(reminders)
      .set({
        status: 'dismissed',
        dismissed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(reminders.id, id))
      .returning();

    return updated;
  });

  /**
   * DELETE /reminders/:id
   * Cancel a reminder (only if status is 'scheduled')
   */
  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const userId = req.user.sub;
    const { id } = req.params;

    // Verify ownership and status
    const [existing] = await db
      .select({ id: reminders.id, status: reminders.status })
      .from(reminders)
      .where(and(eq(reminders.id, id), eq(reminders.user_id, userId)));

    if (!existing) {
      return reply.status(404).send({ error: 'Reminder not found' });
    }

    if (existing.status !== 'scheduled') {
      return reply.status(400).send({ error: 'Can only cancel scheduled reminders' });
    }

    await db
      .update(reminders)
      .set({
        status: 'cancelled',
        updated_at: new Date(),
      })
      .where(eq(reminders.id, id));

    return reply.status(204).send();
  });
}

/**
 * Routes for /notification-preferences endpoints
 */
export async function notificationPreferenceRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  /**
   * GET /notification-preferences
   * Get user's notification preferences
   */
  app.get('/', auth, async (req) => {
    const userId = req.user.sub;

    const prefs = await db
      .select()
      .from(notification_preferences)
      .where(eq(notification_preferences.user_id, userId))
      .orderBy(asc(notification_preferences.reminder_type));

    return prefs;
  });

  /**
   * POST /notification-preferences
   * Create or update notification preference (upsert)
   */
  app.post<{
    Body: {
      card_id?: string;
      reminder_type: string;
      days_before?: number;
      enabled?: boolean;
      push_enabled?: boolean;
      email_enabled?: boolean;
      preferred_time?: string;
    };
  }>('/', auth, async (req, reply) => {
    const userId = req.user.sub;
    const {
      card_id,
      reminder_type,
      days_before,
      enabled,
      push_enabled,
      email_enabled,
      preferred_time,
    } = req.body;

    // Validate required fields
    if (!reminder_type) {
      return reply.status(400).send({ error: 'Missing required field: reminder_type' });
    }

    // Validate card ownership if card_id is provided
    if (card_id) {
      const [card] = await db
        .select({ id: cards.id })
        .from(cards)
        .where(and(eq(cards.id, card_id), eq(cards.user_id, userId)));

      if (!card) {
        return reply.status(404).send({ error: 'Card not found' });
      }
    }

    // Upsert using ON CONFLICT
    // Note: PostgreSQL specific syntax with onConflictDoUpdate
    const values = {
      user_id: userId,
      card_id: card_id ?? null,
      reminder_type,
      days_before: days_before ?? null,
      enabled: enabled ?? true,
      push_enabled: push_enabled ?? true,
      email_enabled: email_enabled ?? false,
      preferred_time: preferred_time ?? '09:00:00',
      updated_at: new Date(),
    };

    const [pref] = await db
      .insert(notification_preferences)
      .values(values)
      .onConflictDoUpdate({
        target: [
          notification_preferences.user_id,
          notification_preferences.card_id,
          notification_preferences.reminder_type,
        ],
        set: {
          days_before: sql`EXCLUDED.days_before`,
          enabled: sql`EXCLUDED.enabled`,
          push_enabled: sql`EXCLUDED.push_enabled`,
          email_enabled: sql`EXCLUDED.email_enabled`,
          preferred_time: sql`EXCLUDED.preferred_time`,
          updated_at: sql`EXCLUDED.updated_at`,
        },
      })
      .returning();

    return reply.status(201).send(pref);
  });
}

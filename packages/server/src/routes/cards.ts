import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { cards, transactions, assignments } from '../db/schema.js';
import { eq, sql, getTableColumns } from 'drizzle-orm';
import { CreateCardSchema, UpdateCardSchema, DetectPaletteSchema } from '@cardledger/shared';
import { GoogleGenAI } from '@google/genai';

export async function cardRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get('/', auth, async () => {
    return db
      .select({
        ...getTableColumns(cards),
        current_spend: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.is_paid} = FALSE THEN ${transactions.amount} ELSE 0 END), 0)`,
      })
      .from(cards)
      .leftJoin(transactions, eq(cards.id, transactions.card_id))
      .groupBy(cards.id)
      .orderBy(cards.created_at);
  });

  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const [card] = await db
      .select({
        ...getTableColumns(cards),
        current_spend: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.is_paid} = FALSE THEN ${transactions.amount} ELSE 0 END), 0)`,
      })
      .from(cards)
      .leftJoin(transactions, eq(cards.id, transactions.card_id))
      .where(eq(cards.id, req.params.id))
      .groupBy(cards.id);
    if (!card) return reply.status(404).send({ error: 'Not found' });
    return card;
  });

  app.post('/', auth, async (req, reply) => {
    const parsed = CreateCardSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const { credit_limit, ...rest } = parsed.data;
    const [card] = await db
      .insert(cards)
      .values({ ...rest, credit_limit: String(credit_limit) })
      .returning();
    return reply.status(201).send(card);
  });

  app.patch<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const parsed = UpdateCardSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const { credit_limit, ...rest } = parsed.data;
    const update =
      credit_limit !== undefined ? { ...rest, credit_limit: String(credit_limit) } : rest;
    const [card] = await db
      .update(cards)
      .set(update)
      .where(eq(cards.id, req.params.id))
      .returning();
    if (!card) return reply.status(404).send({ error: 'Not found' });
    return card;
  });

  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const [txn] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.card_id, req.params.id))
      .limit(1);
    if (txn) {
      return reply.status(409).send({ error: 'Card has transactions' });
    }
    await db.transaction(async (tx) => {
      await tx.delete(assignments).where(eq(assignments.card_id, req.params.id));
      await tx.delete(cards).where(eq(cards.id, req.params.id));
    });
    return reply.status(204).send();
  });

  app.post('/detect-palette', auth, async (req, reply) => {
    const parsed = DetectPaletteSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const prompt = `You are an expert in credit card designs in India. For the following credit card, provide the primary physical background color of the card.
    
    Bank: ${parsed.data.bank}
    Network: ${parsed.data.network || 'Unknown'}
    Variant: ${parsed.data.variant || 'Unknown'}

    Return ONLY a JSON object exactly like this, with no markdown formatting:
    {"primary_hex": "#HexCode"}
    
    Make the hex code a realistic, premium, deep color if possible, matching the physical real-world card.`;

    try {
      let txt: string;

      if (process.env.OPENROUTER_API_KEY) {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!response.ok) {
          throw new Error(`OpenRouter API error: ${response.status} ${await response.text()}`);
        }

        const json = (await response.json()) as any;
        txt = json.choices?.[0]?.message?.content;
      } else if (process.env.GEMINI_API_KEY) {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        });
        txt = response.text || '';
      } else {
        throw new Error('No AI provider configured — set GEMINI_API_KEY or OPENROUTER_API_KEY');
      }

      if (!txt) throw new Error('No text returned from AI');
      // Clean up markdown block if present (sometimes models ignore the "no markdown" instruction)
      txt = txt
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      const data = JSON.parse(txt);
      if (data.primary_hex) {
        return reply.send({ primary_hex: data.primary_hex });
      } else {
        throw new Error('Invalid JSON format from AI');
      }
    } catch (e) {
      req.log.error(e, 'Failed to detect palette');
      return reply.status(500).send({ error: 'Failed to detect color palette' });
    }
  });
}

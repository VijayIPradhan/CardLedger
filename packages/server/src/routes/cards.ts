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

    const prompt = `You are an expert credit card design identification engine.
Your task is to identify the exact physical credit card issued in India and recreate its visual design as accurately as possible.
Input:
* Bank: ${parsed.data.bank}
* Network: ${parsed.data.network || 'Unknown'}
* Variant: ${parsed.data.variant || 'Unknown'}

Workflow (MANDATORY):
1. Search the web for the exact card using:
   * Bank name
   * Card variant
   * Network
   * Official issuer website
   * Official marketing images
2. Prioritize sources in this order:
   * Official bank websites
   * Official issuer press releases
   * Official application pages
   * Official card images
3. Never infer colors from bank branding alone if a card image is available.
4. Visually analyze the actual card image and determine:
   * Primary background color
   * Secondary color
   * Accent color
   * Gradient direction
   * Background texture
   * Geometric patterns
   * Metallic effects
   * Matte or glossy appearance
5. Extract colors from the card background only.
   Ignore:
   * Visa logo
   * Mastercard logo
   * RuPay logo
   * American Express logo
   * Card chip
   * Card number
   * Cardholder name
   * Bank logo
6. Generate a simplified SVG that resembles the real card background.
7. If multiple card generations exist, use the newest official design.
8. If the exact card cannot be identified:
   * Fall back to the bank's official brand palette.
   * Set confidence below 0.70.

Confidence Scale:
* 1.00 = Exact official card image found
* 0.90 = Multiple matching official images found
* 0.75 = Variant inferred from official sources
* <0.70 = Bank-color fallback

Return ONLY valid JSON.
{
  "identified_card": "Exact card name",
  "confidence": 0.0,
  "primary_hex": "#000000",
  "secondary_hex": "#000000",
  "accent_hex": "#000000",
  "background_type": "solid|gradient|pattern",
  "gradient_direction": "none|horizontal|vertical|diagonal",
  "svg": "<svg>...</svg>"
}

Important:
* Do NOT guess.
* Do NOT use stereotypical premium colors.
* Do NOT assume Amazon cards are orange or premium cards are black.
* The returned colors must match the actual physical card visible in official images.
* The SVG should visually resemble the real card background as closely as possible.`;

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
            tools: [{ googleSearch: {} }],
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
        return reply.send(data);
      } else {
        throw new Error('Invalid JSON format from AI');
      }
    } catch (e) {
      req.log.error(e, 'Failed to detect palette');
      return reply.status(500).send({ error: 'Failed to detect color palette' });
    }
  });
}

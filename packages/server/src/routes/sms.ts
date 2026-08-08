import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { createHash } from 'crypto';

const parseRequestSchema = z.object({
  sender: z.string(),
  body: z.string(),
  timestamp: z.number().optional(),
});

const SMS_SYSTEM_PROMPT = `You are an SMS transaction parser. Given an SMS from a bank, extract the transaction details as JSON.

Rules:
- "bank": The bank name (e.g. HDFC, ICICI, SBI, Axis)
- "last4": The last 4 digits of the card or account
- "amount": The transaction amount as a number
- "merchant": The merchant name. For bill payments, use CRED, HDFC Bank, etc.
- "date": The transaction date in YYYY-MM-DD format
- "type": "spend" if the user spent money, "bill_payment" if a credit card bill payment, "refund" if a refund or reversal
- "is_paid": true only if the SMS explicitly indicates the amount was immediately settled

Return ONLY valid JSON with these fields. All fields except is_paid are required.`;

function buildUserPrompt(sender: string, body: string): string {
  return `Analyze the following SMS from sender: ${sender}.\nBody: ${body}\n\nIs this a debit (spend) or credit (payment/refund)? Extract the details as JSON.`;
}

async function parseWithOpenRouter(
  apiKey: string,
  sender: string,
  body: string,
  model: string,
): Promise<Record<string, unknown>> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://cardledger.app',
      'X-Title': 'CardLedger',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SMS_SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(sender, body) },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter returned empty content');
  return JSON.parse(text);
}

async function parseWithGemini(
  ai: GoogleGenAI,
  sender: string,
  body: string,
): Promise<Record<string, unknown>> {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      bank: {
        type: Type.STRING,
        description: 'The name of the bank (e.g. HDFC, ICICI, SBI, Axis)',
      },
      last4: { type: Type.STRING, description: 'The last 4 digits of the card or account' },
      amount: { type: Type.NUMBER, description: 'The amount of the transaction as a number' },
      merchant: { type: Type.STRING, description: 'The name of the merchant' },
      date: { type: Type.STRING, description: 'The date of the transaction in YYYY-MM-DD format' },
      type: {
        type: Type.STRING,
        description:
          'spend if the user spent money; bill_payment if a bill payment; refund if a refund or reversal',
        enum: ['spend', 'payment', 'bill_payment', 'refund'],
      },
      is_paid: {
        type: Type.BOOLEAN,
        description: 'true if the SMS explicitly indicates the amount was immediately settled',
      },
    },
    required: ['bank', 'last4', 'amount', 'merchant', 'date', 'type'],
  };

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: buildUserPrompt(sender, body),
    config: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.1 },
  });

  if (!response.text) throw new Error('Gemini returned empty text');
  return JSON.parse(response.text);
}

export const smsRoutes: FastifyPluginAsync = async (app) => {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openRouterModel = process.env.OPENROUTER_MODEL ?? 'google/gemini-2.5-flash';

  const gemini = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null;
  const hasProvider = !!(gemini || openRouterKey);

  if (!hasProvider) {
    app.log.warn('No AI provider configured — set GEMINI_API_KEY or OPENROUTER_API_KEY');
  } else {
    app.log.info(
      `SMS AI provider: ${openRouterKey ? `OpenRouter (${openRouterModel})` : 'Gemini'}`,
    );
  }

  const auth = { onRequest: [app.authenticate] };

  app.post('/parse/ai', auth, async (req, reply) => {
    if (!hasProvider) {
      return reply.status(503).send({
        error: 'SMS AI parsing is not configured (set GEMINI_API_KEY or OPENROUTER_API_KEY)',
      });
    }

    // Use safeParse so bad input returns 400 instead of an unhandled ZodError → 500
    const parsed = parseRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const input = parsed.data;

    try {
      const extracted = openRouterKey
        ? await parseWithOpenRouter(openRouterKey, input.sender, input.body, openRouterModel)
        : await parseWithGemini(gemini!, input.sender, input.body);

      const rawString = `${input.sender}|${input.body}|${input.timestamp ?? Date.now()}`;
      const dedupeHash = createHash('sha256').update(rawString).digest('hex');

      return reply.send({
        bank: extracted.bank,
        last4: extracted.last4,
        amount: extracted.amount,
        merchant: extracted.merchant,
        date: extracted.date,
        type: extracted.type,
        is_paid: extracted.is_paid || false,
        confidence: 'high',
        dedupeHash,
        raw: input,
      });
    } catch (e) {
      req.log.error(e);
      return reply.status(500).send({ error: 'Failed to parse SMS using AI' });
    }
  });
};

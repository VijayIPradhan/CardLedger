import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { GoogleGenAI, Type, Schema } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || 'MISSING_API_KEY',
});

// Since we share the output format with @cardledger/shared/src/sms/types.ts
// ParseResult: bank, last4, amount, merchant, date, type, confidence, dedupeHash, raw

const parseRequestSchema = z.object({
  sender: z.string(),
  body: z.string(),
  timestamp: z.number().optional(),
});

export const smsRoutes: FastifyPluginAsync = async (app) => {
  app.post('/parse/ai', async (req, reply) => {
    const input = parseRequestSchema.parse(req.body);

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        bank: {
          type: Type.STRING,
          description: 'The name of the bank (e.g. HDFC, ICICI, SBI, Axis)',
        },
        last4: { type: Type.STRING, description: 'The last 4 digits of the card or account' },
        amount: { type: Type.NUMBER, description: 'The amount of the transaction as a number' },
        merchant: {
          type: Type.STRING,
          description:
            'The name of the merchant. If this is a bill payment, it might be CRED, HDFC Bank, etc.',
        },
        date: {
          type: Type.STRING,
          description: 'The date of the transaction in YYYY-MM-DD format',
        },
        type: {
          type: Type.STRING,
          description:
            'If the user spent money, output spend. If the user paid their credit card bill or received a refund, output payment.',
          enum: ['spend', 'payment'],
        },
        is_paid: {
          type: Type.BOOLEAN,
          description:
            'If the SMS explicitly indicates the spent amount was immediately paid back or settled, set to true. Otherwise false.',
        },
      },
      required: ['bank', 'last4', 'amount', 'merchant', 'date', 'type'],
    };

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Analyze the following SMS from sender: ${input.sender}. 
        Body: ${input.body}
        
        Is this a debit (spend) or credit (payment/refund)? Extract the details.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.1,
        },
      });

      if (!response.text) {
        throw new Error('AI returned empty text');
      }

      const extracted = JSON.parse(response.text);

      // Compute simple dedupe hash
      const crypto = await import('crypto');
      const rawString = `${input.sender}|${input.body}|${input.timestamp || Date.now()}`;
      const dedupeHash = crypto.createHash('sha256').update(rawString).digest('hex');

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

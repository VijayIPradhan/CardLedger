import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { db } from '../db/index.js';
import { cards, transactions } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { GoogleGenAI } from '@google/genai';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

export async function statementRoutes(app: FastifyInstance) {
  app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max
    },
  });

  const auth = { onRequest: [app.authenticate] };

  app.post<{ Body: { card_id: string } }>('/upload', auth, async (req, reply) => {
    const userId = req.user.sub;

    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    // Ensure they passed a card_id somehow.
    // Multipart fields are accessible via data.fields if parsed correctly, but usually we prefer query params if sending a file.
    // Let's assume card_id is in req.query for simplicity, or we can parse it from fields.
    const query = req.query as { card_id?: string };
    if (!query.card_id) {
      return reply.status(400).send({ error: 'card_id query parameter is required' });
    }
    const cardId = query.card_id;

    // Verify card ownership
    const [card] = await db
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.id, cardId), eq(cards.user_id, userId)));

    if (!card) return reply.status(404).send({ error: 'Card not found' });

    // Write file to temp
    const tempPath = join(tmpdir(), `${randomUUID()}.pdf`);
    const buffer = await data.toBuffer();
    await writeFile(tempPath, buffer);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured on the server');
      }

      const ai = new GoogleGenAI({ apiKey });

      // Upload the PDF
      const uploadResult = await ai.files.upload({
        file: tempPath,
        config: { mimeType: 'application/pdf' },
      });

      const prompt = `
      You are an expert financial data extractor. I have uploaded a credit card statement.
      Extract all transactions from this statement.
      Return the data strictly as a JSON array of objects.
      Each object MUST have the following keys:
      - "amount": (number) The transaction amount
      - "merchant": (string) The name of the merchant
      - "txn_date": (string) The date of the transaction in YYYY-MM-DD format
      - "type": (string) Either "spend", "payment", or "refund"
      - "category": (string) Optional category like "Dining", "Travel", "Shopping", "Groceries", etc.
      
      Do not include any Markdown formatting (like \`\`\`json) in your response, just the raw JSON array.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [uploadResult, prompt],
        config: {
          responseMimeType: 'application/json',
        },
      });

      const text = response.text || '';
      let extracted: any[];
      try {
        extracted = JSON.parse(text);
      } catch (e) {
        return reply.status(500).send({ error: 'Failed to parse AI response', raw: text });
      }

      const inserted = [];
      // We would ideally insert these into the DB, but since we need a holder_id,
      // we might just return them to the client to confirm and assign holders.
      // For this implementation, we return the parsed data to the frontend so the user can verify before bulk-inserting.

      return {
        message: 'Statement parsed successfully',
        transactions: extracted,
      };
    } catch (e: any) {
      req.log.error(e);
      return reply.status(500).send({ error: e.message || 'Internal server error during parsing' });
    } finally {
      // Cleanup temp file
      await unlink(tempPath).catch(() => {});
    }
  });
}

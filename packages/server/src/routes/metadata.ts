import type { FastifyInstance } from 'fastify';
import { banksData } from '../data/banks.js';
import { DetectPaletteSchema } from '@cardledger/shared';
import { callAi } from '../lib/ai.js';

export async function metadataRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get('/banks', auth, async (_req, reply) => {
    return reply.send(banksData);
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
1. Search the web for the exact card using the bank name, card variant, network, and official issuer website.
2. Prioritize official bank websites and press releases; never infer colors from brand alone.
3. Visually analyze the actual card image and determine primary/secondary/accent colors, gradient direction, and background texture.
4. Extract colors from the card background only — ignore card logos, chip, number, and holder name.
5. Generate a simplified SVG that resembles the real card background.
6. If multiple generations exist, use the newest official design.
7. If the exact card cannot be identified, fall back to the bank's official brand palette and set confidence below 0.70.

Confidence Scale: 1.00 = exact card found, 0.90 = multiple matching images, 0.75 = variant inferred, <0.70 = brand fallback.

Return ONLY valid JSON — no markdown, no code blocks:
{"identified_card":"","confidence":0.0,"primary_hex":"#000000","secondary_hex":"#000000","accent_hex":"#000000","background_type":"solid|gradient|pattern","gradient_direction":"none|horizontal|vertical|diagonal","svg":"<svg>...</svg>"}`;

    try {
      let txt = await callAi([{ role: 'user', content: prompt }]);
      txt = txt
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      const data = JSON.parse(txt);
      if (!data.primary_hex) throw new Error('AI response missing primary_hex');
      return reply.send(data);
    } catch (e) {
      req.log.error(e, 'Failed to detect palette');
      return reply.status(500).send({ error: 'Failed to detect color palette' });
    }
  });
}

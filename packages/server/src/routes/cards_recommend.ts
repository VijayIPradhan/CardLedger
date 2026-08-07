import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { cards } from '../db/schema.js';
import { eq, getTableColumns } from 'drizzle-orm';

export async function cardRecommendRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get<{ Querystring: { amount: string; category?: string } }>(
    '/recommend',
    auth,
    async (req, reply) => {
      const userId = req.user.sub;
      const { amount, category } = req.query;
      const amt = parseFloat(amount);

      if (isNaN(amt) || amt <= 0) {
        return reply.status(400).send({ error: 'Valid amount is required' });
      }

      const userCards = await db
        .select({ ...getTableColumns(cards) })
        .from(cards)
        .where(eq(cards.user_id, userId));

      const recommendations = userCards.map((card) => {
        let rewardEarned = 0;
        let currency = 'points';
        let rate = 0;

        if (card.rewards_schema) {
          try {
            const schema = card.rewards_schema as any;
            const lowerCategory = category?.toLowerCase() || 'other';
            rate = schema.categories?.[lowerCategory] ?? schema.base_rate ?? 0;
            if (rate > 0) {
              rewardEarned = amt * (rate / 100);
              currency = schema.currency || 'points';
            }
          } catch (e) {
            // ignore
          }
        }

        return {
          card_id: card.id,
          nickname: card.nickname,
          bank: card.bank,
          network: card.network,
          last4: card.last4,
          palette: card.palette,
          rewardEarned: Math.round(rewardEarned * 100) / 100,
          rewardCurrency: currency,
          rateApplied: rate,
        };
      });

      // Sort by most rewards first
      recommendations.sort((a, b) => b.rewardEarned - a.rewardEarned);

      return recommendations;
    },
  );
}

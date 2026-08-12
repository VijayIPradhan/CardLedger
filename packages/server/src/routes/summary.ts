import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  cards,
  holders,
  assignments,
  transactions,
  payments,
  budgets,
  card_payments,
} from '../db/schema.js';
import { eq, and, desc, sql, getTableColumns } from 'drizzle-orm';
import { computeFriendDebts } from '@cardledger/shared';

export async function summaryRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] };

  app.get('/summary', auth, async (req, reply) => {
    const userId = req.user.sub;

    // Fetch all user cards
    const userCards = await db
      .select({
        ...getTableColumns(cards),
        current_spend: sql<string>`(COALESCE((SELECT SUM(amount) FROM ${transactions} WHERE ${transactions.card_id} = ${cards.id} AND ${transactions.is_paid} = FALSE AND ${transactions.type} = 'spend'), 0) - COALESCE((SELECT SUM(amount) FROM ${transactions} WHERE ${transactions.card_id} = ${cards.id} AND ${transactions.is_paid} = FALSE AND ${transactions.type} IN ('bill_payment', 'refund')), 0) - COALESCE((SELECT SUM(amount) FROM ${card_payments} WHERE ${card_payments.card_id} = ${cards.id}), 0))::text`,
      })
      .from(cards)
      .where(eq(cards.user_id, userId));

    const cardIds = userCards.map((c) => c.id);
    if (cardIds.length === 0) {
      return {
        totalSpend: 0,
        totalLimit: 0,
        totalUtilizationPercent: 0,
        friendTotalSpend: 0,
        friendTotalPaid: 0,
        friendRemainingToPay: 0,
        totalToCollect: 0,
        netPosition: 0,
        unpaidCount: 0,
        unpaidAmount: 0,
        monthlySpend: 0,
        prevMonthSpend: 0,
        avgDailySpend: 0,
        spendByNetwork: {},
        spendByCard: {},
        toCollectByCard: {},
        dues: [],
        spendByHolder: [],
        topMerchants: [],
        dailySpend: [],
        projections: [],
        totalRewards: 0,
        totalForex: 0,
        budgetProgress: [],
      };
    }

    // Fetch all user holders
    const userHolders = await db.select().from(holders).where(eq(holders.user_id, userId));

    // Fetch transactions & payments for user cards/holders
    const userTxns = await db
      .select()
      .from(transactions)
      .innerJoin(cards, eq(transactions.card_id, cards.id))
      .where(eq(cards.user_id, userId))
      .orderBy(desc(transactions.txn_date));

    const userBudgets = await db.select().from(budgets).where(eq(budgets.user_id, userId));

    const userPayments = await db
      .select()
      .from(payments)
      .innerJoin(holders, eq(payments.holder_id, holders.id))
      .where(eq(holders.user_id, userId))
      .orderBy(desc(payments.payment_date));

    const userCardPayments = await db
      .select()
      .from(card_payments)
      .innerJoin(holders, eq(card_payments.holder_id, holders.id))
      .where(eq(holders.user_id, userId))
      .orderBy(desc(card_payments.payment_date));

    // ── 1. Spend by Card ──
    const spendByCard: Record<string, number> = {};
    userCards.forEach((card) => {
      spendByCard[card.id] = parseFloat(card.current_spend) || 0;
    });

    // ── 2. Friend Collections & Remaining ──
    // Delegated to the shared engine, which is the single definition of this math for every
    // client. See debtEngine.ts for the vocabulary and the double-dip rules.
    const {
      friendDebts,
      toCollectByCard,
      totalToCollect,
      friendTotalSpend,
      friendTotalPaid,
      friendRemainingToPay,
      friendAdvanceInHand,
    } = computeFriendDebts({
      holders: userHolders,
      transactions: userTxns.map((t) => t.transactions),
      payments: userPayments.map((p) => p.payments),
      cardPayments: userCardPayments.map((p) => p.card_payments),
    });

    // ── 3. Total Utilization & Net Position ──
    const totalLimit = userCards
      .filter((c) => !c.shared_limit_with)
      .reduce((sum, c) => sum + (parseFloat(c.credit_limit) || 0), 0);
    const totalSpend = userCards.reduce((sum, c) => sum + (spendByCard[c.id] || 0), 0);
    const totalUtilizationPercent =
      totalLimit > 0 ? Math.round((totalSpend / totalLimit) * 1000) / 10 : 0;
    const netPosition = totalSpend - friendRemainingToPay;

    // ── 4. Spend by Holder ──
    const holderMap = new Map(userHolders.map((h) => [h.id, h]));
    const spendTxns = userTxns.filter((t) => t.transactions.type === 'spend');

    const spendByHolderMap = new Map<string, number>();
    spendTxns.forEach((t) => {
      const hId = t.transactions.holder_id_at_time;
      spendByHolderMap.set(
        hId,
        (spendByHolderMap.get(hId) || 0) + (parseFloat(t.transactions.amount) || 0),
      );
    });

    const spendByHolder = Array.from(spendByHolderMap.entries())
      .map(([hId, spend]) => {
        const h = holderMap.get(hId);
        if (!h) return null;
        return {
          holderId: h.id,
          holderName: h.name,
          isMe: h.relationship === 'me',
          spend,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b?.spend || 0) - (a?.spend || 0)) as Array<{
      holderId: string;
      holderName: string;
      isMe: boolean;
      spend: number;
    }>;

    // ── 5. Top Merchants ──
    const topMerchantsData = await db
      .select({
        merchant: transactions.merchant,
        amount: sql<string>`SUM(${transactions.amount})`,
        count: sql<number>`COUNT(${transactions.id})::int`,
      })
      .from(transactions)
      .innerJoin(cards, eq(transactions.card_id, cards.id))
      .where(and(eq(cards.user_id, userId), eq(transactions.type, 'spend')))
      .groupBy(transactions.merchant)
      .orderBy(desc(sql`SUM(${transactions.amount})`))
      .limit(5);

    const topMerchants = topMerchantsData.map((m) => ({
      merchant: m.merchant,
      amount: parseFloat(m.amount) || 0,
      count: m.count,
    }));

    // ── 6. Time-based & Daily Spend ──
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const cutoff30Date = new Date();
    cutoff30Date.setDate(now.getDate() - 30);
    const cutoff30Str = cutoff30Date.toISOString().split('T')[0];
    const cutoff60Date = new Date();
    cutoff60Date.setDate(now.getDate() - 60);
    const cutoff60Str = cutoff60Date.toISOString().split('T')[0];

    // Month/Daily spend calculation & New fields
    let monthlySpend = 0;
    let prevMonthSpend = 0;
    let totalRewards = 0;
    let totalForex = 0;
    const spendByCategory: Record<string, number> = {};

    spendTxns.forEach((t) => {
      const amt = parseFloat(t.transactions.amount) || 0;
      const d = t.transactions.txn_date;

      const r = parseFloat(t.transactions.reward_earned as any) || 0;
      const f = parseFloat(t.transactions.forex_markup_fee as any) || 0;
      totalRewards += r;
      totalForex += f;

      const cat = t.transactions.category || 'Other';
      spendByCategory[cat] = (spendByCategory[cat] || 0) + amt;

      if (d >= cutoff30Str) {
        monthlySpend += amt;
      } else if (d >= cutoff60Str && d < cutoff30Str) {
        prevMonthSpend += amt;
      }
    });
    const avgDailySpend = monthlySpend / 30.0;

    const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const dailySpend = [];
    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date();
      d.setDate(now.getDate() - offset);
      const dStr = d.toISOString().split('T')[0];
      const dayLabel = dayNames[d.getDay()];
      const amount = spendTxns
        .filter((t) => t.transactions.txn_date === dStr)
        .reduce((sum, t) => sum + (parseFloat(t.transactions.amount) || 0), 0);
      dailySpend.push({
        date: dStr,
        dayLabel,
        amount,
        isToday: offset === 0,
      });
    }

    // ── 7. Unpaid Txns & Spend By Network ──
    const unpaidTxns = spendTxns.filter((t) => !t.transactions.is_paid);
    const unpaidCount = unpaidTxns.length;
    const unpaidAmount = unpaidTxns.reduce(
      (sum, t) => sum + (parseFloat(t.transactions.amount) || 0),
      0,
    );

    const spendByNetworkData = await db
      .select({
        network: cards.network,
        amount: sql<string>`SUM(${transactions.amount})`,
      })
      .from(transactions)
      .innerJoin(cards, eq(transactions.card_id, cards.id))
      .where(and(eq(cards.user_id, userId), eq(transactions.type, 'spend')))
      .groupBy(cards.network);

    const spendByNetwork: Record<string, number> = {};
    spendByNetworkData.forEach((row) => {
      const net = row.network || 'Other';
      spendByNetwork[net] = parseFloat(row.amount) || 0;
    });

    // ── 8. Upcoming Dues ──
    const dues = userCards
      .map((c) => {
        const parts = todayStr.split('-').map(Number);
        let dy = parts[0];
        let dm = parts[1];
        if (parts[2] > c.payment_due_day) {
          dm += 1;
          if (dm === 13) {
            dm = 1;
            dy += 1;
          }
        }
        const maxDay = new Date(dy, dm, 0).getDate();
        const dd = Math.min(c.payment_due_day, maxDay);
        const dueDateObj = new Date(dy, dm - 1, dd);
        const daysUntil = Math.round(
          (dueDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        const dueDate = `${dy}-${String(dm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        return { cardId: c.id, dueDate, daysUntil };
      })
      .filter((d) => d.daysUntil <= 15)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    // ── 9. Projections & Recurring Bills ──
    const recurringBills: Array<{
      merchant: string;
      amount: number;
      expectedDate: string;
      cardId: string;
    }> = [];
    const merchantTxnsMap = new Map<string, typeof spendTxns>();
    spendTxns.forEach((t) => {
      const m = t.transactions.merchant;
      const list = merchantTxnsMap.get(m) || [];
      list.push(t);
      merchantTxnsMap.set(m, list);
    });

    merchantTxnsMap.forEach((txs, merchant) => {
      if (txs.length >= 2) {
        const sorted = txs.sort((a, b) =>
          b.transactions.txn_date.localeCompare(a.transactions.txn_date),
        );
        const latest = sorted[0];
        const prev = sorted[1];
        const d1 = new Date(latest.transactions.txn_date);
        const d2 = new Date(prev.transactions.txn_date);
        const daysBetween = Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
        const amt1 = parseFloat(latest.transactions.amount) || 0;
        const amt2 = parseFloat(prev.transactions.amount) || 0;
        const variance = amt1 > 0 ? Math.abs(amt1 - amt2) / amt1 : 0;

        if (daysBetween >= 25 && daysBetween <= 35 && variance < 0.1) {
          const exp = new Date(d1);
          exp.setMonth(exp.getMonth() + 1);
          recurringBills.push({
            merchant,
            amount: amt1,
            expectedDate: exp.toISOString().split('T')[0],
            cardId: latest.transactions.card_id,
          });
        }
      }
    });

    const projections = userCards.map((card) => {
      let start = new Date(
        now.getFullYear(),
        now.getMonth(),
        Math.min(card.billing_cycle_day || 1, 28),
      );
      if (start > now) {
        start.setMonth(start.getMonth() - 1);
      }
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      end.setDate(end.getDate() - 1);

      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];

      const cardTxns = spendTxns.filter((t) => t.transactions.card_id === card.id);
      const unbilledTxns = cardTxns.filter(
        (t) => t.transactions.txn_date >= startStr && t.transactions.txn_date <= endStr,
      );
      const currentUnbilled = unbilledTxns
        .filter((t) => !t.transactions.is_paid)
        .reduce((sum, t) => sum + (parseFloat(t.transactions.amount) || 0), 0);

      const upcoming = recurringBills
        .filter(
          (rb) =>
            rb.cardId === card.id &&
            rb.expectedDate >= startStr &&
            rb.expectedDate <= endStr &&
            rb.expectedDate >= todayStr,
        )
        .map((rb) => ({ merchant: rb.merchant, amount: rb.amount, expectedDate: rb.expectedDate }))
        .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));

      const projectedTotal = currentUnbilled + upcoming.reduce((sum, b) => sum + b.amount, 0);

      return {
        cardId: card.id,
        currentCycleStart: startStr,
        currentCycleEnd: endStr,
        currentUnbilled,
        upcomingBills: upcoming,
        projectedTotal,
      };
    });

    // Budget Progress
    const budgetProgress = userBudgets.map((b) => {
      const spent = spendByCategory[b.category] || 0;
      const limit = parseFloat(b.limit_amount);
      return {
        id: b.id,
        category: b.category,
        limit,
        spent,
        progressPercent: limit > 0 ? (spent / limit) * 100 : 0,
      };
    });

    return {
      totalSpend,
      totalLimit,
      totalUtilizationPercent,
      friendTotalSpend,
      friendTotalPaid,
      friendRemainingToPay,
      friendAdvanceInHand,
      totalToCollect,
      netPosition,
      unpaidCount,
      unpaidAmount,
      monthlySpend,
      prevMonthSpend,
      avgDailySpend,
      spendByNetwork,
      spendByCard,
      toCollectByCard,
      dues,
      spendByHolder,
      topMerchants,
      dailySpend,
      projections,
      friendDebts,
      totalRewards,
      totalForex,
      budgetProgress,
    };
  });
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../apiClient.js';
import type { CardDetailResult, FriendDebt, HolderDetail } from '@cardledger/shared';

/**
 * Server-computed views. Every money figure the UI shows comes from these — screens format
 * and lay out, they do not derive. The math lives in @cardledger/shared and runs on the
 * server so web and Android can never drift apart.
 */

export interface DashboardSummary {
  totalSpend: number;
  totalLimit: number;
  totalUtilizationPercent: number;
  friendTotalSpend: number;
  friendTotalPaid: number;
  friendRemainingToPay: number;
  friendAdvanceInHand: number;
  totalToCollect: number;
  netPosition: number;
  unpaidCount: number;
  unpaidAmount: number;
  monthlySpend: number;
  prevMonthSpend: number;
  avgDailySpend: number;
  spendByNetwork: Record<string, number>;
  spendByCard: Record<string, number>;
  toCollectByCard: Record<string, number>;
  dues: Array<{ cardId: string; dueDate: string; daysUntil: number }>;
  spendByHolder: Array<{
    holderId: string;
    holderName: string;
    isMe: boolean;
    spend: number;
  }>;
  topMerchants: Array<{ merchant: string; amount: number; count: number }>;
  dailySpend: Array<{ date: string; dayLabel: string; amount: number; isToday: boolean }>;
  projections: Array<{
    cardId: string;
    currentCycleStart: string;
    currentCycleEnd: string;
    currentUnbilled: number;
    upcomingBills: Array<{ merchant: string; amount: number; expectedDate: string }>;
    projectedTotal: number;
  }>;
  friendDebts: FriendDebt[];
  totalRewards: number;
  totalForex: number;
  budgetProgress: Array<{
    id: string;
    category: string;
    limit: number;
    spent: number;
    progressPercent: number;
  }>;
}

export interface CardDetailSummary extends CardDetailResult {
  totalSpend: number;
  currentSpend: number;
  sharedLimitGroup: string[];
}

/** The root key every write invalidates — see `invalidateDashboard`. */
export const DASHBOARD_KEY = ['dashboard'] as const;

// Short window on purpose: these are derived figures that change on every write, and a stale
// "to collect" is worse than an extra request.
const STALE_TIME = 30 * 1000;

export function useSummary() {
  return useQuery<DashboardSummary>({
    queryKey: [...DASHBOARD_KEY, 'summary'],
    queryFn: () => api.get('/dashboard/summary').then((r) => r.data),
    staleTime: STALE_TIME,
  });
}

export function useCardDetail(cardId: string | undefined) {
  return useQuery<CardDetailSummary>({
    queryKey: [...DASHBOARD_KEY, 'card', cardId],
    queryFn: () => api.get(`/dashboard/card/${cardId}`).then((r) => r.data),
    staleTime: STALE_TIME,
    enabled: !!cardId,
  });
}

export function useHolderDetails() {
  return useQuery<HolderDetail[]>({
    queryKey: [...DASHBOARD_KEY, 'holders'],
    queryFn: () => api.get('/dashboard/holders').then((r) => r.data),
    staleTime: STALE_TIME,
  });
}

/**
 * Drops every derived figure so the next render refetches.
 *
 * Any mutation that touches a transaction, payment, card payment, card, holder or budget must
 * call this. Skipping it is what made the app show a correct number and then revert to a
 * stale one on the next render.
 */
export function useInvalidateDashboard() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
}

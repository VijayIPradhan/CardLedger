// packages/app/src/screens/SmsImportScreen.tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { Sms } from '../plugins/SmsPlugin.js';
import { parseSmsAi } from '../data/apiClient.js';
import { useReviewStore } from '../store/reviewStore.js';
import { useCards } from '../data/hooks/useCards.js';
import { useTransactions, useCreateTransaction } from '../data/hooks/useTransactions.js';
import type { Card } from '@cardledger/shared';

export default function SmsImportScreen() {
  const nav = useNavigate();
  const { data: cards = [] } = useCards();
  const { data: transactions = [] } = useTransactions();
  const createTxn = useCreateTransaction();
  const { queue, knownHashes, enqueue, addHash } = useReviewStore();
  const [scanning, setScanning] = useState(false);
  const [summary, setSummary] = useState<{ imported: number; queued: number } | null>(null);
  const listenerRef = useRef<{ remove: () => Promise<void> } | null>(null);

  // Build the full dedupe set: server-confirmed + locally queued
  function buildHashSet(): Set<string> {
    const serverHashes = transactions.map((t) => t.dedupe_hash).filter((h): h is string => !!h);
    return new Set([...serverHashes, ...knownHashes]);
  }

  // Match a last4 to a cardId
  function findCardId(last4: string): string | undefined {
    return (cards as Card[]).find((c) => c.last4 === last4)?.id;
  }

  async function handleScan() {
    setScanning(true);
    setSummary(null);
    let imported = 0;
    let queued = 0;
    const hashSet = buildHashSet();

    try {
      const { messages } = await Sms.readInbox({ daysBack: 90 });
      for (const msg of messages) {
        try {
          const result = await parseSmsAi({
            sender: msg.sender,
            body: msg.body,
            timestamp: msg.timestamp,
          });
          if (!result) continue;
          if (hashSet.has(result.dedupeHash)) continue; // already processed

          const cardId = result.last4 ? findCardId(result.last4) : undefined;
          if (!cardId) continue; // Filter out SMS that don't match any known card

          if (result.confidence === 'high') {
            await createTxn.mutateAsync({
              card_id: cardId,
              amount: result.amount,
              merchant: result.merchant,
              txn_date: result.date,
              source: 'sms',
              type: result.type,
              is_paid: result.is_paid ?? false,
              dedupe_hash: result.dedupeHash,
              raw_sms_encrypted: null,
            });
            addHash(result.dedupeHash);
            imported++;
            continue;
          }

          // Low confidence OR card not found → queue for review
          enqueue({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            parseResult: result,
            cardId,
          });
          queued++;
        } catch (e) {
          console.error('AI parse failed', e);
        }
      }
      setSummary({ imported, queued });
    } finally {
      setScanning(false);
    }
  }

  // Live listener: parse incoming SMS in real time while screen is mounted
  useEffect(() => {
    Sms.addListener('smsReceived', async (msg) => {
      try {
        const result = await parseSmsAi({
          sender: msg.sender,
          body: msg.body,
          timestamp: msg.timestamp,
        });
        if (!result) return;
        const hashSet = buildHashSet();
        if (hashSet.has(result.dedupeHash)) return;
        const cardId = result.last4 ? findCardId(result.last4) : undefined;
        if (!cardId) return; // Filter out SMS that don't match any known card
        enqueue({ id: `live-${Date.now()}`, parseResult: result, cardId });
      } catch (e) {
        console.error('AI parse failed for live SMS', e);
      }
    }).then((handle) => {
      listenerRef.current = handle;
    });
    return () => {
      listenerRef.current?.remove();
    };
  }, []);

  const pendingCount = queue.length;

  return (
    <Screen className="pb-24">
      <TopBar title="SMS Import" />
      <div className="px-4 flex flex-col gap-4 pt-4">
        <p className="text-muted text-sm">
          Scans your inbox for the last 90 days. High-confidence transactions are saved
          automatically; others go to the review queue.
        </p>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleScan}
          disabled={scanning}
          className="w-full bg-gold text-base font-semibold py-4 rounded-input disabled:opacity-50"
        >
          {scanning ? 'Scanning…' : 'Scan Inbox'}
        </motion.button>

        {summary && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-sm text-success"
          >
            {summary.imported} imported · {summary.queued} need review
          </motion.p>
        )}

        {pendingCount > 0 && (
          <button
            onClick={() => nav('/sms/review')}
            className="w-full bg-surface border border-elevated rounded-input py-4 text-sm flex items-center justify-between px-5"
          >
            <span>Review queue</span>
            <span className="bg-danger text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          </button>
        )}
      </div>
      <BottomNav />
    </Screen>
  );
}

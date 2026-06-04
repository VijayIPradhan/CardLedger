import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// packages/app/src/screens/SmsImportScreen.tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { BottomNav } from '../components/BottomNav.js';
import { Sms } from '../plugins/SmsPlugin.js';
import { parseSms } from '@cardledger/shared';
import { useReviewStore } from '../store/reviewStore.js';
import { useCards } from '../data/hooks/useCards.js';
import { useTransactions, useCreateTransaction } from '../data/hooks/useTransactions.js';
export default function SmsImportScreen() {
    const nav = useNavigate();
    const { data: cards = [] } = useCards();
    const { data: transactions = [] } = useTransactions();
    const createTxn = useCreateTransaction();
    const { queue, knownHashes, enqueue, addHash } = useReviewStore();
    const [scanning, setScanning] = useState(false);
    const [summary, setSummary] = useState(null);
    const listenerRef = useRef(null);
    // Build the full dedupe set: server-confirmed + locally queued
    function buildHashSet() {
        const serverHashes = transactions.map((t) => t.dedupe_hash).filter((h) => !!h);
        return new Set([...serverHashes, ...knownHashes]);
    }
    // Match a last4 to a cardId
    function findCardId(last4) {
        return cards.find((c) => c.last4 === last4)?.id;
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
                const result = await parseSms(msg);
                if (!result)
                    continue;
                if (hashSet.has(result.dedupeHash))
                    continue; // already processed
                if (result.confidence === 'high' && result.last4) {
                    const cardId = findCardId(result.last4);
                    if (cardId) {
                        await createTxn.mutateAsync({
                            card_id: cardId,
                            amount: result.amount,
                            merchant: result.merchant,
                            txn_date: result.date,
                            source: 'sms',
                            dedupe_hash: result.dedupeHash,
                            raw_sms_encrypted: null,
                        });
                        addHash(result.dedupeHash);
                        imported++;
                        continue;
                    }
                }
                // Low confidence OR card not found → queue for review
                const cardId = result.last4 ? findCardId(result.last4) : undefined;
                enqueue({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    parseResult: result,
                    cardId,
                });
                queued++;
            }
            setSummary({ imported, queued });
        }
        finally {
            setScanning(false);
        }
    }
    // Live listener: parse incoming SMS in real time while screen is mounted
    useEffect(() => {
        Sms.addListener('smsReceived', async (msg) => {
            const result = await parseSms(msg);
            if (!result)
                return;
            const hashSet = buildHashSet();
            if (hashSet.has(result.dedupeHash))
                return;
            const cardId = result.last4 ? findCardId(result.last4) : undefined;
            enqueue({ id: `live-${Date.now()}`, parseResult: result, cardId });
        }).then((handle) => {
            listenerRef.current = handle;
        });
        return () => {
            listenerRef.current?.remove();
        };
    }, []);
    const pendingCount = queue.length;
    return (_jsxs(Screen, { className: "pb-24", children: [_jsx(TopBar, { title: "SMS Import" }), _jsxs("div", { className: "px-4 flex flex-col gap-4 pt-4", children: [_jsx("p", { className: "text-muted text-sm", children: "Scans your inbox for the last 90 days. High-confidence transactions are saved automatically; others go to the review queue." }), _jsx(motion.button, { whileTap: { scale: 0.97 }, onClick: handleScan, disabled: scanning, className: "w-full bg-gold text-base font-semibold py-4 rounded-input disabled:opacity-50", children: scanning ? 'Scanning…' : 'Scan Inbox' }), summary && (_jsxs(motion.p, { initial: { opacity: 0 }, animate: { opacity: 1 }, className: "text-center text-sm text-success", children: [summary.imported, " imported \u00B7 ", summary.queued, " need review"] })), pendingCount > 0 && (_jsxs("button", { onClick: () => nav('/sms/review'), className: "w-full bg-surface border border-elevated rounded-input py-4 text-sm flex items-center justify-between px-5", children: [_jsx("span", { children: "Review queue" }), _jsx("span", { className: "bg-danger text-white text-xs rounded-full w-5 h-5 flex items-center justify-center", children: pendingCount > 9 ? '9+' : pendingCount })] }))] }), _jsx(BottomNav, {})] }));
}

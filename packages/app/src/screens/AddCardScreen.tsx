// packages/app/src/screens/AddCardScreen.tsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { useCard, useCreateCard, useUpdateCard } from '../data/hooks/useCards.js';
import { sanitizeCardNumber, extractBin, extractLast4 } from '@cardledger/shared';
import { lookupBin } from '../lib/binLookup.js';
import type { Network } from '@cardledger/shared';

const NETWORKS: Network[] = ['Visa', 'Mastercard', 'RuPay', 'Amex'];

const INPUT_CLS =
  'w-full bg-surface rounded-input px-4 py-3 text-sm outline-none border border-elevated focus:border-gold transition-colors text-white';

export default function AddCardScreen() {
  const nav = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const { data: existing } = useCard(id ?? '');
  const createCard = useCreateCard();
  const updateCard = useUpdateCard();

  const [cardNumber, setCardNumber] = useState('');
  const [detectMsg, setDetectMsg] = useState('');
  const [form, setForm] = useState({
    last4: '',
    bin: '',
    network: 'Visa' as Network,
    bank: '',
    variant: '',
    nickname: '',
    billing_cycle_day: 1,
    payment_due_day: 20,
    credit_limit: 100000,
  });
  const [error, setError] = useState('');
  const lastDetectedBin = useRef('');

  useEffect(() => {
    // Only seed in edit mode. In add mode useCard('') hits the list endpoint
    // and returns an array, which must NOT overwrite the blank form.
    if (isEdit && existing && !Array.isArray(existing)) {
      setForm({
        last4: existing.last4,
        bin: existing.bin ?? '',
        network: existing.network,
        bank: existing.bank,
        variant: existing.variant ?? '',
        nickname: existing.nickname,
        billing_cycle_day: existing.billing_cycle_day,
        payment_due_day: existing.payment_due_day,
        credit_limit: Number(existing.credit_limit),
      });
    }
  }, [existing, isEdit]);

  function setField(field: string, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Detect network/bank/variant from the typed number. The full number is
  // used only here and is never stored or submitted.
  async function handleDetect() {
    const digits = sanitizeCardNumber(cardNumber);
    // Only detect on a plausibly-complete number (13–19 digits). This avoids
    // setting last4 from a partial entry like "4532 1234" → wrong last4.
    if (digits.length < 13) return;
    const bin = extractBin(digits);
    const last4 = extractLast4(digits);
    // Skip a repeat lookup for the same BIN (saves the binlist rate limit).
    if (bin === lastDetectedBin.current) {
      setForm((f) => ({ ...f, bin, last4 }));
      return;
    }
    lastDetectedBin.current = bin;
    setDetectMsg('Detecting…');
    const info = await lookupBin(bin);
    // Discard a stale result if the user changed the number while we awaited.
    if (extractBin(sanitizeCardNumber(cardNumber)) !== bin) return;
    setForm((f) => ({
      ...f,
      bin,
      last4,
      network: info.network ?? f.network,
      bank: info.bank ?? f.bank,
      variant: info.variant ?? f.variant,
    }));
    if (info.network || info.bank) {
      setDetectMsg(
        `Detected: ${info.network ?? '—'} · ${info.bank ?? '—'} · ${info.variant ?? '—'}`,
      );
    } else {
      setDetectMsg("Couldn't detect — enter details manually.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const payload = {
      last4: form.last4,
      bin: form.bin || null,
      network: form.network,
      bank: form.bank,
      variant: form.variant || null,
      nickname: form.nickname,
      billing_cycle_day: form.billing_cycle_day,
      payment_due_day: form.payment_due_day,
      credit_limit: form.credit_limit,
    };
    try {
      if (isEdit && id) {
        await updateCard.mutateAsync({ id, ...payload });
      } else {
        await createCard.mutateAsync(payload);
      }
      nav('/', { replace: true });
    } catch {
      setError('Failed to save card — check all fields');
    }
  }

  const saving = createCard.isPending || updateCard.isPending;

  return (
    <Screen className="pb-10">
      <TopBar title={isEdit ? 'Edit Card' : 'Add Card'} back />
      <form onSubmit={submit} className="px-6 flex flex-col gap-4">
        <div>
          <label className="text-xs text-muted mb-1 block">
            Card number — used to detect type, not stored
          </label>
          <input
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            onBlur={handleDetect}
            inputMode="numeric"
            maxLength={19}
            placeholder="Optional — autofills network & bank"
            className={INPUT_CLS}
          />
          {detectMsg && <p className="text-xs text-gold mt-1">{detectMsg}</p>}
        </div>

        <div>
          <label className="text-xs text-muted mb-1 block">Last 4 digits</label>
          <input
            value={form.last4}
            onChange={(e) => setField('last4', e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="9876"
            maxLength={4}
            className={INPUT_CLS}
          />
        </div>

        <select
          value={form.network}
          onChange={(e) => setField('network', e.target.value as Network)}
          className={INPUT_CLS}
        >
          {NETWORKS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <input
          value={form.bank}
          onChange={(e) => setField('bank', e.target.value)}
          placeholder="Bank name"
          className={INPUT_CLS}
        />
        <input
          value={form.variant}
          onChange={(e) => setField('variant', e.target.value)}
          placeholder="Variant (e.g. Regalia) — optional"
          className={INPUT_CLS}
        />
        <input
          value={form.nickname}
          onChange={(e) => setField('nickname', e.target.value)}
          placeholder="Nickname (e.g. My HDFC)"
          className={INPUT_CLS}
        />
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted mb-1 block">Billing cycle day</label>
            <input
              type="number"
              min={1}
              max={28}
              value={form.billing_cycle_day}
              onChange={(e) => setField('billing_cycle_day', Number(e.target.value))}
              className={INPUT_CLS}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted mb-1 block">Payment due day</label>
            <input
              type="number"
              min={1}
              max={28}
              value={form.payment_due_day}
              onChange={(e) => setField('payment_due_day', Number(e.target.value))}
              className={INPUT_CLS}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">Credit limit (₹)</label>
          <input
            type="number"
            value={form.credit_limit}
            onChange={(e) => setField('credit_limit', Number(e.target.value))}
            className={INPUT_CLS}
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="bg-gold text-base font-semibold py-3 rounded-input mt-2 hover:bg-gold-hi transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Card'}
        </button>
      </form>
    </Screen>
  );
}

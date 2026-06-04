import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { useCreateCard } from '../data/hooks/useCards.js';
import type { Network } from '@cardledger/shared';

const NETWORKS: Network[] = ['Visa', 'Mastercard', 'RuPay', 'Amex'];

const INPUT_CLS =
  'w-full bg-surface rounded-input px-4 py-3 text-sm outline-none border border-elevated focus:border-gold transition-colors text-white';

export default function AddCardScreen() {
  const nav = useNavigate();
  const createCard = useCreateCard();
  const [form, setForm] = useState({
    last4: '',
    network: 'Visa' as Network,
    bank: '',
    nickname: '',
    billing_cycle_day: 1,
    payment_due_day: 20,
    credit_limit: 100000,
  });
  const [error, setError] = useState('');

  function setField(field: string, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await createCard.mutateAsync(form);
      nav('/', { replace: true });
    } catch {
      setError('Failed to save card — check all fields');
    }
  }

  return (
    <Screen className="pb-10">
      <TopBar title="Add Card" back />
      <form onSubmit={submit} className="px-6 flex flex-col gap-4">
        <input
          value={form.last4}
          onChange={(e) => setField('last4', e.target.value)}
          placeholder="Last 4 digits"
          maxLength={4}
          className={INPUT_CLS}
        />
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
          disabled={createCard.isPending}
          className="bg-gold text-base font-semibold py-3 rounded-input mt-2 hover:bg-gold-hi transition-colors disabled:opacity-50"
        >
          {createCard.isPending ? 'Saving…' : 'Add Card'}
        </button>
      </form>
    </Screen>
  );
}

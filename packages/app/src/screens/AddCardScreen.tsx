import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen.js';
import { TopBar } from '../components/TopBar.js';
import { useCard, useCreateCard, useUpdateCard } from '../data/hooks/useCards.js';
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
  const [form, setForm] = useState({
    last4: '',
    network: 'Visa' as Network,
    bank: '',
    nickname: '',
    billing_cycle_day: 1,
    payment_due_day: 20,
    credit_limit: 100000,
    bin: null as string | null,
    variant: null as string | null,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    // Only seed in edit mode. In add mode `useCard('')` hits the list endpoint
    // and returns an array, which must NOT overwrite the blank form.
    if (isEdit && existing && !Array.isArray(existing)) {
      setForm({
        last4: existing.last4,
        network: existing.network,
        bank: existing.bank,
        nickname: existing.nickname,
        billing_cycle_day: existing.billing_cycle_day,
        payment_due_day: existing.payment_due_day,
        credit_limit: Number(existing.credit_limit),
        bin: existing.bin ?? null,
        variant: existing.variant ?? null,
      });
    }
  }, [existing]);

  function setField(field: string, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (isEdit && id) {
        await updateCard.mutateAsync({ id, ...form });
      } else {
        await createCard.mutateAsync(form);
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
          disabled={saving}
          className="bg-gold text-base font-semibold py-3 rounded-input mt-2 hover:bg-gold-hi transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Card'}
        </button>
      </form>
    </Screen>
  );
}

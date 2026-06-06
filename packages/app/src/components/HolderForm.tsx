import { useState } from 'react';
import type { Holder } from '@cardledger/shared';

interface HolderFormProps {
  initial?: Pick<Holder, 'name' | 'phone'>;
  onSubmit: (data: { name: string; phone: string; relationship: 'friend' }) => void;
  onCancel: () => void;
  submitting?: boolean;
}

export function HolderForm({ initial, onSubmit, onCancel, submitting }: HolderFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [error, setError] = useState('');

  const inputCls =
    'w-full bg-elevated border border-elevated rounded-input px-4 py-3 text-sm focus:border-gold outline-none';

  function handleSubmit() {
    if (name.trim().length < 1) return setError('Name is required');
    if (phone.trim().length < 10) return setError('Phone must be at least 10 digits');
    onSubmit({ name: name.trim(), phone: phone.trim(), relationship: 'friend' });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Name</label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Phone</label>
        <input
          className={inputCls}
          value={phone}
          inputMode="tel"
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      {error && <p className="text-danger text-xs">{error}</p>}
      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 bg-gold font-semibold py-3 rounded-input text-sm disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-elevated py-3 rounded-input text-sm text-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

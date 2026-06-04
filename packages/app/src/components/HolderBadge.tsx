import type { Holder } from '@cardledger/shared';

interface HolderBadgeProps {
  holder: Holder;
}

export function HolderBadge({ holder }: HolderBadgeProps) {
  const initials = holder.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const isMe = holder.relationship === 'me';
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${
          isMe ? 'bg-gold text-base' : 'bg-elevated text-white'
        }`}
      >
        {initials}
      </div>
      <span className="text-xs text-muted">{isMe ? 'Me' : holder.name}</span>
    </div>
  );
}

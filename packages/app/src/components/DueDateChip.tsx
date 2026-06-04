interface DueDateChipProps {
  daysLeft: number;
}

export function DueDateChip({ daysLeft }: DueDateChipProps) {
  const urgent = daysLeft <= 3;
  return (
    <span
      className={`text-xs px-2 py-1 rounded-chip font-medium ${
        urgent ? 'bg-danger/20 text-danger' : 'bg-elevated text-muted'
      }`}
    >
      {daysLeft === 0 ? 'Due today' : `Due in ${daysLeft}d`}
    </span>
  );
}

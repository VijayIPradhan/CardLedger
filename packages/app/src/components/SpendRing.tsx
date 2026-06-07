interface SpendRingProps {
  spent: number;
  limit: number;
  size?: number;
  percentText?: string;
}

export function SpendRing({ spent, limit, size = 56, percentText }: SpendRingProps) {
  const pct = limit > 0 ? Math.min(spent / limit, 1) : 0;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1A1A1A" strokeWidth="4" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#C8A96E"
        strokeWidth="4"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      {percentText && (
        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          fill="#FFF"
          fontSize={size * 0.25}
          fontWeight="bold"
          transform={`rotate(90 ${size / 2} ${size / 2})`}
        >
          {percentText}
        </text>
      )}
    </svg>
  );
}

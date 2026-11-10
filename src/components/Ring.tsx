/** Anel de progresso: parte postada (verde) + atrasada (vermelho) sobre o planejado. */
export default function Ring({ posted, late, planned, size = 132 }: { posted: number; late: number; planned: number; size?: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const p = planned ? posted / planned : 0;
  const l = planned ? Math.min(late / planned, 1 - p) : 0;
  const pct = Math.round(p * 100);
  return (
    <svg className="pring" width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${pct}% postado`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
      {l > 0 && (
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--rej)" strokeWidth="7"
          strokeDasharray={`${l * c} ${c}`} strokeDashoffset={-p * c} transform="rotate(-90 60 60)" />
      )}
      {p > 0 && (
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--ok)" strokeWidth="7" strokeLinecap={p < 1 ? 'round' : 'butt'}
          strokeDasharray={`${p * c} ${c}`} transform="rotate(-90 60 60)" />
      )}
      <text x="60" y="60" textAnchor="middle" dominantBaseline="central" className="ring-pct">{pct}%</text>
    </svg>
  );
}

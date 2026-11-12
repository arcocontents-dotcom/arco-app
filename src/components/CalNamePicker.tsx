'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setCalNameAction } from '@/app/admin/planejamento/actions';

export default function CalNamePicker({ clientId, options }: { clientId: string; options: string[] }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <select className="select" aria-label="Nome no Calendário mensal" value={v} onChange={(e) => setV(e.target.value)} style={{ minWidth: 240 }}>
        <option value="">Escolha…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <button
        type="button"
        className="btn small"
        disabled={!v || pending}
        onClick={() => start(async () => {
          const r = await setCalNameAction(clientId, v);
          if (r.ok) router.refresh();
          else setErr(r.error);
        })}
      >
        {pending ? 'Ligando…' : 'Ligar'}
      </button>
      {err && <span className="error">{err}</span>}
    </div>
  );
}

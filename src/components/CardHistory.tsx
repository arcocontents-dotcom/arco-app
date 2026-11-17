'use client';

import { useEffect, useState } from 'react';
import HistoryList from './HistoryList';
import { planHistoryAction } from '@/app/admin/planejamento/actions';

/** Histórico do card do Planejamento (vem do Registro do app). */
export default function CardHistory({ planId, empty }: { planId: string; empty?: string }) {
  const [h, setH] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setH(null);
    planHistoryAction(planId).then((r) => alive && setH(r.ok ? r.history : '')).catch(() => alive && setH(''));
    return () => { alive = false; };
  }, [planId]);
  if (h === null) return empty ? <p className="hint" style={{ margin: 0 }}>Carregando histórico…</p> : null;
  if (!h) return empty ? <p className="hint" style={{ margin: 0 }}>{empty}</p> : null;
  return <HistoryList history={h} />;
}

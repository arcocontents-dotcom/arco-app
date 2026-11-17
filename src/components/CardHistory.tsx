'use client';

import { useEffect, useState } from 'react';
import HistoryList from './HistoryList';
import { planHistoryAction } from '@/app/admin/planejamento/actions';

/** Histórico do card do Planejamento (vem do Registro do app). */
export default function CardHistory({ planId }: { planId: string }) {
  const [h, setH] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setH(null);
    planHistoryAction(planId).then((r) => alive && setH(r.ok ? r.history : '')).catch(() => alive && setH(''));
    return () => { alive = false; };
  }, [planId]);
  if (!h) return null;
  return <HistoryList history={h} />;
}

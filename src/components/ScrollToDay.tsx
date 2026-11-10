'use client';

import { useEffect } from 'react';

/** Ao abrir a semana, leva a pessoa direto ao conteúdo do dia (ou ao próximo). */
export default function ScrollToDay({ id }: { id: string | null }) {
  useEffect(() => {
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    const t = setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 500);
    return () => clearTimeout(t);
  }, [id]);
  return null;
}

'use client';

import { useState } from 'react';
import Icon from './Icon';

/** Histórico de alterações (quem lançou, editou e marcou), mais novo em cima. */
export default function HistoryList({ history, label = 'Histórico' }: { history: string | null | undefined; label?: string }) {
  const lines = (history ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const [all, setAll] = useState(false);
  if (!lines.length) return null;
  const shown = all ? lines : lines.slice(0, 4);
  return (
    <section className="hist" aria-label={label}>
      <span className="label ic-inline"><Icon name="clock" size={12} />{label}</span>
      <ol>
        {shown.map((l, i) => {
          const m = l.match(/^(\S+ \S+) · (.*)$/);
          return (
            <li key={i}>
              <time>{m ? m[1] : ''}</time>
              <span>{m ? m[2] : l}</span>
            </li>
          );
        })}
      </ol>
      {lines.length > 4 && (
        <button type="button" className="link-btn" onClick={() => setAll(!all)}>{all ? 'Mostrar menos' : `Ver tudo (${lines.length})`}</button>
      )}
    </section>
  );
}

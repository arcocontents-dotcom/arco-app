'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import { contentLinksAction, linkContentAction } from '@/app/admin/vinculo/actions';

type Data = {
  card: { id: string; title: string; kind: string | null } | null;
  tasks: { id: string; title: string; person: string; format: string | null; date: string | null; done: boolean }[];
  cards: { id: string; title: string; kind: string | null; note: string | null }[];
};
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Na aprovação: o card do Planejamento ligado a este conteúdo (mesmo cliente e formato) e as tarefas dele. */
export default function ContentLinks({ contentId, clientId, type }: { contentId: string; clientId: string; type: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [pick, setPick] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const load = () => contentLinksAction(contentId).then((r) => (r.ok ? setData(r) : (setErr(r.error), setData({ card: null, tasks: [], cards: [] }))));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId]);
  const set = (planId: string | null) =>
    start(async () => {
      setErr(null);
      const r = await linkContentAction(contentId, planId);
      if (!r.ok) return setErr(r.error);
      setPick('');
      await load();
    });
  const label = type === 'Carrossel' ? 'Post' : type;

  return (
    <section className="content-links" aria-label="Vínculos do conteúdo">
      <span className="label">Vínculos · só {label}</span>
      {data === null && <span className="hint">Lendo…</span>}
      {data?.card ? (
        <ul>
          <li>
            <Icon name="bulb" size={13} />
            <span className="ct-t"><Link href={`/admin/planejamento?c=${clientId}&open=${data.card.id}`}>{data.card.kind ? `${data.card.kind} · ` : ''}{data.card.title}</Link></span>
            <button type="button" className="link-btn" style={{ marginLeft: 'auto' }} disabled={pending} onClick={() => set(null)}>Desvincular</button>
          </li>
          {data.tasks.map((t) => (
            <li key={t.id} className={t.done ? 'done' : ''}>
              <span className="pav sm">{t.person.charAt(0)}</span>
              <span className="ct-t">{t.format ?? 'Tarefa'} · {t.person}</span>
              <span className="ct-d">{t.done ? 'feita' : t.date ? `entrega ${br(t.date)}` : ''}</span>
            </li>
          ))}
          {data.tasks.length === 0 && <span className="hint">Nenhuma tarefa da Produção ligada a esse card.</span>}
        </ul>
      ) : (
        data && <span className="hint">Não está ligado a um card do planejamento.</span>
      )}
      {data && data.cards.length > 0 && (
        <div className="ct-link">
          <select className="ninput" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Card do planejamento">
            <option value="">{data.card ? 'Trocar para outro card…' : 'Vincular a um card do planejamento…'}</option>
            {data.cards.map((c) => <option key={c.id} value={c.id}>{c.kind ? `${c.kind} · ` : ''}{c.title}{c.note ? ` — ${c.note}` : ''}</option>)}
          </select>
          <button type="button" className="btn small outline" disabled={!pick || pending} onClick={() => set(pick)}>Vincular</button>
        </div>
      )}
      {data && data.cards.length === 0 && !data.card && <span className="hint">Nenhum card aberto de {label} deste cliente no planejamento.</span>}
      {err && <p className="error" role="alert" style={{ margin: 0 }}>{err}</p>}
    </section>
  );
}

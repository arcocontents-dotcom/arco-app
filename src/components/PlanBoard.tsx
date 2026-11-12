'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from './Icon';
import { dayLabel } from '@/lib/domain';
import type { PlanItem, PlanPatch, PlanStatus } from '@/lib/planning';
import { createIdeaAction, sendToApprovalAction, updatePlanAction } from '@/app/admin/planejamento/actions';

type Link_ = { id: string; status: string };

const COLS: { key: PlanStatus; label: string; hint: string }[] = [
  { key: 'Ideia', label: 'Ideias', hint: 'Pautas soltas, sem compromisso' },
  { key: 'Realizando', label: 'Em produção', hint: 'Gravando, editando, aprovando' },
  { key: 'Postado', label: 'Postado', hint: 'No ar' }
];

const kindClass = (k: string | null) => {
  const s = (k ?? '').toLowerCase();
  if (s.startsWith('reels')) return 'k-reels';
  if (s.startsWith('post')) return 'k-post';
  if (s.startsWith('stor')) return 'k-story';
  if (s.startsWith('foto')) return 'k-fotos';
  return '';
};
const noteClass = (n: string | null) => (n === 'Finalizado' ? 'n-ok' : n ? 'n-warn' : '');

export default function PlanBoard({
  clientId, cal, month, items: initial, links, kinds, notes, owners
}: {
  clientId: string;
  cal: string;
  month: string;
  items: PlanItem[];
  links: Record<string, Link_>;
  kinds: string[];
  notes: string[];
  owners: string[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<PlanStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [pending, start] = useTransition();
  const addRef = useRef<HTMLInputElement>(null);

  const byCol = useMemo(() => {
    const m: Record<PlanStatus, PlanItem[]> = { Ideia: [], Realizando: [], Postado: [] };
    for (const it of items) m[it.status].push(it);
    return m;
  }, [items]);
  const current = items.find((i) => i.id === open) ?? null;
  const linkOf = (id: string) => links[id.replace(/-/g, '')] ?? null;

  function patch(id: string, x: PlanPatch) {
    const before = items;
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...(x as Partial<PlanItem>) } : i)));
    setErr(null);
    start(async () => {
      const r = await updatePlanAction(clientId, id, x);
      if (!r.ok) {
        setItems(before);
        setErr(r.error);
      }
    });
  }

  function add() {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle('');
    start(async () => {
      const r = await createIdeaAction(clientId, { title });
      if (r.ok) {
        setItems((l) => [{ id: r.id, url: '', title, cal, day: null, time: null, status: 'Ideia', kind: null, note: null, owner: null, done: false }, ...l]);
        router.refresh();
        addRef.current?.focus();
      } else setErr(r.error);
    });
  }

  function toApproval(id: string) {
    start(async () => {
      const r = await sendToApprovalAction(clientId, id);
      if (r.ok) router.push(`/admin/conteudo/${r.contentId}`);
      else setErr(r.error);
    });
  }

  return (
    <div className="plan">
      {err && <p className="error" role="alert">{err}</p>}
      <div className="plan-cols">
        {COLS.map((col, ci) => (
          <section
            key={col.key}
            className={`plan-col rise${over === col.key ? ' over' : ''}`}
            style={{ ['--d' as string]: `${120 + ci * 60}ms` }}
            aria-label={col.label}
            onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(col.key); } }}
            onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const it = items.find((i) => i.id === drag);
              setDrag(null);
              if (it && it.status !== col.key) patch(it.id, { status: col.key });
            }}
          >
            <header className="plan-head">
              <span className={`plan-pill p-${col.key}`}><i />{col.label}</span>
              <span className="plan-count">{byCol[col.key].length}</span>
            </header>
            {col.key === 'Ideia' && (
              <div className="plan-add">
                <Icon name="plus" size={15} />
                <input
                  ref={addRef}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                  placeholder="Nova ideia… (Enter)"
                  aria-label="Nova ideia"
                  maxLength={200}
                />
              </div>
            )}
            <ul className="plan-list">
              {byCol[col.key].map((it) => {
                const l = linkOf(it.id);
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      className={`plan-card${drag === it.id ? ' dragging' : ''}`}
                      draggable
                      onDragStart={(e) => { setDrag(it.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => { setDrag(null); setOver(null); }}
                      onClick={() => setOpen(it.id)}
                    >
                      <span className="plan-title">{it.title}</span>
                      <span className="plan-tags">
                        {it.kind && <span className={`tag ${kindClass(it.kind)}`}>{it.kind}</span>}
                        {it.note && <span className={`tag ${noteClass(it.note)}`}>{it.note}</span>}
                      </span>
                      <span className="plan-meta">
                        {it.day ? <span className="ic-inline"><Icon name="calendar" size={13} />{dayLabel(it.day)}</span> : <span className="muted">Sem data</span>}
                        {l && <span className={`status s-${l.status}`}>{l.status === 'Rascunho' ? 'Na aprovação' : l.status}</span>}
                        {it.owner && <span className="owner" title={it.owner}>{it.owner.charAt(0)}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
              {!byCol[col.key].length && <li className="plan-empty">{col.hint}</li>}
            </ul>
          </section>
        ))}
      </div>

      {current && createPortal(
        <div className="drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(null)}>
          <aside className="drawer" role="dialog" aria-modal="true" aria-label={current.title}>
            <div className="drawer-top">
              <span className="label">{cal} · Calendário mensal</span>
              <button type="button" className="icon-btn" onClick={() => setOpen(null)} aria-label="Fechar"><Icon name="x" /></button>
            </div>
            <input
              className="drawer-title"
              defaultValue={current.title}
              key={current.id}
              aria-label="Título"
              onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== current.title) patch(current.id, { title: t }); }}
            />
            <dl className="props">
              <dt><Icon name="clock" size={15} />Status</dt>
              <dd>
                <div className="seg-mini">
                  {COLS.map((c) => (
                    <button key={c.key} type="button" aria-pressed={current.status === c.key} onClick={() => patch(current.id, { status: c.key })}>{c.label}</button>
                  ))}
                </div>
              </dd>
              <dt><Icon name="video" size={15} />Tipo</dt>
              <dd>
                <select className="select" value={current.kind ?? ''} onChange={(e) => patch(current.id, { kind: e.target.value || null })} aria-label="Tipo de demanda">
                  <option value="">—</option>
                  {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </dd>
              <dt><Icon name="calendar" size={15} />Data</dt>
              <dd>
                <input type="date" className="input" value={current.day ?? ''} onChange={(e) => patch(current.id, { day: e.target.value || null })} aria-label="Data de postagem" />
              </dd>
              <dt><Icon name="bell" size={15} />Observação</dt>
              <dd>
                <select className="select" value={current.note ?? ''} onChange={(e) => patch(current.id, { note: e.target.value || null })} aria-label="Observação">
                  <option value="">—</option>
                  {notes.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </dd>
              <dt><Icon name="users" size={15} />Com quem</dt>
              <dd>
                <select className="select" value={current.owner ?? ''} onChange={(e) => patch(current.id, { owner: e.target.value || null })} aria-label="Demanda atual está com">
                  <option value="">—</option>
                  {owners.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </dd>
            </dl>
            <div className="drawer-actions">
              {linkOf(current.id) ? (
                <Link className="btn block" href={`/admin/conteudo/${linkOf(current.id)!.id}`}><Icon name="eye" size={16} />Abrir na aprovação · {linkOf(current.id)!.status}</Link>
              ) : (
                <button type="button" className="btn block" disabled={pending} onClick={() => toApproval(current.id)}>
                  <Icon name="send" size={16} />{pending ? 'Criando…' : 'Enviar para aprovação'}
                </button>
              )}
              {current.url && (
                <a className="link-btn ic-inline" href={current.url} target="_blank" rel="noreferrer" style={{ alignSelf: 'center' }}>
                  <Icon name="external" size={14} />Abrir no Notion
                </a>
              )}
            </div>
            <p className="hint">Tudo que você muda aqui vai direto para o Calendário mensal do Notion.</p>
          </aside>
        </div>,
        document.body
      )}
      <span hidden>{month}</span>
    </div>
  );
}

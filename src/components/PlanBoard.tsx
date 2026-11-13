'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon, { type IconName } from './Icon';
import TagSelect, { Tag, type Opt } from './TagSelect';
import { MONTHS, dayLabel } from '@/lib/domain';
import type { PlanItem, PlanOptions, PlanPatch, PlanStatus, SelectField } from '@/lib/planning';
import { createIdeaAction, sendToApprovalAction, updatePlanAction } from '@/app/admin/planejamento/actions';

type Link_ = { id: string; status: string };

const COLS: { key: PlanStatus; label: string; hint: string }[] = [
  { key: 'Ideia', label: 'Ideia', hint: 'Pautas soltas, sem compromisso' },
  { key: 'Realizando', label: 'Realizando', hint: 'Gravando, editando, aprovando' },
  { key: 'Postado', label: 'Postado', hint: 'No ar' }
];

/** Abas por formato, como as visões das páginas dos clientes no Notion. */
const TABS: { key: string; label: string; test: (k: string) => boolean }[] = [
  { key: 'todos', label: 'Todos', test: () => true },
  { key: 'reels', label: 'Reels', test: (k) => k.startsWith('reels') },
  { key: 'post', label: 'Post', test: (k) => k.startsWith('post') },
  { key: 'storys', label: 'Storys', test: (k) => k.startsWith('stor') },
  { key: 'fotos', label: 'Fotos', test: (k) => k.startsWith('foto') }
];

/** Propriedades na mesma ordem e com os mesmos nomes do Notion. */
const PROPS: ({ kind: 'select'; field: SelectField; label: string; icon: IconName } | { kind: 'status' | 'date' | 'month' | 'deadline' | 'done' | 'brief' | 'client'; label: string; icon: IconName })[] = [
  { kind: 'client', label: 'Cliente', icon: 'users' },
  { kind: 'select', field: 'owner', label: 'Demanda atual está com', icon: 'users' },
  { kind: 'status', label: 'Status', icon: 'clock' },
  { kind: 'select', field: 'note', label: 'Observação', icon: 'bell' },
  { kind: 'select', field: 'kind', label: 'Tipo de demanda', icon: 'video' },
  { kind: 'date', label: 'Data de postagem', icon: 'calendar' },
  { kind: 'select', field: 'month', label: 'Referente ao mês', icon: 'calendar' },
  { kind: 'select', field: 'recMonth', label: 'Gravado quando', icon: 'video' },
  { kind: 'select', field: 'editMonth', label: 'Editado quando', icon: 'pencil' },
  { kind: 'deadline', label: 'Prazo', icon: 'clock' },
  { kind: 'done', label: 'Finalizado', icon: 'check' },
  { kind: 'brief', label: 'Gravado/Briefing por', icon: 'users' },
  { kind: 'select', field: 'designBy', label: 'Editado/Design por', icon: 'image' },
  { kind: 'select', field: 'postedBy', label: 'Postado por', icon: 'send' }
];

export default function PlanBoard({
  clientId, cal, items: initial, links, options
}: {
  clientId: string;
  cal: string;
  month: string;
  items: PlanItem[];
  links: Record<string, Link_>;
  options: Omit<PlanOptions, 'clients'>;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState('todos');
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<PlanStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [pending, start] = useTransition();
  const addRef = useRef<HTMLInputElement>(null);

  const colorOf = (list: Opt[], n: string | null) => list.find((o) => o.name === n)?.color ?? 'default';
  const statusColor = (s: PlanStatus) => colorOf(options.status, s);
  const tabTest = TABS.find((t) => t.key === tab)!.test;
  const visible = items.filter((i) => tab === 'todos' || tabTest((i.kind ?? '').toLowerCase()));
  const byCol = useMemo(() => {
    const m: Record<PlanStatus, PlanItem[]> = { Ideia: [], Realizando: [], Postado: [] };
    for (const it of visible) m[it.status].push(it);
    return m;
  }, [visible]);
  const count = (t: (typeof TABS)[number]) => items.filter((i) => t.key === 'todos' || t.test((i.kind ?? '').toLowerCase())).length;
  const current = items.find((i) => i.id === open) ?? null;
  const linkOf = (id: string) => links[id.replace(/-/g, '')] ?? null;

  function patch(id: string, x: PlanPatch) {
    const before = items;
    // Igual ao servidor: a data já preenche o "Referente ao mês".
    const local: Partial<PlanItem> = { ...(x as Partial<PlanItem>) };
    if (x.day && x.month === undefined) local.month = MONTHS[Number(x.day.slice(5, 7)) - 1];
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...local } : i)));
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
        setItems((l) => [
          { id: r.id, url: '', title, cal, day: null, time: null, status: 'Ideia', kind: null, note: null, owner: null, month: null, recMonth: null, editMonth: null, designBy: null, postedBy: null, briefBy: [], deadline: null, done: false },
          ...l
        ]);
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
      <nav className="ntabs rise" aria-label="Formato">
        {TABS.map((t) => (
          <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label} <span>{count(t)}</span>
          </button>
        ))}
      </nav>
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
              <span className={`nstatus nc-${statusColor(col.key)}`}><i />{col.label}</span>
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
                        {it.kind && <Tag name={it.kind} color={colorOf(options.kind, it.kind)} />}
                        {it.note && <Tag name={it.note} color={colorOf(options.note, it.note)} />}
                        {it.done && <Tag name="Finalizado" color="green" />}
                      </span>
                      <span className="plan-meta">
                        {it.day ? <span className="ic-inline"><Icon name="calendar" size={13} />{dayLabel(it.day)}</span> : <span className="muted">Sem data</span>}
                        {it.deadline && <span className="muted">{it.deadline}</span>}
                        {l && <span className={`status s-${l.status}`}>{l.status === 'Rascunho' ? 'Na aprovação' : l.status}</span>}
                        {it.owner && <span className="owner" title={`Demanda atual está com ${it.owner}`}>{it.owner.charAt(0)}</span>}
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
              <span className="label">🗓️ Calendário mensal</span>
              <button type="button" className="icon-btn" onClick={() => setOpen(null)} aria-label="Fechar"><Icon name="x" /></button>
            </div>
            <input
              className="drawer-title"
              defaultValue={current.title}
              key={current.id}
              aria-label="Título do assunto"
              onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== current.title) patch(current.id, { title: t }); }}
            />
            <dl className="nprops">
              {PROPS.map((p) => (
                <div key={p.label} className="nprop">
                  <dt><Icon name={p.icon} size={15} /><span>{p.label}</span></dt>
                  <dd>
                    {p.kind === 'client' && <Tag name={cal} color={colorOf(options.client, cal)} />}
                    {p.kind === 'select' && (
                      <TagSelect label={p.label} options={options[p.field]} value={current[p.field]} onChange={(v) => patch(current.id, { [p.field]: (v as string | null) ?? null })} />
                    )}
                    {p.kind === 'brief' && (
                      <TagSelect label={p.label} multiple options={options.briefBy} value={current.briefBy} onChange={(v) => patch(current.id, { briefBy: v as string[] })} />
                    )}
                    {p.kind === 'status' && (
                      <TagSelect
                        label={p.label}
                        options={options.status.length ? options.status : COLS.map((c) => ({ name: c.key, color: 'default' }))}
                        value={current.status}
                        onChange={(v) => v && patch(current.id, { status: v as PlanStatus })}
                      />
                    )}
                    {p.kind === 'date' && (
                      <input type="date" className="ninput" value={current.day ?? ''} onChange={(e) => patch(current.id, { day: e.target.value || null })} aria-label={p.label} />
                    )}
                    {p.kind === 'deadline' && <span className="nreadonly">{current.deadline ?? 'Sem data definida'}</span>}
                    {p.kind === 'done' && (
                      <label className="ncheck">
                        <input type="checkbox" checked={current.done} onChange={(e) => patch(current.id, { done: e.target.checked })} aria-label={p.label} />
                        <span />
                      </label>
                    )}
                  </dd>
                </div>
              ))}
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
            <p className="hint">Tudo que você muda aqui vai direto para o Calendário mensal do Notion, só com as opções que já existem lá.</p>
          </aside>
        </div>,
        document.body
      )}
    </div>
  );
}

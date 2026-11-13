'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon, { type IconName } from './Icon';
import TagSelect, { Tag, type Opt } from './TagSelect';
import { MONTHS, WEEKDAYS_SHORT, dayLabel, dayNum, monthGrid } from '@/lib/domain';
import type { PlanItem, PlanOptions, PlanPatch, PlanStatus, SelectField } from '@/lib/planning';
import { createIdeaAction, getBriefAction, saveBriefAction, sendToApprovalAction, trashPlanAction, updatePlanAction } from '@/app/admin/planejamento/actions';
import type { PlanBrief, BriefField } from '@/lib/planning';
import { useEffect } from 'react';
import RefPreview from './RefPreview';
import { splitLinks } from '@/lib/embed';
import { uploadImage } from './upload';

type Link_ = { id: string; status: string };

const COLS: { key: PlanStatus; label: string; hint: string }[] = [
  { key: 'Ideia', label: 'Ideia', hint: 'Pautas soltas, sem compromisso' },
  { key: 'Realizando', label: 'Realizando', hint: 'Gravando, editando, aprovando' },
  { key: 'Postado', label: 'Postado', hint: 'No ar' }
];

/** Abas por formato, como as visões das páginas dos clientes no Notion. */
const NEW = 'nova-task';
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
  clientId, cal, month, items: initial, links, options
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
  const [draft, setDraft] = useState<PlanItem | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [view, setView] = useState<'quadro' | 'calendario'>('quadro');
  const draftRef = useRef<PlanItem | null>(null);
  const creating = useRef(false);
  const [undo, setUndo] = useState<PlanItem | null>(null);
  const [pending, start] = useTransition();
  const [brief, setBrief] = useState<PlanBrief | null>(null);
  const [briefMsg, setBriefMsg] = useState<string | null>(null);

  useEffect(() => {
    setConfirmDel(false);
    setBrief(null);
    setBriefMsg(null);
    if (!open || open === NEW) return;
    let alive = true;
    getBriefAction(clientId, open).then((r) => {
      if (!alive) return;
      if (r.ok) setBrief(r.brief);
      else setBriefMsg(r.error);
    });
    return () => { alive = false; };
  }, [open, clientId]);

  function saveBrief(field: BriefField, value: string) {
    if (!open || !brief || brief[field] === value) return;
    const id = open;
    setBrief((b) => (b ? { ...b, [field]: value } : b));
    setBriefMsg('Salvando…');
    start(async () => {
      const r = await saveBriefAction(clientId, id, field, value);
      if (r.ok) setBrief((b) => (b ? { ...b, [field]: r.value } : b));
      setBriefMsg(r.ok ? 'Salvo no Notion' : r.error);
      if (r.ok) setTimeout(() => setBriefMsg(null), 1800);
    });
  }

  const refs = splitLinks(brief?.referencia ?? '');
  const imgs = splitLinks(brief?.imagens ?? '');
  const [uploading, setUploading] = useState<number | null>(null);

  async function addImages(files: FileList | null) {
    if (!files?.length || !brief) return;
    const list = Array.from(files).slice(0, 12 - imgs.length);
    const urls: string[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        setUploading(Math.round((i / list.length) * 100));
        urls.push(await uploadImage(list[i], (p) => setUploading(Math.round(((i + p) / list.length) * 100))));
      }
    } catch (e) {
      setBriefMsg((e as Error).message);
    } finally {
      setUploading(null);
    }
    if (urls.length) saveBrief('imagens', [...imgs, ...urls].join('\n'));
  }

  /** Na aba Reels/Post/Storys, a nova task já nasce com o próximo número livre (Reels 3, Post 2…). */
  function nextKind(): string | null {
    if (tab === 'todos') return null;
    const group = options.kind.filter((o) => TABS.find((t) => t.key === tab)!.test(o.name.toLowerCase()) && !/freelancer/i.test(o.name));
    const used = new Set(items.map((i) => i.kind));
    return (group.find((o) => !used.has(o.name)) ?? group[0])?.name ?? null;
  }

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
  const current = open === NEW ? draft : items.find((i) => i.id === open) ?? null;
  const isNew = open === NEW;
  const linkOf = (id: string) => links[id.replace(/-/g, '')] ?? null;

  function patch(id: string, x: PlanPatch) {
    const before = items;
    // Igual ao servidor: a data já preenche o "Referente ao mês".
    const local: Partial<PlanItem> = { ...(x as Partial<PlanItem>) };
    if (x.day && x.month === undefined) local.month = MONTHS[Number(x.day.slice(5, 7)) - 1];
    if (id === NEW) {
      // Ainda não existe no Notion: guarda no formulário até ganhar título.
      setDraft((d) => {
        const n = d ? { ...d, ...local } : d;
        draftRef.current = n;
        return n;
      });
      return;
    }
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

  /** Abre uma task nova com todas as propriedades, igual ao Notion. Salva sozinha quando ganha título. */
  function newTask(status: PlanStatus, day: string | null = null) {
    setErr(null);
    const d: PlanItem = {
      id: NEW, url: '', title: '', cal, day, time: null, status, kind: nextKind(), note: null, owner: null,
      month: day ? MONTHS[Number(day.slice(5, 7)) - 1] : null,
      recMonth: null, editMonth: null, designBy: null, postedBy: null, briefBy: [], deadline: null, done: false
    };
    draftRef.current = d;
    setDraft(d);
    setOpen(NEW);
  }

  function trash(item: PlanItem) {
    const before = items;
    setItems((l) => l.filter((i) => i.id !== item.id));
    setOpen(null);
    setConfirmDel(false);
    setErr(null);
    start(async () => {
      const r = await trashPlanAction(clientId, item.id);
      if (!r.ok) {
        setItems(before);
        setErr(r.error);
        return;
      }
      setUndo(item);
      setTimeout(() => setUndo((u) => (u?.id === item.id ? null : u)), 8000);
      router.refresh();
    });
  }

  function restore() {
    if (!undo) return;
    const item = undo;
    setUndo(null);
    setItems((l) => [item, ...l.filter((i) => i.id !== item.id)]);
    start(async () => {
      const r = await trashPlanAction(clientId, item.id, true);
      if (!r.ok) {
        setItems((l) => l.filter((i) => i.id !== item.id));
        setErr(r.error);
      } else router.refresh();
    });
  }

  /**
   * Igual ao Notion: a task nova se salva sozinha assim que tem título (ao sair do campo,
   * apertar Enter ou fechar a ficha). O que mudar enquanto salva também vai para o Notion.
   */
  function createDraft() {
    const d = draftRef.current;
    if (!d || creating.current) return;
    const title = d.title.trim();
    if (!title) return;
    creating.current = true;
    const { id: _id, url: _u, cal: _c, time: _t, deadline: _d, ...fields } = d;
    const sent = { ...d, title };
    start(async () => {
      const r = await createIdeaAction(clientId, { ...fields, title });
      creating.current = false;
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      const latest = draftRef.current ?? sent;
      const diff: PlanPatch = {};
      for (const k of ['title', 'status', 'day', 'kind', 'note', 'owner', 'month', 'recMonth', 'editMonth', 'designBy', 'postedBy', 'done'] as const) {
        if (JSON.stringify(latest[k]) !== JSON.stringify(sent[k])) (diff as Record<string, unknown>)[k] = k === 'title' ? latest.title.trim() || title : latest[k];
      }
      if (JSON.stringify(latest.briefBy) !== JSON.stringify(sent.briefBy)) diff.briefBy = latest.briefBy;
      const item = { ...latest, title: latest.title.trim() || title, id: r.id };
      setItems((l) => [item, ...l]);
      setDraft(null);
      draftRef.current = null;
      setOpen((o) => (o === NEW ? r.id : o));
      setSaved('Task criada no Notion');
      setTimeout(() => setSaved(null), 1800);
      if (Object.keys(diff).length) await updatePlanAction(clientId, r.id, diff);
      router.refresh();
    });
  }

  function closeDrawer() {
    if (open === NEW) createDraft();
    setOpen(null);
  }

  /** Abre direto no aplicativo do Notion (notion://), não no site. */
  const notionApp = (url: string) => url.replace(/^https?:\/\/(www\.)?notion\.(so|site)\//, 'notion://www.notion.so/').replace(/^https?:\/\/app\.notion\.com\/p\//, 'notion://www.notion.so/');

  function toApproval(id: string) {
    start(async () => {
      const r = await sendToApprovalAction(clientId, id);
      if (r.ok) router.push(`/admin/conteudo/${r.contentId}`);
      else setErr(r.error);
    });
  }

  return (
    <div className="plan">
      <div className="plan-views rise" role="tablist" aria-label="Visualização">
        <button type="button" role="tab" aria-selected={view === 'quadro'} onClick={() => setView('quadro')}><Icon name="grid" size={15} />Quadro</button>
        <button type="button" role="tab" aria-selected={view === 'calendario'} onClick={() => setView('calendario')}><Icon name="calendar" size={15} />Calendário</button>
      </div>
      <nav className="ntabs rise" aria-label="Formato">
        {TABS.map((t) => (
          <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label} <span>{count(t)}</span>
          </button>
        ))}
      </nav>
      {err && <p className="error" role="alert">{err}</p>}
      {view === 'calendario' && (
        <PlanCalendar
          month={month}
          items={visible}
          kindColor={(k) => colorOf(options.kind, k)}
          onOpen={(id) => setOpen(id)}
          onNew={(day) => newTask('Ideia', day)}
          onMove={(id, day) => patch(id, { day })}
        />
      )}
      {view === 'quadro' && (
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
            <button type="button" className="plan-add" onClick={() => newTask(col.key)} aria-label={`Nova task em ${col.label}`}>
              <Icon name="plus" size={15} />
              <span>{col.key === 'Ideia' ? 'Nova ideia' : 'Nova task'}</span>
            </button>
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
      )}

      {undo && (
        <div className="undo-bar" role="status">
          <Icon name="trash" size={15} />
          <span>Task apagada · está na lixeira do Notion</span>
          <button type="button" onClick={restore}><Icon name="undo" size={14} />Desfazer</button>
        </div>
      )}
      {current && createPortal(
        <div className="drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && closeDrawer()}>
          <aside className="drawer" role="dialog" aria-modal="true" aria-label={isNew ? 'Nova task' : current.title}>
            <div className="drawer-top">
              <span className="label">🗓️ Calendário mensal</span>
              {saved && <span className="hint ic-inline" role="status" style={{ marginLeft: 'auto', marginRight: 8 }}><Icon name="check" size={13} className="ic-play" />{saved}</span>}
              <button type="button" className="icon-btn" onClick={closeDrawer} aria-label="Fechar"><Icon name="x" /></button>
            </div>
            <input
              className="drawer-title"
              defaultValue={current.title}
              key={current.id}
              aria-label="Título do assunto"
              placeholder="Sem título"
              autoFocus={isNew}
              maxLength={200}
              onChange={(e) => { if (isNew) { const v = e.target.value; setDraft((d) => { const n = d ? { ...d, title: v } : d; draftRef.current = n; return n; }); } }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (isNew) createDraft();
                else if (t && t !== current.title) patch(current.id, { title: t });
              }}
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
            {isNew ? (
              <div className="drawer-actions">
                {err && <p className="error" role="alert" style={{ margin: 0 }}>{err}</p>}
                <p className="hint ic-inline" style={{ margin: 0 }} role="status">
                  {pending ? <><span className="spinner" aria-hidden="true" />Salvando no Notion…</> : 'Digite o título: a task se salva sozinha no Notion, igual lá. Depois aparecem objetivo, legenda, referências e imagens.'}
                </p>
              </div>
            ) : (<>
            <section className="brief" aria-label="Para o cliente">
              <span className="label">Para o cliente · aparece no PDF e no Planejamento do app</span>
              {!brief && !briefMsg && <span className="hint">Lendo o card no Notion…</span>}
              {brief && (['objetivo', 'legenda'] as BriefField[]).map((f) => (
                <label key={`${current.id}-${f}`}>
                  {f === 'objetivo' ? 'Objetivo' : 'Legenda'}
                  <textarea rows={f === 'legenda' ? 4 : 2} defaultValue={brief[f]} disabled={brief.locked.includes(f)} onBlur={(e) => saveBrief(f, e.target.value.trim())} />
                  {brief.locked.includes(f) && <span className="locked">Escrito em várias linhas no Notion: edite por lá.</span>}
                </label>
              ))}
              {brief && (
                <div className="brief-block" key={`${current.id}-ref`}>
                  <span className="brief-title">Referências · Instagram, TikTok, YouTube, Pinterest</span>
                  {refs.length > 0 && (
                    <ul className="ref-list">
                      {refs.map((u) => (
                        <li key={u}>
                          <RefPreview url={u} />
                          {!brief.locked.includes('referencia') && (
                            <button type="button" className="ref-x" aria-label="Remover referência" onClick={() => saveBrief('referencia', refs.filter((x) => x !== u).join('\n'))}><Icon name="x" size={14} /></button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {brief.locked.includes('referencia') ? (
                    <span className="locked">Escrito em várias linhas no Notion: edite por lá.</span>
                  ) : (
                    <input
                      aria-label="Adicionar referência"
                      placeholder="Cole o link e aperte Enter"
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        const v = e.currentTarget.value.trim();
                        if (!v) return;
                        saveBrief('referencia', [...refs, v].join('\n'));
                        e.currentTarget.value = '';
                      }}
                      onPaste={(e) => {
                        const v = e.clipboardData.getData('text').trim();
                        if (!/^https?:\/\//.test(v)) return;
                        e.preventDefault();
                        saveBrief('referencia', [...refs, v].join('\n'));
                      }}
                    />
                  )}
                </div>
              )}
              {brief && (
                <div className="brief-block" key={`${current.id}-img`}>
                  <span className="brief-title">Imagens do post</span>
                  <div className="img-grid">
                    {imgs.map((u) => (
                      <figure key={u} className="img-thumb">
                        <img src={u} alt="" loading="lazy" />
                        {!brief.locked.includes('imagens') && (
                          <button type="button" className="ref-x" aria-label="Remover imagem" onClick={() => saveBrief('imagens', imgs.filter((x) => x !== u).join('\n'))}><Icon name="x" size={14} /></button>
                        )}
                      </figure>
                    ))}
                    {!brief.locked.includes('imagens') && (
                      <label className={`img-add${uploading !== null ? ' busy' : ''}`}>
                        <input type="file" accept="image/*" multiple className="sr-only" aria-label="Anexar imagens" disabled={uploading !== null} onChange={(e) => addImages(e.target.files)} />
                        <Icon name={uploading !== null ? 'clock' : 'image'} size={20} />
                        <span>{uploading !== null ? `${uploading}%` : 'Anexar'}</span>
                      </label>
                    )}
                  </div>
                </div>
              )}
              {briefMsg && <span className="hint" role="status">{briefMsg}</span>}
            </section>
            <div className="drawer-actions">
              {linkOf(current.id) ? (
                <Link className="btn block" href={`/admin/conteudo/${linkOf(current.id)!.id}`}><Icon name="eye" size={16} />Abrir na aprovação · {linkOf(current.id)!.status}</Link>
              ) : (
                <button type="button" className="btn block" disabled={pending} onClick={() => toApproval(current.id)}>
                  <Icon name="send" size={16} />{pending ? 'Criando…' : 'Enviar para aprovação'}
                </button>
              )}
              {current.url && (
                <a className="link-btn ic-inline" href={notionApp(current.url)} style={{ alignSelf: 'center' }}>
                  <Icon name="external" size={14} />Abrir no Notion
                </a>
              )}
            </div>
            <div className="plan-del">
              {!confirmDel ? (
                <button type="button" className="link-btn danger ic-inline" onClick={() => setConfirmDel(true)}>
                  <Icon name="trash" size={14} />Apagar task
                </button>
              ) : (
                <div className="plan-del-box" role="alertdialog" aria-label="Confirmar apagar">
                  <p>Apagar <b>{current.title}</b>? Ela vai para a lixeira do Notion e dá para restaurar por 30 dias.{linkOf(current.id) ? ' O conteúdo que já está na aprovação continua lá.' : ''}</p>
                  <div>
                    <button type="button" className="btn small danger" onClick={() => trash(current)}><Icon name="trash" size={14} />Apagar</button>
                    <button type="button" className="btn outline small" onClick={() => setConfirmDel(false)}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
            </>)}
            <p className="hint">Tudo que você muda aqui vai direto para o Calendário mensal do Notion, só com as opções que já existem lá.</p>
          </aside>
        </div>,
        document.body
      )}
    </div>
  );
}

/** Visão de calendário do mês (igual à do Notion): arraste para mudar a data, + para criar no dia. */
function PlanCalendar({
  month, items, kindColor, onOpen, onNew, onMove
}: {
  month: string;
  items: PlanItem[];
  kindColor: (k: string) => string;
  onOpen: (id: string) => void;
  onNew: (day: string) => void;
  onMove: (id: string, day: string) => void;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const cells = monthGrid(month);
  const today = new Date().toISOString().slice(0, 10);
  const undated = items.filter((i) => !i.day);
  return (
    <div className="pcal-wrap rise">
      <div className="pcal" role="grid" aria-label="Calendário do planejamento">
        {WEEKDAYS_SHORT.map((w) => <span key={w} className="pcal-wd">{w}</span>)}
        {cells.map((c) => {
          const list = items.filter((i) => i.day === c.day);
          return (
            <div
              key={c.day}
              role="gridcell"
              aria-label={c.day}
              className={`pcal-cell${c.inMonth ? '' : ' out'}${c.day === today ? ' today' : ''}${over === c.day ? ' over' : ''}`}
              onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(c.day); } }}
              onDragLeave={() => setOver((o) => (o === c.day ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const it = items.find((i) => i.id === drag);
                setDrag(null);
                if (it && it.day !== c.day) onMove(it.id, c.day);
              }}
            >
              <div className="pcal-n">
                <span>{dayNum(c.day)}</span>
                <button type="button" className="pcal-add" onClick={() => onNew(c.day)} aria-label={`Nova task em ${c.day}`}><Icon name="plus" size={14} /></button>
              </div>
              {list.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="pcal-card"
                  draggable
                  onDragStart={(e) => { setDrag(it.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onClick={() => onOpen(it.id)}
                >
                  <span className="pcal-title">{it.title}</span>
                  {it.kind && <Tag name={it.kind} color={kindColor(it.kind)} />}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {undated.length > 0 && (
        <div className="pcal-undated">
          <span className="label">Sem data · arraste para um dia</span>
          <div>
            {undated.map((it) => (
              <button
                key={it.id}
                type="button"
                className="pcal-card"
                draggable
                onDragStart={(e) => { setDrag(it.id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => { setDrag(null); setOver(null); }}
                onClick={() => onOpen(it.id)}
              >
                <span className="pcal-title">{it.title}</span>
                {it.kind && <Tag name={it.kind} color={kindColor(it.kind)} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

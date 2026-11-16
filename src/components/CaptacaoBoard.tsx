'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { dayNum, weekdayMon } from '@/lib/domain';
import { PRODUTOS_PADRAO, type Produto } from '@/lib/produtos';
import { saveShootAction, shootStatusAction, trashShootAction } from '@/app/admin/producao/captacao/actions';

type Crew = 'Lemuel' | 'Marcos' | 'Yan' | 'Rafa';
type SType = 'Vídeo' | 'Foto' | 'Vídeo e foto';
type SStatus = 'Agendada' | 'Realizada' | 'Cancelada';
export interface ShootRow {
  id: string;
  title: string;
  day: string;
  time: string | null;
  endTime: string | null;
  client: string;
  crew: Crew[];
  type: SType | null;
  status: SStatus;
  place: string;
  note: string;
  products: Produto[];
  url: string;
}

export interface AgendaRow {
  id: string;
  title: string;
  day: string;
  time: string | null;
  endTime: string | null;
  place: string;
  note: string;
  crew: Crew[];
}

const CREW: Crew[] = ['Lemuel', 'Marcos', 'Yan', 'Rafa'];
const WD = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WD_LONG = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const typeClass = (t: SType | null) => (t === 'Vídeo' ? 's-video' : t === 'Foto' ? 's-foto' : t === 'Vídeo e foto' ? 's-ambos' : 's-outro');

/** Calendário de captação: semana ou mês. Mesmo dado do Notion Calendar (tabela 📸 Captações). */
export default function CaptacaoBoard({
  view, days, month, today, shoots, agenda = [], agendaState = 'off', clients, label, prevHref, nextHref, todayHref, weekHref, monthHref
}: {
  view: 'semana' | 'mes';
  days: { day: string; inMonth: boolean }[];
  month: string;
  today: string;
  shoots: ShootRow[];
  agenda?: AgendaRow[];
  agendaState?: 'off' | 'ok' | 'erro';
  clients: string[];
  label: string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  weekHref: string;
  monthHref: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ShootRow | { day: string } | null>(null);
  const [who, setWho] = useState<Crew | 'todos'>('todos');
  const list = shoots.filter((s) => who === 'todos' || s.crew.includes(who));
  const count = list.filter((s) => s.status !== 'Cancelada').length;
  const [showAgenda, setShowAgenda] = useState(true);
  const [open, setOpen] = useState<AgendaRow | null>(null);
  // agenda do Notion Calendar: some o que já é captação do app (mesmo dia e título)
  const agendaList = showAgenda
    ? agenda.filter((a) => (who === 'todos' || a.crew.includes(who)) && !shoots.some((s) => s.day === a.day && s.title.trim().toLowerCase() === a.title.trim().toLowerCase()))
    : [];
  const ag = (a: AgendaRow, compact: boolean) => (
    <button key={a.id} type="button" className={`sh ag${compact ? ' compact' : ''}`} onClick={() => setOpen(a)} aria-label={`Agenda: ${a.title}${a.time ? ` às ${a.time}` : ''}`}>
      <span className="sh-time"><Icon name="calendar" size={11} />{a.time ? `${a.time}${a.endTime && !compact ? `–${a.endTime}` : ''}` : 'Dia todo'}</span>
      <span className="sh-title">{a.title}</span>
      {!compact && a.place && <span className="sh-place">📍 {a.place}</span>}
      {a.crew.length > 0 && <span className="sh-crew">{a.crew.map((c) => <span key={c} className="pav sm" title={c}>{c.charAt(0)}</span>)}</span>}
    </button>
  );
  const merged = (day: string, compact: boolean) => {
    const xs: { k: string; el: ReactNode }[] = [
      ...list.filter((s) => s.day === day).map((s) => ({ k: `${s.time ?? ''}a${s.id}`, el: event(s, compact) })),
      ...agendaList.filter((a) => a.day === day).map((a) => ({ k: `${a.time ?? ''}b${a.id}`, el: ag(a, compact) }))
    ];
    return xs.sort((x, y) => x.k.localeCompare(y.k)).map((x) => x.el);
  };

  const event = (s: ShootRow, compact: boolean) => (
    <button
      key={s.id}
      type="button"
      className={`sh ${typeClass(s.type)} st-${s.status.toLowerCase()}${compact ? ' compact' : ''}`}
      onClick={() => setEditing(s)}
      aria-label={`${s.title}${s.time ? ` às ${s.time}` : ''}`}
    >
      <span className="sh-time">
        {s.status === 'Realizada' && <Icon name="check" size={11} />}
        {s.time ? `${s.time}${s.endTime && !compact ? `–${s.endTime}` : ''}` : 'Dia todo'}
      </span>
      <span className="sh-title">{s.title}</span>
      {!compact && s.client && <span className="sh-client">{s.client}</span>}
      {!compact && s.products.length > 0 && (
        <span className="sh-prods">{s.products.map((p) => <span key={p.name}><b>{p.qty}</b> {p.name}</span>)}</span>
      )}
      {!compact && s.place && <span className="sh-place">📍 {s.place}</span>}
      <span className="sh-crew">
        {s.crew.map((c) => <span key={c} className="pav sm" title={c}>{c.charAt(0)}</span>)}
      </span>
    </button>
  );

  return (
    <div className="capt">
      <div className="prod-top">
        <div className="prod-week">
          <Link className="icon-btn" href={prevHref} aria-label="Anterior"><Icon name="left" /></Link>
          <div>
            <span className="label">Captação · {count} {count === 1 ? 'gravação' : 'gravações'}</span>
            <strong>{label}</strong>
          </div>
          <Link className="icon-btn" href={nextHref} aria-label="Próximo"><Icon name="right" /></Link>
          <Link className="link-btn" href={todayHref}>Hoje</Link>
        </div>
        <div className="prod-tools">
          <button type="button" className="btn small" onClick={() => setEditing({ day: today >= days[0].day && today <= days[days.length - 1].day ? today : days.find((d) => d.inMonth)?.day ?? days[0].day })}>
            <Icon name="plus" size={15} />Nova captação
          </button>
        </div>
      </div>

      <div className="prod-filters">
        <nav className="plan-views" aria-label="Período">
          <Link href={weekHref} className={view === 'semana' ? 'on' : ''} aria-current={view === 'semana' ? 'page' : undefined}><Icon name="week" size={15} />Semana</Link>
          <Link href={monthHref} className={view === 'mes' ? 'on' : ''} aria-current={view === 'mes' ? 'page' : undefined}><Icon name="month" size={15} />Mês</Link>
        </nav>
        <div className="pchips" role="group" aria-label="Quem vai">
          <button type="button" aria-pressed={who === 'todos'} onClick={() => setWho('todos')}>Todos</button>
          {CREW.map((p) => (
            <button key={p} type="button" aria-pressed={who === p} onClick={() => setWho(p)}><span className="pav sm">{p.charAt(0)}</span>{p}</button>
          ))}
        </div>
        <div className="sh-legend" aria-hidden="true">
          <span className="s-video">Vídeo</span><span className="s-foto">Foto</span><span className="s-ambos">Vídeo e foto</span>
          {agendaState === 'ok' && <span className="s-ag">Agenda</span>}
        </div>
        {agendaState === 'ok' && (
          <button type="button" className="link-btn" aria-pressed={showAgenda} onClick={() => setShowAgenda(!showAgenda)}>
            {showAgenda ? 'Ocultar agenda' : 'Mostrar agenda'}
          </button>
        )}
      </div>

      {view === 'semana' ? (
        <div className="pweek capt-week">
          {days.map(({ day }) => {
            return (
              <section key={day} className={`pday${day === today ? ' today' : ''}${day < today ? ' past' : ''}`} aria-label={`${WD_LONG[weekdayMon(day)]} ${dayNum(day)}`}>
                <header>
                  <span>{WD[weekdayMon(day)]}</span><strong>{dayNum(day)}</strong>
                  <button type="button" className="pcal-add" onClick={() => setEditing({ day })} aria-label={`Nova captação em ${day}`}><Icon name="plus" size={14} /></button>
                </header>
                <div className="pcol-list">{merged(day, false)}</div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="pcal capt-month" role="grid" aria-label="Calendário de captação do mês">
          {WD.map((w) => <span key={w} className="pcal-wd">{w}</span>)}
          {days.map(({ day, inMonth }) => (
            <div key={day} role="gridcell" aria-label={day} className={`pcal-cell${inMonth ? '' : ' out'}${day === today ? ' today' : ''}`}>
              <div className="pcal-n">
                <span>{dayNum(day)}</span>
                <button type="button" className="pcal-add" onClick={() => setEditing({ day })} aria-label={`Nova captação em ${day}`}><Icon name="plus" size={14} /></button>
              </div>
              {merged(day, true)}
            </div>
          ))}
        </div>
      )}

      {agendaState === 'off' && (
        <div className="ag-setup" role="note">
          <strong><Icon name="calendar" size={14} />Ligar a agenda do Notion Calendar</strong>
          <p>Para os eventos da sua agenda aparecerem aqui (cinza, só leitura):</p>
          <ol>
            <li>No <b>Google Agenda</b> (a conta que está no Notion Calendar) → engrenagem → <b>Configurações</b> → clique na agenda da gravação.</li>
            <li>Em <b>Integrar agenda</b>, copie o <b>Endereço secreto no formato iCal</b>.</li>
            <li>No <b>Cloudflare</b> → Workers → <b>arco-app</b> → Settings → Variables and Secrets → <b>Add</b> → tipo <b>Secret</b>, nome <code>CAPTACAO_ICS_URL</code>, cole o endereço e salve. Mais de uma agenda: cole os endereços separados por espaço.</li>
          </ol>
          <p>Não cole esse endereço em nenhum chat: ele dá acesso de leitura à agenda.</p>
        </div>
      )}
      {agendaState === 'erro' && <p className="error" style={{ margin: 0 }}>Não consegui ler a agenda agora (link iCal). Confira o secret CAPTACAO_ICS_URL no Cloudflare.</p>}
      <p className="hint" style={{ margin: 0 }}>
        Captações criadas aqui ficam na tabela <b>📸 Captações</b> do Notion e aparecem no <b>Notion Calendar</b> (barra lateral → <b>+ Adicionar calendário do Notion</b> → <b>📸 Captações</b>).
        {agendaState === 'ok' && <> Os eventos em cinza vêm da sua agenda e são só leitura.</>}
      </p>

      {open && (
        <div className="ag-pop-bg" onClick={() => setOpen(null)}>
          <div className="ag-pop" role="dialog" aria-label={open.title} onClick={(e) => e.stopPropagation()}>
            <span className="label">Agenda · Notion Calendar</span>
            <h3>{open.title}</h3>
            <p>{WD_LONG[weekdayMon(open.day)]}, {dayNum(open.day)}/{open.day.slice(5, 7)} · {open.time ? `${open.time}${open.endTime ? `–${open.endTime}` : ''}` : 'Dia todo'}</p>
            {open.place && <p>📍 {open.place}</p>}
            {open.crew.length > 0 && <p>Quem vai: {open.crew.join(', ')}</p>}
            {open.note && <p className="ag-note">{open.note}</p>}
            <div className="ag-actions">
              <a className="btn small" href="cron://">Abrir Notion Calendar</a>
              <button type="button" className="link-btn" onClick={() => setOpen(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <ShootForm
          row={'id' in editing ? editing : null}
          day={'id' in editing ? editing.day : editing.day}
          month={month}
          clients={clients}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function ShootForm({
  row, day: initialDay, clients, onClose, onSaved
}: {
  row: ShootRow | null;
  day: string;
  month: string;
  clients: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  type Kind = 'agencia' | 'freelancer' | 'casamento' | 'nenhum';
  const PREFIX = { freelancer: 'Freelancer · ', casamento: 'Casamento · ' } as const;
  const rc = row?.client ?? '';
  const startKind: Kind = rc.startsWith(PREFIX.freelancer) ? 'freelancer' : rc.startsWith(PREFIX.casamento) ? 'casamento' : rc ? 'agencia' : 'agencia';
  const [title, setTitle] = useState(row?.title ?? '');
  const [day, setDay] = useState(row?.day ?? initialDay);
  const [time, setTime] = useState(row?.time ?? '');
  const [endTime, setEndTime] = useState(row?.endTime ?? '');
  const [ckind, setCkind] = useState<Kind>(startKind);
  const [client, setClient] = useState(startKind === 'agencia' ? rc : '');
  const [freeName, setFreeName] = useState(startKind === 'freelancer' || startKind === 'casamento' ? rc.slice(PREFIX[startKind].length) : '');
  const [crew, setCrew] = useState<Crew[]>(row?.crew ?? []);
  const [type, setType] = useState<SType | null>(row?.type ?? 'Vídeo');
  const [status, setStatus] = useState<SStatus>(row?.status ?? 'Agendada');
  const [place, setPlace] = useState(row?.place ?? '');
  const [note, setNote] = useState(row?.note ?? '');
  const [products, setProducts] = useState<Produto[]>(row?.products ?? []);
  const [custom, setCustom] = useState('');
  const addProduct = (name: string) => {
    const n = name.trim().slice(0, 40);
    if (!n) return;
    setProducts((l) => (l.some((p) => p.name.toLowerCase() === n.toLowerCase()) ? l.map((p) => (p.name.toLowerCase() === n.toLowerCase() ? { ...p, qty: Math.min(99, p.qty + 1) } : p)) : [...l, { name: n, qty: 1 }]));
  };
  const setQty = (name: string, qty: number) =>
    setProducts((l) => (qty <= 0 ? l.filter((p) => p.name !== name) : l.map((p) => (p.name === name ? { ...p, qty: Math.min(99, qty) } : p))));
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      if ((ckind === 'freelancer' || ckind === 'casamento') && !freeName.trim()) {
        setErr(ckind === 'casamento' ? 'Escreva o nome do casal.' : 'Escreva o nome do cliente freelancer.');
        return;
      }
      const clientName = ckind === 'freelancer' || ckind === 'casamento' ? `${PREFIX[ckind]}${freeName.trim()}` : ckind === 'agencia' ? client : '';
      const r = await saveShootAction(row?.id ?? null, { title, day, time: time || null, endTime: endTime || null, client: clientName, crew, type, status, place, note, products });
      if (r.ok) onSaved();
      else setErr(r.error);
    });
  const quickStatus = (s: SStatus) =>
    start(async () => {
      if (!row) return;
      const r = await shootStatusAction(row.id, s);
      if (r.ok) onSaved();
      else setErr(r.error);
    });
  const del = () =>
    start(async () => {
      if (!row) return;
      const r = await trashShootAction(row.id);
      if (r.ok) onSaved();
      else setErr(r.error);
    });

  return createPortal(
    <div className="leave-overlay" role="dialog" aria-modal="true" aria-label={row ? 'Editar captação' : 'Nova captação'} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="leave-box rform">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="label">{row ? 'Captação' : 'Nova captação'}</span>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onClose}><Icon name="x" /></button>
        </div>
        <input className="drawer-title" placeholder="Ex.: Gravação na obra" aria-label="Captação" value={title} autoFocus onChange={(e) => setTitle(e.target.value)} maxLength={200} />

        {row && (
          <div className="rf-row">
            <span className="rf-l">Status</span>
            <div className="rf-urg rf-ckind" role="radiogroup" aria-label="Status">
              {(['Agendada', 'Realizada', 'Cancelada'] as SStatus[]).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => { setStatus(s); quickStatus(s); }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        <label className="rf-row">
          <span className="rf-l">Dia</span>
          <input type="date" className="ninput" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Dia" required />
        </label>
        <div className="rf-row">
          <span className="rf-l">Horário</span>
          <input type="time" className="ninput" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Início" />
          <span className="hint">até</span>
          <input type="time" className="ninput" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="Fim" />
        </div>

        <div className="rf-row">
          <span className="rf-l">Quem vai</span>
          <div className="pchips" role="group" aria-label="Quem vai">
            {CREW.map((p) => (
              <button key={p} type="button" aria-pressed={crew.includes(p)} onClick={() => setCrew((l) => (l.includes(p) ? l.filter((x) => x !== p) : CREW.filter((x) => x === p || l.includes(x))))}>
                <span className="pav sm">{p.charAt(0)}</span>{p}
              </button>
            ))}
          </div>
        </div>

        <div className="rf-row">
          <span className="rf-l">Tipo</span>
          <div className="rf-urg rf-fmt" role="radiogroup" aria-label="Tipo">
            {([['Vídeo', 'f-reels'], ['Foto', 'f-foto'], ['Vídeo e foto', 's-ambos']] as const).map(([v, c]) => (
              <button key={v} type="button" role="radio" aria-checked={type === v} className={c} onClick={() => setType(v)}><i />{v}</button>
            ))}
          </div>
        </div>

        <div className="rf-row rf-prods-row">
          <span className="rf-l">Produtos</span>
          <div className="rf-prods">
            <div className="rf-prod-add" role="group" aria-label="Adicionar produto">
              {PRODUTOS_PADRAO.map((n) => (
                <button key={n} type="button" onClick={() => addProduct(n)} aria-label={`Adicionar ${n}`}><Icon name="plus" size={12} />{n}</button>
              ))}
              <span className="rf-prod-custom">
                <input
                  className="ninput"
                  placeholder="Outro (ex.: Vídeo depoimento)"
                  aria-label="Outro produto"
                  value={custom}
                  maxLength={40}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addProduct(custom); setCustom(''); } }}
                />
                <button type="button" className="icon-btn" aria-label="Adicionar outro produto" disabled={!custom.trim()} onClick={() => { addProduct(custom); setCustom(''); }}><Icon name="plus" size={14} /></button>
              </span>
            </div>
            {products.length > 0 && (
              <ul className="rf-prod-list" aria-label="Produtos da captação">
                {products.map((p) => (
                  <li key={p.name}>
                    <span>{p.name}</span>
                    <div className="rf-stepper">
                      <button type="button" aria-label={`Menos ${p.name}`} onClick={() => setQty(p.name, p.qty - 1)}>−</button>
                      <b aria-label={`Quantidade de ${p.name}`}>{p.qty}</b>
                      <button type="button" aria-label={`Mais ${p.name}`} onClick={() => setQty(p.name, p.qty + 1)}>+</button>
                    </div>
                    <button type="button" className="rf-prod-x" aria-label={`Tirar ${p.name}`} onClick={() => setQty(p.name, 0)}><Icon name="x" size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rf-row">
          <span className="rf-l">Cliente</span>
          <div className="rf-urg rf-ckind" role="radiogroup" aria-label="Tipo de cliente">
            {([['agencia', 'Cliente'], ['freelancer', 'Freelancer'], ['casamento', 'Casamento'], ['nenhum', 'Nenhum']] as [Kind, string][]).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={ckind === v} onClick={() => setCkind(v)}>{l}</button>
            ))}
          </div>
        </div>
        {ckind === 'agencia' && (
          <label className="rf-row">
            <span className="rf-l" />
            <select className="ninput" style={{ flex: 1 }} value={client} onChange={(e) => setClient(e.target.value)} aria-label="Cliente da agência">
              <option value="">Escolha o cliente…</option>
              {clients.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        {(ckind === 'freelancer' || ckind === 'casamento') && (
          <label className="rf-row">
            <span className="rf-l" />
            <input key={ckind} className="ninput" style={{ flex: 1 }} placeholder={ckind === 'casamento' ? 'Nome do casal (ex.: Ana e Pedro)' : 'Nome do cliente freelancer'} aria-label={ckind === 'casamento' ? 'Nome do casal' : 'Nome do cliente freelancer'} value={freeName} onChange={(e) => setFreeName(e.target.value)} maxLength={80} />
          </label>
        )}

        <label className="rf-row">
          <span className="rf-l">Local</span>
          <input className="ninput" style={{ flex: 1 }} placeholder="Endereço ou nome do lugar" aria-label="Local" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={300} />
        </label>
        <label className="rf-row" style={{ alignItems: 'flex-start' }}>
          <span className="rf-l">Descrição</span>
          <textarea className="ninput" style={{ flex: 1, minHeight: 60 }} aria-label="Descrição" placeholder="O que precisa ser feito, roteiro, detalhes…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1500} />
        </label>

        {err && <p className="error" role="alert" style={{ margin: 0 }}>{err}</p>}
        <button type="button" className="btn block" disabled={pending} onClick={save}><Icon name="check" size={16} />{pending ? 'Salvando…' : 'Salvar'}</button>
        {row && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            <a className="link-btn" href={row.url.replace(/^https:\/\/www\.notion\.so\//, 'notion://www.notion.so/')}>Abrir no Notion</a>
            {!confirmDel ? (
              <button type="button" className="link-btn danger" onClick={() => setConfirmDel(true)}>Apagar</button>
            ) : (
              <button type="button" className="btn small danger" onClick={del}><Icon name="trash" size={14} />Confirmar: apagar</button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

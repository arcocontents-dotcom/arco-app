'use client';

import { useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { dayNum, weekdayMon } from '@/lib/domain';
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
  url: string;
}

const CREW: Crew[] = ['Lemuel', 'Marcos', 'Yan', 'Rafa'];
const WD = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WD_LONG = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const typeClass = (t: SType | null) => (t === 'Vídeo' ? 's-video' : t === 'Foto' ? 's-foto' : t === 'Vídeo e foto' ? 's-ambos' : 's-outro');

/** Calendário de captação: semana ou mês. Mesmo dado do Notion Calendar (tabela 📸 Captações). */
export default function CaptacaoBoard({
  view, days, month, today, shoots, clients, label, prevHref, nextHref, todayHref, weekHref, monthHref
}: {
  view: 'semana' | 'mes';
  days: { day: string; inMonth: boolean }[];
  month: string;
  today: string;
  shoots: ShootRow[];
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
        </div>
      </div>

      {view === 'semana' ? (
        <div className="pweek capt-week">
          {days.map(({ day }) => {
            const items = list.filter((s) => s.day === day);
            return (
              <section key={day} className={`pday${day === today ? ' today' : ''}${day < today ? ' past' : ''}`} aria-label={`${WD_LONG[weekdayMon(day)]} ${dayNum(day)}`}>
                <header>
                  <span>{WD[weekdayMon(day)]}</span><strong>{dayNum(day)}</strong>
                  <button type="button" className="pcal-add" onClick={() => setEditing({ day })} aria-label={`Nova captação em ${day}`}><Icon name="plus" size={14} /></button>
                </header>
                <div className="pcol-list">{items.map((s) => event(s, false))}</div>
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
              {list.filter((s) => s.day === day).map((s) => event(s, true))}
            </div>
          ))}
        </div>
      )}

      <p className="hint" style={{ margin: 0 }}>
        Tudo aqui fica na tabela <b>📸 Captações</b> do Notion. Para ver no <b>Notion Calendar</b>: abra o Notion Calendar → barra lateral → <b>+ Adicionar calendário do Notion</b> → escolha <b>📸 Captações</b>.
      </p>

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
      const r = await saveShootAction(row?.id ?? null, { title, day, time: time || null, endTime: endTime || null, client: clientName, crew, type, status, place, note });
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
          <span className="rf-l">Observação</span>
          <textarea className="ninput" style={{ flex: 1, minHeight: 60 }} aria-label="Observação" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1500} />
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

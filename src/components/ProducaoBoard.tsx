'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { addDays, dayNum, weekdayMon } from '@/lib/domain';
import { passContentAction, saveRoutineAction, toggleContentAction, toggleRoutineAction, trashRoutineAction } from '@/app/admin/producao/actions';

// Tipos copiados de lib/producao (não dá para importar lib server-only aqui).
type Person = 'Lemuel' | 'Marcos' | 'Yan' | 'Rafa';
type Who = Person | 'Equipe';
type Urgency = 'atrasado' | 'alta' | 'media' | 'baixa';
type RoutineType = 'Tarefa fixa' | 'Lembrete' | 'Tarefa';
export interface Task {
  key: string;
  id: string;
  source: 'conteudo' | 'rotina';
  person: Who;
  title: string;
  client: string | null;
  clientId: string | null;
  day: string | null;
  time: string | null;
  kind: string | null;
  note: string | null;
  urgency: Urgency;
  type: RoutineType | 'Conteúdo';
  done: boolean;
  url: string;
}
export interface RoutineRow {
  id: string;
  title: string;
  person: Who;
  type: RoutineType;
  days: string[];
  date: string | null;
  urgency: 'Alta' | 'Média' | 'Baixa';
  client: string;
  active: boolean;
}

const TEAM: Person[] = ['Lemuel', 'Marcos', 'Yan', 'Rafa'];
const WD = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WD_LONG = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const URG: Record<Urgency, { label: string; rank: number }> = {
  atrasado: { label: 'Atrasado', rank: 0 },
  alta: { label: 'Urgente', rank: 1 },
  media: { label: 'Esta semana', rank: 2 },
  baixa: { label: 'Sem pressa', rank: 3 }
};
/** Cor do cartão: a mesma do Notion para o formato (ou do tipo, nas tarefas internas). */
const fmtClass = (t: { source: string; kind: string | null; type: string }) => {
  if (t.source === 'rotina') return t.type === 'Lembrete' ? 'f-lembrete' : t.type === 'Tarefa fixa' ? 'f-fixa' : 'f-avulsa';
  const s = (t.kind ?? '').toLowerCase();
  return s.startsWith('reels') ? 'f-reels' : s.startsWith('post') ? 'f-post' : s.startsWith('stor') ? 'f-story' : s.startsWith('foto') ? 'f-foto' : 'f-outro';
};
const kindClass = (k: string | null) => {
  const s = (k ?? '').toLowerCase();
  return s.startsWith('reels') ? 'k-reels' : s.startsWith('post') ? 'k-post' : s.startsWith('stor') ? 'k-story' : s.startsWith('foto') ? 'k-foto' : '';
};
/** Checklist: o que vence antes fica em cima; o que já foi entregue desce para o fim. */
const sortTasks = (a: Task, b: Task) =>
  Number(a.done) - Number(b.done) ||
  (a.day ?? '9999').localeCompare(b.day ?? '9999') ||
  (a.time ?? '99').localeCompare(b.time ?? '99') ||
  URG[a.urgency].rank - URG[b.urgency].rank ||
  a.title.localeCompare(b.title);

export default function ProducaoBoard({
  start, today, tasks: initial, routines, clients, tv = false, prevHref, nextHref, todayHref, tvUrl
}: {
  start: string;
  today: string;
  tasks: Task[];
  routines: RoutineRow[];
  clients: { id: string; name: string }[];
  tv?: boolean;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  tvUrl?: string;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [view, setView] = useState<'pessoas' | 'semana'>('pessoas');
  const [who, setWho] = useState<Person | 'todos'>('todos');
  const [client, setClient] = useState('');
  const [when, setWhen] = useState<'hoje' | 'amanha' | 'semana'>('semana');
  const [editing, setEditing] = useState<RoutineRow | 'novo' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start2] = useTransition();
  const [clock, setClock] = useState('');

  useEffect(() => setTasks(initial), [initial]);

  // TV: relógio e atualização automática a cada minuto
  useEffect(() => {
    if (!tv) return;
    const tick = () => setClock(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const a = setInterval(tick, 10_000);
    const b = setInterval(() => router.refresh(), 60_000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [tv, router]);

  const visible = useMemo(
    () =>
      tasks
        .filter((t) => who === 'todos' || t.person === who || t.person === 'Equipe')
        .filter((t) => !client || t.client === client)
        .filter((t) => {
          if (when === 'semana') return true;
          const limit = when === 'hoje' ? today : addDays(today, 1);
          // atrasados e sem data entram sempre: são o que mais precisa ser feito
          return !t.day || (t.urgency === 'atrasado' && !t.done) || (t.day >= today && t.day <= limit) || (when === 'amanha' && t.day === today);
        })
        .sort(sortTasks),
    [tasks, who, client, when, today]
  );
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const end = days[6];
  const clientNames = useMemo(() => [...new Set(tasks.map((t) => t.client).filter(Boolean) as string[])].sort(), [tasks]);
  const pending = (list: Task[]) => list.filter((t) => !t.done).length;

  function toggle(t: Task) {
    if (tv || (t.source === 'rotina' && !t.day)) return;
    const done = !t.done;
    setTasks((l) => l.map((x) => (x.key === t.key ? { ...x, done } : x)));
    start2(async () => {
      const r = t.source === 'rotina' ? await toggleRoutineAction(t.id, t.day!, done) : await toggleContentAction(t.id, done);
      if (!r.ok) {
        setErr(r.error);
        setTasks((l) => l.map((x) => (x.key === t.key ? { ...x, done: !done } : x)));
      }
    });
  }

  function pass(t: Task, to: string) {
    const before = tasks;
    setTasks((l) => (to === 'Finalizado' ? l.filter((x) => x.key !== t.key) : l.map((x) => (x.key === t.key ? { ...x, person: to as Person } : x))));
    start2(async () => {
      const r = await passContentAction(t.id, to);
      if (!r.ok) {
        setErr(r.error);
        setTasks(before);
      } else router.refresh();
    });
  }

  const card = (t: Task, showWho: boolean, showDay: boolean) => {
    const late = t.urgency === 'atrasado' && !t.done;
    return (
      <article key={t.key} className={`pt ${fmtClass(t)}${t.done ? ' done' : ''}`}>
        <button
          type="button"
          className={`pt-check${t.done ? ' on' : ''}`}
          onClick={() => toggle(t)}
          disabled={tv}
          aria-label={`${t.done ? 'Desmarcar' : t.source === 'conteudo' ? 'Marcar como entregue' : 'Marcar como feito'}: ${t.title}`}
        >
          {t.done && <Icon name="check" size={14} />}
        </button>
        <div className="pt-body">
          <div className="pt-meta">
            {t.type === 'Conteúdo' ? (
              t.kind && <span className={`pt-kind ${kindClass(t.kind)}`}>{t.kind}</span>
            ) : (
              <span className={`pt-kind t-${t.type === 'Lembrete' ? 'lembrete' : t.type === 'Tarefa fixa' ? 'fixa' : 'avulsa'}`}>
                {t.type === 'Lembrete' && <Icon name="bell" size={11} />}{t.type}
              </span>
            )}
            {t.client && <span className="pt-client">{t.client}</span>}
            {showWho && <span className={`pt-who w-${t.person.toLowerCase()}`}>{t.person}</span>}
          </div>
          {t.source === 'rotina' && !tv ? (
            <button type="button" className="pt-title as-link" onClick={() => { const r = routines.find((x) => x.id === t.id); if (r) setEditing(r); }}>
              {t.title}
            </button>
          ) : (
            <h4 className="pt-title">{t.title}</h4>
          )}
          {(t.note || late || showDay || t.urgency === 'alta') && (
            <div className="pt-foot">
              {t.note && t.note !== 'Finalizado' && <span className="pt-note">{t.note}</span>}
              {late && <span className="pt-late">Atrasado{t.day ? ` · ${dayNum(t.day)}/${t.day.slice(5, 7)}` : ''}</span>}
              {!late && t.urgency === 'alta' && !t.done && <span className="pt-urg">Urgente</span>}
              {showDay && t.day && !late && <span className="pt-day">{WD[weekdayMon(t.day)]} {dayNum(t.day)}{t.time ? ` · ${t.time}` : ''}</span>}
            </div>
          )}
          {!tv && t.source === 'conteudo' && !t.done && (
            <div className="pt-actions">
              <label className="pt-pass">
                <select value="" onChange={(e) => e.target.value && pass(t, e.target.value)} aria-label={`Passar ${t.title} para`}>
                  <option value="">Passar para…</option>
                  {TEAM.filter((p) => p !== t.person).map((p) => <option key={p} value={p}>{p}</option>)}
                  <option value="Finalizado">✓ Finalizado</option>
                </select>
              </label>
              {t.clientId && (
                <Link className="pt-open" href={`/admin/planejamento?c=${t.clientId}&m=${(t.day ?? today).slice(0, 7)}-01`}>Abrir</Link>
              )}
            </div>
          )}
        </div>
      </article>
    );
  };

  /** Lista de uma pessoa: atrasados, hoje, os próximos dias da semana e sem data. */
  const personColumn = (p: Person) => {
    // tarefas fixas e lembretes repetem: na visão por pessoa, só o de hoje (a semana mostra todos)
    const repeats = (t: Task) => t.source === 'rotina' && t.type !== 'Tarefa';
    const mine = visible.filter((t) => t.person === p && (!repeats(t) || t.day === today));
    const late = mine.filter((t) => t.urgency === 'atrasado' && !t.done && (!t.day || t.day < today));
    // entregues de antes desta semana (marcados agora) descem para "Entregues", no fim
    const older = mine.filter((t) => t.done && t.day && t.day < start);
    const groups = days
      .map((d) => ({ d, list: mine.filter((t) => t.day === d && !late.includes(t)) }))
      .filter((g) => g.list.length && (g.d >= today || g.list.some((t) => t.done)));
    const undated = mine.filter((t) => !t.day && !late.includes(t));
    return (
      <section key={p} className={`pcol w-${p.toLowerCase()}`} aria-label={p}>
        <header>
          <span className="pav">{p.charAt(0)}</span>
          <h3>{p}</h3>
          <b title="Para fazer">{pending(mine)}</b>
        </header>
        {mine.length > 0 && (
          <div className="pprog" aria-label={`${mine.length - pending(mine)} de ${mine.length} entregues`}>
            <span style={{ width: `${Math.round(((mine.length - pending(mine)) / mine.length) * 100)}%` }} />
            <small>{mine.length - pending(mine)} de {mine.length} entregues</small>
          </div>
        )}
        <div className="pcol-list">
          {late.length > 0 && (
            <>
              <span className="pgroup late">Atrasados</span>
              {late.map((t) => card(t, false, false))}
            </>
          )}
          {groups.map((g) => (
            <div key={g.d} className="pgroup-wrap">
              <span className={`pgroup${g.d === today ? ' today' : ''}`}>{g.d === today ? 'Hoje' : WD_LONG[weekdayMon(g.d)]} · {dayNum(g.d)}</span>
              {g.list.map((t) => card(t, false, false))}
            </div>
          ))}
          {undated.length > 0 && (
            <>
              <span className="pgroup">Sem data</span>
              {undated.map((t) => card(t, false, false))}
            </>
          )}
          {older.length > 0 && (
            <>
              <span className="pgroup">Entregues</span>
              {older.map((t) => card(t, false, true))}
            </>
          )}
          {!mine.length && <p className="pempty">Nada por aqui 🎉</p>}
        </div>
      </section>
    );
  };

  const team = visible.filter((t) => t.person === 'Equipe' && (!t.day || t.day === today || view === 'semana'));
  const lateAll = visible.filter((t) => t.urgency === 'atrasado' && !t.done && (!t.day || t.day < start));

  const weekLabel = `${dayNum(start)} ${MON[Number(start.slice(5, 7)) - 1]} – ${dayNum(end)} ${MON[Number(end.slice(5, 7)) - 1]}`;

  return (
    <div className={`prod${tv ? ' tv' : ''}`}>
      <div className="prod-top">
        <div className="prod-week">
          {!tv && <Link className="icon-btn" href={prevHref} aria-label="Semana anterior"><Icon name="left" /></Link>}
          <div>
            <span className="label">Produção da semana</span>
            <strong>{weekLabel}</strong>
          </div>
          {!tv && <Link className="icon-btn" href={nextHref} aria-label="Próxima semana"><Icon name="right" /></Link>}
          {!tv && (today < start || today > end) && <Link className="link-btn" href={todayHref}>Hoje</Link>}
        </div>
        {tv && <div className="tv-clock" aria-label="Hora">{clock}</div>}
        {!tv && (
          <div className="prod-tools">
            <button type="button" className="btn small" onClick={() => setEditing('novo')}><Icon name="plus" size={15} />Lembrete ou tarefa</button>
            {tvUrl && <a className="btn outline small" href={tvUrl} target="_blank" rel="noreferrer"><Icon name="external" size={15} />Abrir na TV</a>}
          </div>
        )}
      </div>

      <div className="prod-filters">
        <div className="plan-views" role="tablist" aria-label="Visualização">
          <button type="button" role="tab" aria-selected={view === 'pessoas'} onClick={() => setView('pessoas')}><Icon name="users" size={15} />Pessoas</button>
          <button type="button" role="tab" aria-selected={view === 'semana'} onClick={() => setView('semana')}><Icon name="week" size={15} />Semana</button>
        </div>
        <div className="plan-views" role="tablist" aria-label="Quando">
          {([['hoje', 'Hoje'], ['amanha', 'Até amanhã'], ['semana', 'Semana']] as const).map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={when === v} onClick={() => setWhen(v)}>{l}</button>
          ))}
        </div>
        <div className="pchips" role="group" aria-label="Pessoa">
          <button type="button" aria-pressed={who === 'todos'} onClick={() => setWho('todos')}>Todos</button>
          {TEAM.map((p) => (
            <button key={p} type="button" aria-pressed={who === p} className={`w-${p.toLowerCase()}`} onClick={() => setWho(p)}>
              <span className="pav sm">{p.charAt(0)}</span>{p}
            </button>
          ))}
        </div>
        <label className="pclient">
          <span className="sr-only">Cliente</span>
          <select value={client} onChange={(e) => setClient(e.target.value)} aria-label="Cliente">
            <option value="">Todos os clientes</option>
            {clientNames.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {err && <p className="error" role="alert">{err}</p>}

      {team.length > 0 && (
        <div className="pteam" aria-label="Lembretes da equipe">
          <span className="label"><Icon name="bell" size={13} />Equipe</span>
          {team.map((t) => card(t, false, view === 'semana'))}
        </div>
      )}

      {view === 'pessoas' ? (
        <div className={`pcols${who !== 'todos' ? ' one' : ''}`}>{(who === 'todos' ? TEAM : [who]).map(personColumn)}</div>
      ) : (
        <>
          {lateAll.length > 0 && (
            <div className="pteam late" aria-label="Atrasados">
              <span className="label">Atrasados</span>
              {lateAll.map((t) => card(t, true, false))}
            </div>
          )}
          <div className="pweek">
            {days.map((d) => {
              const list = visible.filter((t) => t.day === d && t.person !== 'Equipe');
              return (
                <section key={d} className={`pday${d === today ? ' today' : ''}${d < today ? ' past' : ''}`} aria-label={`${WD_LONG[weekdayMon(d)]} ${dayNum(d)}`}>
                  <header><span>{WD[weekdayMon(d)]}</span><strong>{dayNum(d)}</strong>{list.length > 0 && <b>{pending(list)}</b>}</header>
                  <div className="pcol-list">{list.map((t) => card(t, true, false))}</div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {editing && !tv && (
        <RoutineForm
          row={editing === 'novo' ? null : editing}
          clients={clients.map((c) => c.name)}
          defaultWho={who === 'todos' ? 'Rafa' : who}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

const MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function RoutineForm({
  row, clients, defaultWho, onClose, onSaved
}: {
  row: RoutineRow | null;
  clients: string[];
  defaultWho: Who;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(row?.title ?? '');
  const [who, setWho] = useState<Who>(row?.person ?? defaultWho);
  const [type, setType] = useState<RoutineType>(row?.type ?? 'Lembrete');
  const [days, setDays] = useState<string[]>(row?.days ?? ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']);
  const [date, setDate] = useState(row?.date ?? '');
  const [urgency, setUrgency] = useState<RoutineRow['urgency']>(row?.urgency ?? 'Média');
  const [client, setClient] = useState(row?.client ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const r = await saveRoutineAction(row?.id ?? null, { title, person: who, type, days, date: date || null, urgency, client });
      if (r.ok) onSaved();
      else setErr(r.error);
    });
  const del = () =>
    start(async () => {
      if (!row) return;
      const r = await trashRoutineAction(row.id);
      if (r.ok) onSaved();
      else setErr(r.error);
    });

  return createPortal(
    <div className="leave-overlay" role="dialog" aria-modal="true" aria-label={row ? 'Editar tarefa' : 'Novo lembrete ou tarefa'} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="leave-box rform">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="label">{row ? 'Editar' : 'Novo lembrete ou tarefa'}</span>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onClose}><Icon name="x" /></button>
        </div>
        <input className="drawer-title" placeholder="Ex.: Aguar as plantas" aria-label="Tarefa" value={title} autoFocus onChange={(e) => setTitle(e.target.value)} maxLength={200} />

        <div className="rf-row">
          <span className="rf-l">Quem</span>
          <div className="pchips">
            {(['Lemuel', 'Marcos', 'Yan', 'Rafa', 'Equipe'] as Who[]).map((p) => (
              <button key={p} type="button" aria-pressed={who === p} className={`w-${p.toLowerCase()}`} onClick={() => setWho(p)}>
                <span className="pav sm">{p === 'Equipe' ? '★' : p.charAt(0)}</span>{p}
              </button>
            ))}
          </div>
        </div>

        <div className="rf-row">
          <span className="rf-l">Tipo</span>
          <div className="plan-views" role="radiogroup" aria-label="Tipo">
            {([['Lembrete', 'Lembrete'], ['Tarefa fixa', 'Tarefa fixa'], ['Tarefa', 'Uma vez']] as [RoutineType, string][]).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={type === v} aria-selected={type === v} onClick={() => setType(v)}>{l}</button>
            ))}
          </div>
        </div>

        {type === 'Tarefa' ? (
          <label className="rf-row">
            <span className="rf-l">Dia</span>
            <input type="date" className="ninput" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Dia" />
          </label>
        ) : (
          <div className="rf-row">
            <span className="rf-l">Repete</span>
            <div className="rf-days" role="group" aria-label="Dias da semana">
              {WD.map((d) => (
                <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => setDays((l) => (l.includes(d) ? l.filter((x) => x !== d) : WD.filter((x) => x === d || l.includes(x))))}>
                  {d}
                </button>
              ))}
              <button type="button" className="link-btn" onClick={() => setDays(['Seg', 'Ter', 'Qua', 'Qui', 'Sex'])}>Seg a Sex</button>
            </div>
          </div>
        )}

        <div className="rf-row">
          <span className="rf-l">Urgência</span>
          <div className="rf-urg" role="radiogroup" aria-label="Urgência">
            {(['Alta', 'Média', 'Baixa'] as const).map((u) => (
              <button key={u} type="button" role="radio" aria-checked={urgency === u} className={`ru-${u === 'Alta' ? 'alta' : u === 'Média' ? 'media' : 'baixa'}`} onClick={() => setUrgency(u)}>{u}</button>
            ))}
          </div>
        </div>

        <label className="rf-row">
          <span className="rf-l">Cliente</span>
          <select className="ninput" value={client} onChange={(e) => setClient(e.target.value)} aria-label="Cliente (opcional)">
            <option value="">Nenhum</option>
            {clients.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        {err && <p className="error" role="alert" style={{ margin: 0 }}>{err}</p>}
        <button type="button" className="btn block" disabled={pending} onClick={save}><Icon name="check" size={16} />{pending ? 'Salvando…' : 'Salvar'}</button>
        {row && (
          !confirmDel ? (
            <button type="button" className="link-btn danger" style={{ alignSelf: 'center' }} onClick={() => setConfirmDel(true)}>Apagar tarefa</button>
          ) : (
            <div className="plan-del-box" role="alertdialog" aria-label="Confirmar apagar">
              <p>Apagar <b>{row.title}</b>? Vai para a lixeira do Notion (dá para restaurar por 30 dias).</p>
              <div>
                <button type="button" className="btn small danger" onClick={del}><Icon name="trash" size={14} />Apagar</button>
                <button type="button" className="btn outline small" onClick={() => setConfirmDel(false)}>Cancelar</button>
              </div>
            </div>
          )
        )}
      </div>
    </div>,
    document.body
  );
}

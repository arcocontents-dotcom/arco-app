'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { addDays, dayNum, weekdayMon } from '@/lib/domain';
import { shootStatusAction } from '@/app/admin/producao/captacao/actions';
import { teamToggleAction } from '@/app/equipe/actions';
import { openCardsAction, passContentAction, saveRoutineAction, toggleContentAction, toggleRoutineAction, trashRoutineAction } from '@/app/admin/producao/actions';

// Tipos copiados de lib/producao (não dá para importar lib server-only aqui).
type Person = 'Lemuel' | 'Marcos' | 'Yan' | 'Rafa';
type Who = Person | 'Equipe';
type Urgency = 'atrasado' | 'alta' | 'media' | 'baixa';
type RoutineType = 'Tarefa fixa' | 'Lembrete' | 'Tarefa';
export interface Task {
  key: string;
  id: string;
  source: 'conteudo' | 'rotina' | 'captacao';
  person: Who;
  title: string;
  client: string | null;
  clientId: string | null;
  day: string | null;
  time: string | null;
  kind: string | null;
  note: string | null;
  urgency: Urgency;
  type: RoutineType | 'Conteúdo' | 'Captação';
  done: boolean;
  url: string;
  launched?: string | null;
  fmt?: string | null;
  desc?: string | null;
  planId?: string | null;
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
  created: string;
  format: TaskFormatName | null;
  formatOther: string;
  desc: string;
  contentId: string | null;
}

const TEAM: Person[] = ['Lemuel', 'Marcos', 'Yan', 'Rafa'];
type TaskFormatName = 'Editar reels' | 'Editar post' | 'Editar story' | 'Editar foto' | 'Postar' | 'Fazer roteiro' | 'Outro';
/** Formatos das tasks internas, nas cores do Notion. */
const TASK_FORMATS: [TaskFormatName, string][] = [
  ['Editar reels', 'f-reels'], ['Editar post', 'f-post'], ['Editar story', 'f-story'], ['Editar foto', 'f-foto'],
  ['Postar', 'f-postar'], ['Fazer roteiro', 'f-roteiro'], ['Outro', 'f-outro']
];
const WD = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WD_LONG = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const URG: Record<Urgency, { label: string; rank: number }> = {
  atrasado: { label: 'Atrasado', rank: 0 },
  alta: { label: 'Urgente', rank: 1 },
  media: { label: 'Esta semana', rank: 2 },
  baixa: { label: 'Sem pressa', rank: 3 }
};
/** Cor do cartão: a mesma do Notion para o formato (ou do tipo, nas tarefas internas). */
const fmtClass = (t: { source: string; kind: string | null; type: string; fmt?: string | null }) => {
  const s = (t.kind ?? '').toLowerCase();
  if (t.source === 'captacao') return 'f-capt';
  if (t.source === 'rotina' && t.fmt) return TASK_FORMATS.find(([n]) => n === t.fmt)?.[1] ?? 'f-outro';
  if (t.source === 'rotina' && !s) return t.type === 'Lembrete' ? 'f-lembrete' : t.type === 'Tarefa fixa' ? 'f-fixa' : 'f-avulsa';
  return s.startsWith('reels') || s.startsWith('víd') || s.startsWith('vid') ? 'f-reels' : s.startsWith('post') ? 'f-post' : s.startsWith('stor') ? 'f-story' : s.startsWith('foto') ? 'f-foto' : 'f-outro';
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
  start, end: endProp, today, tasks: initial, routines, clients, tv = false, member, teamLinks, prevHref, nextHref, todayHref, tvUrl, mode = 'semana', monthLabel, weekHref, monthHref
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
  /** Link pessoal da equipe: só as tarefas dessa pessoa, pode marcar como feito. */
  member?: { person: Person; k: string };
  teamLinks?: { person: Person; url: string }[];
  end?: string;
  mode?: 'semana' | 'mes';
  monthLabel?: string;
  weekHref?: string;
  monthHref?: string;
}) {
  const router = useRouter();
  const admin = !tv && !member;
  const [tasks, setTasks] = useState(initial);
  const [view, setView] = useState<'pessoas' | 'semana'>('pessoas');
  const [who, setWho] = useState<Person | 'todos'>(member?.person ?? 'todos');
  const [client, setClient] = useState('');
  const [when, setWhen] = useState<'hoje' | 'amanha' | 'semana'>('semana');
  const [transfer, setTransfer] = useState<string | null>(null);
  const [newWho, setNewWho] = useState<Who | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [edited, setEdited] = useState(true);
  const [editing, setEditing] = useState<RoutineRow | 'novo' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start2] = useTransition();
  const [clock, setClock] = useState('');
  const [showFilters, setShowFilters] = useState(!tv && !member);

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
  const end = endProp ?? addDays(start, 6);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const clientNames = useMemo(() => [...new Set(tasks.map((t) => t.client).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })), [tasks]);
  const pending = (list: Task[]) => list.filter((t) => !t.done).length;

  function toggle(t: Task) {
    if (tv) return;
    const done = !t.done;
    setTasks((l) => l.map((x) => (x.key === t.key ? { ...x, done } : x)));
    start2(async () => {
      const r = member
        ? await teamToggleAction(member.person, member.k, t.source, t.id, t.day ?? today, done)
        : t.source === 'rotina' ? await toggleRoutineAction(t.id, t.day ?? today, done)
        : t.source === 'captacao' ? await shootStatusAction(t.id, done ? 'Realizada' : 'Agendada')
        : await toggleContentAction(t.id, done);
      if (!r.ok) {
        setErr(r.error);
        setTasks((l) => l.map((x) => (x.key === t.key ? { ...x, done: !done } : x)));
      }
    });
  }

  function pass(t: Task, to: string, edited: boolean) {
    const before = tasks;
    setTransfer(null);
    setTasks((l) => (to === 'Finalizado' ? l.filter((x) => x.key !== t.key) : l.map((x) => (x.key === t.key ? { ...x, person: to as Person } : x))));
    start2(async () => {
      const r = await passContentAction(t.id, to, edited && t.person !== 'Equipe' ? t.person : null);
      if (!r.ok) {
        setErr(r.error);
        setTasks(before);
      } else router.refresh();
    });
  }

  const card = (t: Task, showWho: boolean, showDay: boolean) => {
    const late = t.urgency === 'atrasado' && !t.done;
    // vence hoje e ainda não foi feita: pisca em neon a cada 1 minuto
    const due = !t.done && !late && t.day === today && t.type !== 'Tarefa fixa';
    return (
      <article key={t.key} className={`pt ${fmtClass(t)}${t.done ? ' done' : ''}${due ? ' due' : ''}`} title={due ? 'Entrega hoje' : undefined}>
        <button
          type="button"
          className={`pt-check${t.done ? ' on' : ''}`}
          onClick={() => toggle(t)}
          disabled={tv}
          aria-label={`${t.done ? 'Desmarcar' : t.source === 'conteudo' ? 'Marcar como entregue' : t.source === 'captacao' ? 'Marcar como gravada' : 'Marcar como feito'}: ${t.title}`}
        >
          {t.done && <Icon name="check" size={14} />}
        </button>
        <div className="pt-body">
          <div className="pt-meta">
            {t.type === 'Captação' ? (
              <span className="pt-kind"><Icon name="video" size={11} />Captação{t.time ? ` · ${t.time}` : ''}</span>
            ) : t.type === 'Conteúdo' ? (
              t.kind && <span className={`pt-kind ${kindClass(t.kind)}`}>{t.kind}</span>
            ) : (
              t.kind ? (
                <span className="pt-kind">{t.type === 'Lembrete' && <Icon name="bell" size={11} />}{t.kind}</span>
              ) : (
                <span className={`pt-kind t-${t.type === 'Lembrete' ? 'lembrete' : t.type === 'Tarefa fixa' ? 'fixa' : 'avulsa'}`}>
                  {t.type === 'Lembrete' && <Icon name="bell" size={11} />}{t.type}
                </span>
              )
            )}
            {t.client && <span className="pt-client">{t.client}</span>}
            {showWho && <span className={`pt-who w-${t.person.toLowerCase()}`}>{t.person}</span>}
          </div>
          {t.source === 'rotina' && admin ? (
            <button type="button" className="pt-title as-link" onClick={() => { const r = routines.find((x) => x.id === t.id); if (r) setEditing(r); }}>
              {t.title}
            </button>
          ) : (
            <h4 className="pt-title">{t.title}</h4>
          )}
          {t.desc && <p className="pt-desc">{t.desc}</p>}
          {(t.note || late || showDay || t.urgency === 'alta' || (t.launched && t.type !== 'Tarefa fixa')) && (
            <div className="pt-foot">
              {t.note && t.note !== 'Finalizado' && <span className={t.source === 'captacao' ? 'pt-day' : 'pt-note'}>{t.source === 'captacao' ? `📍 ${t.note}` : t.note}</span>}
              {late && <span className="pt-late">Atrasado{t.day ? ` · ${dayNum(t.day)}/${t.day.slice(5, 7)}` : ''}</span>}
              {!late && t.urgency === 'alta' && !t.done && <span className="pt-urg">Urgente</span>}
              {showDay && t.day && !late && <span className="pt-day">{WD[weekdayMon(t.day)]} {dayNum(t.day)}{t.time ? ` · ${t.time}` : ''}</span>}
              {t.launched && t.type !== 'Tarefa fixa' && <span className="pt-day">Lançada {t.launched.slice(8, 10)}/{t.launched.slice(5, 7)}</span>}
            </div>
          )}
          {admin && t.source === 'rotina' && t.planId && (
            <div className="pt-actions">
              <span className="pt-linked"><Icon name="bulb" size={11} />No planejamento</span>
              {t.clientId && <Link className="pt-open" href={`/admin/planejamento?c=${t.clientId}`}>Abrir</Link>}
            </div>
          )}
          {admin && t.source === 'conteudo' && !t.done && (
            <div className="pt-actions">
              <button type="button" className="pt-transfer" aria-expanded={transfer === t.key} onClick={() => { setTransfer(transfer === t.key ? null : t.key); setEdited(true); }}>
                <Icon name="send" size={12} />Transferir
              </button>
              {t.clientId && (
                <Link className="pt-open" href={`/admin/planejamento?c=${t.clientId}&m=${(t.day ?? today).slice(0, 7)}-01`}>Abrir</Link>
              )}
            </div>
          )}
          {admin && transfer === t.key && (
            <div className="pt-tx" role="group" aria-label={`Transferir ${t.title}`}>
              <span className="pt-tx-l">Para quem vai agora?</span>
              <div className="pt-tx-row">
                {TEAM.filter((p) => p !== t.person).map((p) => (
                  <button key={p} type="button" onClick={() => pass(t, p, edited)}><span className="pav sm">{p.charAt(0)}</span>{p}</button>
                ))}
                <button type="button" className="fin" onClick={() => pass(t, 'Finalizado', edited)}><Icon name="check" size={12} />Finalizado</button>
              </div>
              <label className="pt-tx-ed">
                <input type="checkbox" checked={edited} onChange={(e) => setEdited(e.target.checked)} />
                <span>{t.person} editou (conta no relatório)</span>
              </label>
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
    // tarefas fixas de hoje ficam fixadas no topo, em linha, fora da lista por data
    const fixed = mine.filter((t) => t.source === 'rotina' && t.type === 'Tarefa fixa' && t.day === today);
    const rest = mine.filter((t) => !fixed.includes(t));
    const late = rest.filter((t) => t.urgency === 'atrasado' && !t.done && (!t.day || t.day < today));
    // entregues de antes desta semana (marcados agora) descem para "Entregues", no fim
    const older = rest.filter((t) => t.done && t.day && t.day < start);
    const groups = days
      .map((d) => ({ d, list: rest.filter((t) => t.day === d && !late.includes(t)) }))
      .filter((g) => g.list.length && (g.d >= today || g.list.some((t) => t.done)));
    const undated = rest.filter((t) => !t.day && !late.includes(t));
    return (
      <section key={p} className={`pcol w-${p.toLowerCase()}`} aria-label={p}>
        <header>
          <span className="pav">{p.charAt(0)}</span>
          <h3>{p}</h3>
          <b title="Para fazer">{pending(mine)}</b>
        </header>
        {admin && (
          <button type="button" className="pcol-add" onClick={() => { setNewWho(p); setEditing('novo'); }} aria-label={`Adicionar task para ${p}`}>
            <Icon name="plus" size={14} />Adicionar task
          </button>
        )}
        {mine.length > 0 && (
          <div className="pprog" aria-label={`${mine.length - pending(mine)} de ${mine.length} entregues`}>
            <span style={{ width: `${Math.round(((mine.length - pending(mine)) / mine.length) * 100)}%` }} />
            <small>{mine.length - pending(mine)} de {mine.length} entregues</small>
          </div>
        )}
        {fixed.length > 0 && (
          <div className="pfixed" aria-label={`Fixas de ${p}`}>
            <span className="pfixed-l">Fixas do dia</span>
            <div className="pfixed-row">
              {fixed.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`pfix${t.done ? ' on' : ''}`}
                  onClick={() => toggle(t)}
                  disabled={tv}
                  aria-pressed={t.done}
                  aria-label={`${t.done ? 'Desmarcar' : 'Marcar como feito'}: ${t.title}`}
                >
                  <span className="pfix-box">{t.done && <Icon name="check" size={11} />}</span>
                  <span className="pfix-t">{t.title}</span>
                </button>
              ))}
            </div>
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
          {!rest.length && <p className="pempty">{fixed.length ? 'Sem outras tarefas' : 'Nada por aqui 🎉'}</p>}
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
          {admin && <Link className="icon-btn" href={prevHref} aria-label="Semana anterior"><Icon name="left" /></Link>}
          <div>
            <span className="label">{mode === 'mes' ? 'Produção do mês' : 'Produção da semana'}</span>
            <strong>{mode === 'mes' && monthLabel ? monthLabel : weekLabel}</strong>
          </div>
          {admin && <Link className="icon-btn" href={nextHref} aria-label={mode === 'mes' ? 'Próximo mês' : 'Próxima semana'}><Icon name="right" /></Link>}
          {admin && (today < start || today > end) && <Link className="link-btn" href={todayHref}>Hoje</Link>}
          {admin && weekHref && monthHref && (
            <nav className="plan-views" aria-label="Período" style={{ margin: 0 }}>
              <Link href={weekHref} aria-current={mode === 'semana' ? 'page' : undefined}>Semana</Link>
              <Link href={monthHref} aria-current={mode === 'mes' ? 'page' : undefined}>Mês</Link>
            </nav>
          )}
        </div>
        {tv && (
          <div className="tv-right">
            <button type="button" className="tv-filters-btn" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
              <Icon name={showFilters ? 'x' : 'grid'} size={14} />{showFilters ? 'Fechar filtros' : 'Filtros'}
            </button>
            <div className="tv-clock" aria-label="Hora">{clock}</div>
          </div>
        )}
        {admin && (
          <div className="prod-tools">
            <button type="button" className="btn small" onClick={() => { setNewWho(null); setEditing('novo'); }}><Icon name="plus" size={15} />Lembrete ou tarefa</button>
            {tvUrl && <a className="btn outline small" href={tvUrl} target="_blank" rel="noreferrer"><Icon name="external" size={15} />Abrir na TV</a>}
            {teamLinks && (
              <div className="team-links-wrap">
                <button type="button" className="btn outline small" aria-expanded={linksOpen} onClick={() => setLinksOpen((v) => !v)}><Icon name="users" size={15} />Links da equipe</button>
                {linksOpen && (
                  <div className="team-links" role="dialog" aria-label="Links da equipe">
                    <p className="hint" style={{ margin: 0 }}>Cada um abre o seu no celular (sem login) e marca as próprias tarefas.</p>
                    {teamLinks.map((l) => (
                      <div key={l.person} className="team-link">
                        <span className="pav sm">{l.person.charAt(0)}</span>
                        <strong>{l.person}</strong>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={async () => {
                            try { await navigator.clipboard.writeText(`${location.origin}${l.url}`); setCopied(l.person); setTimeout(() => setCopied(null), 1600); } catch {}
                          }}
                        >{copied === l.person ? 'Copiado' : 'Copiar link'}</button>
                        <a className="link-btn" href={`https://wa.me/?text=${encodeURIComponent(`${l.person}, suas tarefas da Arco: ${typeof location !== 'undefined' ? location.origin : ''}${l.url}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
                        <a className="link-btn" href={l.url} target="_blank" rel="noreferrer">Abrir</a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showFilters && <div className="prod-filters">
        <div className="plan-views" role="tablist" aria-label="Visualização">
          <button type="button" role="tab" aria-selected={view === 'pessoas'} onClick={() => setView('pessoas')}><Icon name="users" size={15} />Pessoas</button>
          <button type="button" role="tab" aria-selected={view === 'semana'} onClick={() => setView('semana')}><Icon name="week" size={15} />{mode === 'mes' ? 'Calendário' : 'Semana'}</button>
        </div>
        <div className="plan-views" role="tablist" aria-label="Quando">
          {([['hoje', 'Hoje'], ['amanha', 'Até amanhã'], ['semana', mode === 'mes' ? 'Mês todo' : 'Semana']] as const).map(([v, l]) => (
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
      </div>}

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
          {Array.from({ length: Math.ceil(days.length / 7) }, (_, w) => days.slice(w * 7, w * 7 + 7)).map((wk) => (
          <div className="pweek" key={wk[0]}>
            {wk.map((d) => {
              const list = visible.filter((t) => t.day === d && t.person !== 'Equipe');
              return (
                <section key={d} className={`pday${d === today ? ' today' : ''}${d < today ? ' past' : ''}`} aria-label={`${WD_LONG[weekdayMon(d)]} ${dayNum(d)}`}>
                  <header><span>{WD[weekdayMon(d)]}</span><strong>{dayNum(d)}</strong>{list.length > 0 && <b>{pending(list)}</b>}</header>
                  <div className="pcol-list">{list.map((t) => card(t, true, false))}</div>
                </section>
              );
            })}
          </div>
          ))}
        </>
      )}

      {editing && admin && (
        <RoutineForm
          row={editing === 'novo' ? null : editing}
          clients={clients.map((c) => c.name)}
          defaultWho={newWho ?? (who === 'todos' ? 'Rafa' : who)}
          today={today}
          onClose={() => { setEditing(null); setNewWho(null); }}
          onSaved={() => { setEditing(null); setNewWho(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

const MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

function RoutineForm({
  row, clients, defaultWho, today, onClose, onSaved
}: {
  row: RoutineRow | null;
  clients: string[];
  defaultWho: Who;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fixed = row?.type === 'Tarefa fixa';
  const [title, setTitle] = useState(row?.title ?? '');
  const [who, setWho] = useState<Who>(row?.person ?? defaultWho);
  const [type, setType] = useState<RoutineType>(row?.type ?? 'Tarefa');
  const [date, setDate] = useState(row?.date ?? '');
  const [urgency, setUrgency] = useState<RoutineRow['urgency']>(row?.urgency ?? 'Média');
  const [format, setFormat] = useState<RoutineRow['format']>(row?.format ?? null);
  const [formatOther, setFormatOther] = useState(row?.formatOther ?? '');
  const [desc, setDesc] = useState(row?.desc ?? '');
  const [descOpen, setDescOpen] = useState(!!row?.desc);
  // Planejamento: task de edição/roteiro/postagem de cliente da agência fica ligada a um card
  const LINKABLE = ['Editar reels', 'Editar post', 'Editar story', 'Editar foto', 'Fazer roteiro', 'Postar'];
  const [planLink, setPlanLink] = useState<string>('novo');
  const [cards, setCards] = useState<{ id: string; title: string; kind: string | null; note: string | null }[] | null>(null);
  // Cliente: da agência (lista), Freelancer ou Casamento (escreve o nome), ou nenhum
  type Kind = 'agencia' | 'freelancer' | 'casamento' | 'nenhum';
  const PREFIX: Record<'freelancer' | 'casamento', string> = { freelancer: 'Freelancer · ', casamento: 'Casamento · ' };
  const rc = row?.client ?? '';
  const startKind: Kind = rc.startsWith(PREFIX.freelancer) ? 'freelancer' : rc.startsWith(PREFIX.casamento) ? 'casamento' : rc ? 'agencia' : 'nenhum';
  const [ckind, setCkind] = useState<Kind>(startKind);
  const [client, setClient] = useState(startKind === 'agencia' ? rc : '');
  const [freeName, setFreeName] = useState(startKind === 'freelancer' || startKind === 'casamento' ? rc.slice(PREFIX[startKind].length) : '');
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [pending, start] = useTransition();
  // lançada em: o dia de hoje (ou o dia em que foi criada), fixo
  const launched = row?.created ?? today;

  const canLink = ckind === 'agencia' && !!client && !!format && LINKABLE.includes(format) && who !== 'Equipe';
  useEffect(() => {
    if (!canLink || row?.contentId) return;
    let alive = true;
    setCards(null);
    openCardsAction(client).then((l) => alive && setCards(l)).catch(() => alive && setCards([]));
    return () => { alive = false; };
  }, [canLink, client, row?.contentId]);

  const save = () =>
    start(async () => {
      if (type === 'Tarefa' && !date) {
        setErr('Escolha a data de entrega.');
        return;
      }
      if ((ckind === 'freelancer' || ckind === 'casamento') && !freeName.trim()) {
        setErr(ckind === 'casamento' ? 'Escreva o nome do casal.' : 'Escreva o nome do cliente freelancer.');
        return;
      }
      if (ckind === 'agencia' && !client) {
        setErr('Escolha o cliente.');
        return;
      }
      if (format === 'Outro' && !formatOther.trim()) {
        setErr('Descreva o formato da tarefa.');
        return;
      }
      const clientName =
        ckind === 'freelancer' || ckind === 'casamento' ? `${PREFIX[ckind]}${freeName.trim()}` : ckind === 'agencia' ? client : '';
      const link = row?.contentId || !canLink ? null : planLink === 'nao' ? null : planLink;
      const r = await saveRoutineAction(row?.id ?? null, { title, person: who, type, days: fixed ? row!.days : [], date: fixed ? null : date, urgency, client: clientName, format, formatOther, desc }, link);
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
        <input className="drawer-title" placeholder="Ex.: Editar vídeo" aria-label="Tarefa" value={title} autoFocus onChange={(e) => setTitle(e.target.value)} maxLength={200} />

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
          {fixed ? (
            <span className="rf-fixed">Tarefa fixa · {row!.days.join(', ')}</span>
          ) : (
            <div className="plan-views" role="radiogroup" aria-label="Tipo">
              {(['Tarefa', 'Lembrete'] as RoutineType[]).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={type === v} aria-selected={type === v} onClick={() => setType(v)}>{v}</button>
              ))}
            </div>
          )}
        </div>

        <div className="rf-row">
          <span className="rf-l">Lançada em</span>
          <span className="rf-locked" aria-label="Lançada em">
            <Icon name="calendar" size={13} />{br(launched)}<small>fixa</small>
          </span>
        </div>

        {!fixed && (
          <label className="rf-row">
            <span className="rf-l">Entrega</span>
            <input type="date" className="ninput" required={type === 'Tarefa'} min={launched} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data de entrega" />
            {type === 'Lembrete' && <span className="hint rf-opt">opcional</span>}
          </label>
        )}

        <div className="rf-row">
          <span className="rf-l">Formato</span>
          <div className="rf-urg rf-fmt" role="radiogroup" aria-label="Formato">
            {TASK_FORMATS.map(([v, c]) => (
              <button key={v} type="button" role="radio" aria-checked={format === v} className={c} onClick={() => setFormat(format === v ? null : v)}>
                <i />{v === 'Outro' ? 'Outro…' : v}
              </button>
            ))}
            <button type="button" role="radio" aria-checked={format === null} onClick={() => setFormat(null)}>Nenhum</button>
          </div>
        </div>
        {format === 'Outro' && (
          <label className="rf-row">
            <span className="rf-l" />
            <input className="ninput" style={{ flex: 1 }} placeholder="Descreva (ex.: Tratar áudio)" aria-label="Descreva o formato" value={formatOther} autoFocus maxLength={120} onChange={(e) => setFormatOther(e.target.value)} />
          </label>
        )}

        <div className="rf-row rf-desc">
          <span className="rf-l">Descrição</span>
          {descOpen ? (
            <textarea
              className="ninput"
              rows={3}
              maxLength={1900}
              autoFocus={!row?.desc}
              placeholder="O que precisa ser feito, detalhes, links…"
              aria-label="Descrição da tarefa"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          ) : (
            <button type="button" className="rf-desc-add" onClick={() => setDescOpen(true)} aria-expanded="false">
              <Icon name="plus" size={13} />Adicionar descrição
            </button>
          )}
        </div>

        <div className="rf-row">
          <span className="rf-l">Urgência</span>
          <div className="rf-urg" role="radiogroup" aria-label="Urgência">
            {(['Alta', 'Média', 'Baixa'] as const).map((u) => (
              <button key={u} type="button" role="radio" aria-checked={urgency === u} className={`ru-${u === 'Alta' ? 'alta' : u === 'Média' ? 'media' : 'baixa'}`} onClick={() => setUrgency(u)}>{u}</button>
            ))}
          </div>
        </div>

        <div className="rf-row">
          <span className="rf-l">Cliente</span>
          <div className="rf-urg rf-ckind" role="radiogroup" aria-label="Tipo de cliente">
            {([['agencia', 'Cliente'], ['freelancer', 'Freelancer'], ['casamento', 'Casamento'], ['nenhum', 'Nenhum']] as [Kind, string][]).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={ckind === v} onClick={() => { setCkind(v); setErr(null); }}>{l}</button>
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
        {canLink && (
          <div className="rf-row rf-plan">
            <span className="rf-l">Planejamento</span>
            {row?.contentId ? (
              <span className="rf-plan-ok">
                <Icon name="check" size={13} />Ligada ao conteúdo do planejamento
                <a className="link-btn" href={`notion://www.notion.so/${row.contentId.replace(/-/g, '')}`}>Abrir no Notion</a>
              </span>
            ) : (
              <select className="ninput" style={{ flex: 1 }} value={planLink} onChange={(e) => setPlanLink(e.target.value)} aria-label="Conteúdo do planejamento">
                <option value="novo">Criar no planejamento (fica pendente para completar)</option>
                {(cards ?? []).length > 0 && (
                  <optgroup label="Ligar a um conteúdo que já existe">
                    {cards!.map((c) => <option key={c.id} value={c.id}>{c.kind ? `${c.kind} · ` : ''}{c.title}{c.note ? ` — ${c.note}` : ''}</option>)}
                  </optgroup>
                )}
                <option value="nao">Não ligar ao planejamento</option>
              </select>
            )}
          </div>
        )}
        {(ckind === 'freelancer' || ckind === 'casamento') && (
          <label className="rf-row">
            <span className="rf-l" />
            <input
              key={ckind}
              className="ninput"
              style={{ flex: 1 }}
              placeholder={ckind === 'casamento' ? 'Nome do casal (ex.: Ana e Pedro)' : 'Nome do cliente freelancer'}
              aria-label={ckind === 'casamento' ? 'Nome do casal' : 'Nome do cliente freelancer'}
              value={freeName}
              autoFocus
              maxLength={80}
              onChange={(e) => setFreeName(e.target.value)}
            />
          </label>
        )}

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

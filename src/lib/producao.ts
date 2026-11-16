import 'server-only';
import { createHmac } from 'node:crypto';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import schema from './schema.json';
import { env } from './env';
import { invalidate, memo } from './cache';
import { MONTHS, addDays, addMonths, localParts, weekdayMon } from './domain';
import { checkbox, date, isPage, normId, notion, queryAll, select, text, titleProp } from './notion';
import { matchCalName, multi } from './planning';

// Produção da equipe: o que cada pessoa precisa fazer na semana.
// - Conteúdos vêm do 🗓️ Calendário mensal, pela etiqueta "Demanda atual está com".
// - Tarefas fixas, lembretes e tarefas avulsas ficam na tabela do app "Produção — rotina e lembretes".

const P = schema.planning;
const R = schema.routine;

export const TEAM = ['Lemuel', 'Marcos', 'Yan', 'Rafa'] as const;
export type Person = (typeof TEAM)[number];
export type Who = Person | 'Equipe';
export const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;
export type Urgency = 'atrasado' | 'alta' | 'media' | 'baixa';
export const ROUTINE_TYPES = ['Tarefa fixa', 'Lembrete', 'Tarefa'] as const;
export type RoutineType = (typeof ROUTINE_TYPES)[number];
export const URGENCY_LABEL = ['Alta', 'Média', 'Baixa'] as const;
export const FORMATS = ['Vídeo', 'Post', 'Story'] as const;
export type TaskFormat = (typeof FORMATS)[number];

export interface ProdTask {
  /** Chave única na tela (rotina repete: id + dia). */
  key: string;
  id: string;
  source: 'conteudo' | 'rotina';
  person: Who;
  title: string;
  /** Nome do cliente como aparece no app (ou no Calendário mensal). */
  client: string | null;
  clientId: string | null;
  day: string | null;
  time: string | null;
  kind: string | null;
  /** O que falta (Observação do Calendário mensal). */
  note: string | null;
  urgency: Urgency;
  type: RoutineType | 'Conteúdo';
  done: boolean;
  url: string;
  /** Dia em que a tarefa foi lançada (só nas tarefas e lembretes da equipe). */
  launched?: string | null;
}

export interface Routine {
  id: string;
  title: string;
  person: Who;
  type: RoutineType;
  days: string[];
  date: string | null;
  urgency: (typeof URGENCY_LABEL)[number];
  client: string;
  doneOn: string[];
  active: boolean;
  /** Dia em que foi lançada (criada no Notion): fixo, ninguém altera. */
  created: string;
  format: TaskFormat | null;
}

export const routineConfigured = () => !!env.routineDb;

/** Link fixo da TV (só leitura), derivado do SESSION_SECRET. */
export function tvKey(): string {
  return createHmac('sha256', Buffer.from(env.sessionSecret)).update('arco-tv-producao-v1').digest('base64url').slice(0, 28);
}
export function validTvKey(k: string | undefined | null): boolean {
  if (!k) return false;
  const a = Buffer.from(k);
  const b = Buffer.from(tvKey());
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

const isPerson = (s: string | null): s is Person => !!s && (TEAM as readonly string[]).includes(s);

/** Urgência automática dos conteúdos pela data de postagem. */
function urgencyByDay(day: string | null, today: string): Urgency {
  if (!day) return 'media';
  if (day < today) return 'atrasado';
  if (day <= addDays(today, 1)) return 'alta';
  if (day <= addDays(today, 6)) return 'media';
  return 'baixa';
}
const fromLabel = (u: string | null): Urgency => (u === 'Alta' ? 'alta' : u === 'Baixa' ? 'baixa' : 'media');

function toRoutine(p: PageObjectResponse): Routine {
  const pr = p.properties;
  const person = select(pr[R.person]);
  const type = select(pr[R.type]);
  const urg = select(pr[R.urgency]);
  return {
    id: p.id,
    title: text(pr[R.title]) || 'Sem título',
    person: person === 'Equipe' || isPerson(person) ? person : 'Equipe',
    type: (ROUTINE_TYPES as readonly string[]).includes(type ?? '') ? (type as RoutineType) : 'Tarefa',
    days: multi(pr[R.days]).filter((d) => (WEEKDAYS as readonly string[]).includes(d)),
    date: date(pr[R.date])?.slice(0, 10) ?? null,
    urgency: (URGENCY_LABEL as readonly string[]).includes(urg ?? '') ? (urg as Routine['urgency']) : 'Média',
    client: text(pr[R.client]),
    doneOn: text(pr[R.doneOn]).split(/[\s,]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    active: checkbox(pr[R.active]),
    created: localParts(p.created_time, env.timeZone).day,
    format: (FORMATS as readonly string[]).includes(select(pr[R.format]) ?? '') ? (select(pr[R.format]) as TaskFormat) : null
  };
}

export function listRoutines(): Promise<Routine[]> {
  if (!env.routineDb) return Promise.resolve([]);
  return memo('prod:routines', 15_000, async () => {
    const pages = await queryAll(env.routineDb!, {});
    return pages.filter((p) => !p.archived).map(toRoutine);
  });
}

/** Conteúdos do Calendário mensal que estão com alguém da equipe. */
function listContentTasks(fromDay: string, toDay: string) {
  if (!env.planningDb) return Promise.resolve([] as PageObjectResponse[]);
  return memo(`plan:prod:${fromDay}:${toDay}`, 15_000, async () => {
    // Máximo de 2 níveis de filtro no Notion: duas buscas.
    const owners = { or: TEAM.map((n) => ({ property: P.owner, select: { equals: n } })) };
    const notPosted = { property: P.status, status: { does_not_equal: 'Postado' } };
    const open = [{ property: P.done, checkbox: { equals: false } }, notPosted];
    const [dated, undated] = await Promise.all([
      queryAll(env.planningDb!, {
        // inclui os já entregues (Finalizado marcado) para aparecerem riscados no checklist
        filter: { and: [owners, notPosted, { property: P.date, date: { on_or_after: fromDay } }, { property: P.date, date: { on_or_before: toDay } }] },
        sorts: [{ property: P.date, direction: 'ascending' }]
      }),
      queryAll(env.planningDb!, {
        filter: { and: [owners, ...open, { property: P.date, date: { is_empty: true } }, { property: P.status, status: { equals: 'Realizando' } }] }
      })
    ]);
    return [...dated, ...undated].filter((p) => !p.archived);
  });
}

export interface ProdWeek {
  start: string;
  end: string;
  today: string;
  tasks: ProdTask[];
  routines: Routine[];
  error: string | null;
}

/**
 * A semana de produção. Conteúdos atrasados (até 3 semanas antes) também aparecem,
 * marcados como atrasados, para ninguém esquecer.
 */
export async function productionWeek(
  start: string,
  today: string,
  clients: { id: string; name: string; calName: string }[]
): Promise<ProdWeek> {
  const end = addDays(start, 6);
  const out: ProdWeek = { start, end, today, tasks: [], routines: [], error: null };
  const calToClient = (cal: string | null) => {
    if (!cal) return null;
    return clients.find((c) => c.calName === cal) ?? clients.find((c) => matchCalName(c.name, [cal])) ?? null;
  };

  const [pages, routines] = await Promise.all([
    listContentTasks(addDays(start, -21), end).catch((e) => {
      console.error('[producao] calendário', e);
      out.error = 'Não foi possível ler o Calendário mensal agora.';
      return [] as PageObjectResponse[];
    }),
    listRoutines().catch((e) => {
      console.error('[producao] rotina', e);
      out.error = 'Não foi possível ler as tarefas fixas agora.';
      return [] as Routine[];
    })
  ]);

  for (const p of pages) {
    if (!isPage(p)) continue;
    const pr = p.properties;
    const owner = select(pr[P.owner]);
    if (!isPerson(owner)) continue;
    const iso = date(pr[P.date]);
    const parts = iso ? localParts(iso, env.timeZone) : null;
    const day = parts?.day ?? null;
    const done = checkbox(pr[P.done]);
    // entregues de semanas anteriores não aparecem mais
    if (done && (!day || day < start)) continue;
    const cal = select(pr[P.client]);
    const c = calToClient(cal);
    out.tasks.push({
      key: `c-${p.id}`,
      id: p.id,
      source: 'conteudo',
      person: owner,
      title: text(pr[P.title]) || 'Sem título',
      client: c?.name ?? cal,
      clientId: c?.id ?? null,
      day,
      time: parts?.time ?? null,
      kind: select(pr[P.kind]),
      note: select(pr[P.note]),
      urgency: done ? urgencyByDay(day && day < today ? today : day, today) : urgencyByDay(day, today),
      type: 'Conteúdo',
      done,
      url: (p as { url?: string }).url ?? `https://www.notion.so/${normId(p.id)}`
    });
  }

  out.routines = routines;
  for (const r of routines) {
    if (!r.active) continue;
    const base = {
      id: r.id,
      source: 'rotina' as const,
      person: r.person,
      title: r.title,
      client: r.client || null,
      clientId: clients.find((c) => c.name === r.client)?.id ?? null,
      time: null,
      kind: r.format,
      note: null,
      type: r.type,
      url: `https://www.notion.so/${normId(r.id)}`,
      launched: r.created
    };
    if (r.type !== 'Tarefa fixa') {
      // tarefa e lembrete: no dia da entrega; se ficou para trás sem fazer, aparece como atrasada
      const done = !!r.date && r.doneOn.includes(r.date);
      if (!r.date) {
        if (!done) out.tasks.push({ ...base, key: `r-${r.id}`, day: null, urgency: fromLabel(r.urgency), done: false });
        continue;
      }
      if (r.date > end) continue;
      if (r.date < start && done) continue;
      out.tasks.push({
        ...base,
        key: `r-${r.id}-${r.date}`,
        day: r.date,
        urgency: !done && r.date < today ? 'atrasado' : fromLabel(r.urgency),
        done
      });
      continue;
    }
    // tarefa fixa: repete nos dias marcados
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      if (!r.days.includes(WEEKDAYS[weekdayMon(d)])) continue;
      out.tasks.push({ ...base, key: `r-${r.id}-${d}`, day: d, urgency: fromLabel(r.urgency), done: r.doneOn.includes(d) });
    }
  }
  return out;
}

// ---------- escrita (só na tabela do app) ----------

async function routinePage(id: string): Promise<PageObjectResponse> {
  const p = await notion().pages.retrieve({ page_id: id });
  if (!isPage(p) || !env.routineDb || normId(p.parent.type === 'database_id' ? p.parent.database_id : '') !== normId(env.routineDb)) {
    throw Object.assign(new Error('Tarefa não encontrada'), { code: 'object_not_found' });
  }
  return p;
}

/** Marca/desmarca a tarefa como feita naquele dia (guarda os dias em "Feito em"). */
export async function setRoutineDone(id: string, day: string, done: boolean) {
  const r = toRoutine(await routinePage(id));
  const set = new Set(r.doneOn);
  if (done) set.add(day);
  else set.delete(day);
  // guarda só os últimos 120 dias para o campo não crescer sem fim
  const keep = [...set].sort().slice(-120);
  await notion().pages.update({ page_id: id, properties: { [R.doneOn]: { rich_text: [{ text: { content: keep.join(' ') } }] } } as never });
  invalidate('prod:');
}

export interface RoutineInput {
  title: string;
  person: Who;
  type: RoutineType;
  days: string[];
  date: string | null;
  urgency: (typeof URGENCY_LABEL)[number];
  client: string;
  format: TaskFormat | null;
}

function routineProps(x: RoutineInput) {
  return {
    [R.title]: titleProp(x.title),
    [R.person]: { select: { name: x.person } },
    [R.type]: { select: { name: x.type } },
    [R.days]: { multi_select: x.type !== 'Tarefa fixa' ? [] : x.days.map((name) => ({ name })) },
    [R.date]: { date: x.type !== 'Tarefa fixa' && x.date ? { start: x.date } : null },
    [R.urgency]: { select: { name: x.urgency } },
    [R.client]: { rich_text: x.client ? [{ text: { content: x.client } }] : [] },
    [R.format]: { select: x.format ? { name: x.format } : null }
  };
}

export async function createRoutine(x: RoutineInput): Promise<string> {
  if (!env.routineDb) throw new Error('Tabela de rotina não configurada');
  const p = await notion().pages.create({
    parent: { database_id: env.routineDb },
    properties: { ...routineProps(x), [R.active]: { checkbox: true } } as never
  });
  invalidate('prod:');
  return p.id;
}

export async function updateRoutine(id: string, x: RoutineInput) {
  await routinePage(id);
  await notion().pages.update({ page_id: id, properties: routineProps(x) as never });
  invalidate('prod:');
}

/** Tirar da lista: vai para a lixeira do Notion (dá para restaurar por 30 dias). */
export async function trashRoutine(id: string) {
  await routinePage(id);
  await notion().pages.update({ page_id: id, archived: true });
  invalidate('prod:');
}

/** Checklist de entrega: marca/desmarca "Finalizado" no card do Calendário mensal. */
export async function setContentDone(id: string, done: boolean) {
  const p = await notion().pages.retrieve({ page_id: id });
  if (!isPage(p) || !env.planningDb || normId(p.parent.type === 'database_id' ? p.parent.database_id : '') !== normId(env.planningDb)) {
    throw Object.assign(new Error('Card não encontrado'), { code: 'object_not_found' });
  }
  await notion().pages.update({ page_id: id, properties: { [P.done]: { checkbox: done } } as never });
  invalidate('plan:');
  invalidate('prod:');
}

/** Nome da pessoa na coluna "Editado/Design por" do Calendário mensal (lá o Rafa é "Rafael"). */
export const EDITOR_NAME: Record<Person, string> = { Lemuel: 'Lemuel', Marcos: 'Marcos', Yan: 'Yan', Rafa: 'Rafael' };
const editorToPerson = (n: string | null): Person | null =>
  n === 'Rafael' ? 'Rafa' : isPerson(n) ? n : null;

/**
 * Transferir demanda: muda "Demanda atual está com" e, se a pessoa editou,
 * registra "Editado/Design por" e "Editado quando" (só opções que já existem no Notion).
 */
export async function passContent(id: string, to: Person | 'Finalizado', editedBy?: Person | null, today?: string) {
  const p = await notion().pages.retrieve({ page_id: id });
  if (!isPage(p) || !env.planningDb || normId(p.parent.type === 'database_id' ? p.parent.database_id : '') !== normId(env.planningDb)) {
    throw Object.assign(new Error('Card não encontrado'), { code: 'object_not_found' });
  }
  const props: Record<string, unknown> = { [P.owner]: { select: { name: to } } };
  if (editedBy && today) {
    props[P.designBy] = { select: { name: EDITOR_NAME[editedBy] } };
    props[P.editMonth] = { select: { name: MONTHS[Number(today.slice(5, 7)) - 1] } };
  }
  await notion().pages.update({ page_id: id, properties: props as never });
  invalidate('plan:');
  invalidate('prod:');
}

// ---------- relatório da produção ----------

export type Fmt = 'reels' | 'post' | 'story' | 'foto';
const fmtOf = (k: string | null): Fmt | null => {
  const s = (k ?? '').toLowerCase();
  return s.startsWith('reels') ? 'reels' : s.startsWith('post') ? 'post' : s.startsWith('stor') ? 'story' : s.startsWith('foto') ? 'foto' : null;
};
export type Counts = Record<Fmt, number> & { total: number };
const zero = (): Counts => ({ reels: 0, post: 0, story: 0, foto: 0, total: 0 });

export interface ProdReport {
  month: string;
  people: { name: Person; counts: Counts }[];
  total: Counts;
  /** Entregues no mês sem "Editado/Design por" marcado. */
  noEditor: number;
  weeks: { start: string; counts: Counts }[];
  clients: { name: string; counts: Counts }[];
}

/**
 * Quem editou o quê no mês. Conta um conteúdo quando tem "Editado/Design por" de alguém da equipe e
 * "Editado quando" = o mês; se "Editado quando" estiver vazio, vale a data de postagem no mês com o card
 * Finalizado ou Postado.
 */
export async function productionReport(first: string): Promise<ProdReport | string> {
  if (!env.planningDb) return 'nao-configurado';
  const last = addDays(addMonths(first, 1), -1);
  const monthName = MONTHS[Number(first.slice(5, 7)) - 1];
  return memo(`prod:rep:${first}`, 30_000, async () => {
    const [byMonth, byDate] = await Promise.all([
      queryAll(env.planningDb!, {
        filter: {
          and: [
            { property: P.editMonth, select: { equals: monthName } },
            { property: P.date, date: { on_or_after: addDays(first, -75) } },
            { property: P.date, date: { on_or_before: addDays(last, 75) } }
          ]
        }
      }),
      queryAll(env.planningDb!, {
        filter: {
          and: [
            { property: P.editMonth, select: { is_empty: true } },
            { property: P.date, date: { on_or_after: first } },
            { property: P.date, date: { on_or_before: last } },
            { or: [{ property: P.done, checkbox: { equals: true } }, { property: P.status, status: { equals: 'Postado' } }] }
          ]
        }
      })
    ]);
    const seen = new Set<string>();
    const fromDate = new Set(byDate.map((p) => p.id));
    const rep: ProdReport = {
      month: first,
      people: TEAM.map((name) => ({ name, counts: zero() })),
      total: zero(),
      noEditor: 0,
      weeks: [],
      clients: []
    };
    for (let d = startOfWeekMon(first); d <= last; d = addDays(d, 7)) rep.weeks.push({ start: d, counts: zero() });
    const clientMap = new Map<string, Counts>();
    for (const p of [...byMonth, ...byDate]) {
      if (!isPage(p) || p.archived || seen.has(p.id)) continue;
      seen.add(p.id);
      const pr = p.properties;
      const f = fmtOf(select(pr[P.kind]));
      if (!f) continue;
      const who = editorToPerson(select(pr[P.designBy]));
      if (!who) {
        if (fromDate.has(p.id)) rep.noEditor++;
        continue;
      }
      const add = (c: Counts) => { c[f]++; c.total++; };
      add(rep.people.find((x) => x.name === who)!.counts);
      add(rep.total);
      const day = date(pr[P.date])?.slice(0, 10);
      const wk = day ? rep.weeks.find((w) => day >= w.start && day <= addDays(w.start, 6)) : null;
      if (wk) add(wk.counts);
      const cal = select(pr[P.client]) ?? 'Sem cliente';
      if (!clientMap.has(cal)) clientMap.set(cal, zero());
      add(clientMap.get(cal)!);
    }
    // tarefas lançadas na Produção com formato, marcadas como feitas no mês
    const routines = await listRoutines().catch(() => [] as Routine[]);
    for (const r of routines) {
      if (r.type === 'Tarefa fixa' || !r.format || !r.date || !isPerson(r.person)) continue;
      if (!r.doneOn.includes(r.date) || r.date < first || r.date > last) continue;
      const f: Fmt = r.format === 'Vídeo' ? 'reels' : r.format === 'Post' ? 'post' : 'story';
      const add = (c: Counts) => { c[f]++; c.total++; };
      add(rep.people.find((x) => x.name === r.person)!.counts);
      add(rep.total);
      const wk = rep.weeks.find((w) => r.date! >= w.start && r.date! <= addDays(w.start, 6));
      if (wk) add(wk.counts);
      const cname = r.client || 'Sem cliente';
      if (!clientMap.has(cname)) clientMap.set(cname, zero());
      add(clientMap.get(cname)!);
    }
    rep.clients = [...clientMap.entries()].map(([name, counts]) => ({ name, counts })).sort((a, b) => b.counts.total - a.counts.total);
    return rep;
  }).catch((e) => {
    console.error('[producao] relatório', e);
    return 'erro';
  });
}

const startOfWeekMon = (d: string) => addDays(d, -weekdayMon(d));

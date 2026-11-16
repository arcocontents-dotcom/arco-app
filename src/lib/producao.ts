import 'server-only';
import { createHmac } from 'node:crypto';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import schema from './schema.json';
import { env } from './env';
import { invalidate, memo } from './cache';
import { MONTHS, addDays, addMonths, localParts, weekdayMon } from './domain';
import { checkbox, date, isPage, normId, notion, queryAll, select, text, titleProp } from './notion';
import { matchCalName, multi } from './planning';
import { listShoots, type Shoot } from './captacao';
import { produtosToText } from './produtos';

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
export const FORMATS = ['Editar reels', 'Editar post', 'Editar story', 'Editar foto', 'Postar', 'Fazer roteiro', 'Outro'] as const;
/** Nomes antigos que ainda podem existir no Notion. */
const LEGACY_FORMAT: Record<string, TaskFormat> = { 'Vídeo': 'Editar reels', Post: 'Editar post', Story: 'Editar story' };
export type TaskFormat = (typeof FORMATS)[number];

export interface ProdTask {
  /** Chave única na tela (rotina repete: id + dia). */
  key: string;
  id: string;
  source: 'conteudo' | 'rotina' | 'captacao';
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
  type: RoutineType | 'Conteúdo' | 'Captação';
  done: boolean;
  url: string;
  /** Dia em que a tarefa foi lançada (só nas tarefas e lembretes da equipe). */
  launched?: string | null;
  /** Formato da task interna (para a cor). */
  fmt?: string | null;
  /** Descrição da task (o que a pessoa precisa fazer), sempre aberta no card. */
  desc?: string | null;
  /** Card do Planejamento ligado (task da Produção). */
  planId?: string | null;
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
  /** Descrição quando o formato é "Outro". */
  formatOther: string;
  /** Descrição da tarefa (opcional). */
  desc: string;
  /** Card do Planejamento (Calendário mensal) ligado. */
  contentId: string | null;
}

export const routineConfigured = () => !!env.routineDb;

/** Link fixo da TV (só leitura), derivado do SESSION_SECRET. */
export function tvKey(): string {
  return createHmac('sha256', Buffer.from(env.sessionSecret)).update('arco-tv-producao-v1').digest('base64url').slice(0, 28);
}
/** Link pessoal de cada pessoa da equipe (vê e marca só as próprias tarefas). */
export function teamKey(person: Person): string {
  return createHmac('sha256', Buffer.from(env.sessionSecret)).update(`arco-equipe-v1:${person}`).digest('base64url').slice(0, 24);
}
export function validTeamKey(person: string, k: string | undefined | null): person is Person {
  if (!k || !isPerson(person)) return false;
  const a = Buffer.from(k);
  const b = Buffer.from(teamKey(person));
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
export function validTvKey(k: string | undefined | null): boolean {
  if (!k) return false;
  const a = Buffer.from(k);
  const b = Buffer.from(tvKey());
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export const isPerson = (s: string | null): s is Person => !!s && (TEAM as readonly string[]).includes(s);

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
    format: (() => {
      const f = select(pr[R.format]) ?? '';
      return (FORMATS as readonly string[]).includes(f) ? (f as TaskFormat) : LEGACY_FORMAT[f] ?? null;
    })(),
    formatOther: text(pr[R.formatOther]),
    desc: text(pr[R.desc]),
    contentId: (() => {
      const c = pr[R.content];
      return c?.type === 'relation' ? c.relation[0]?.id ?? null : null;
    })()
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
  clients: { id: string; name: string; calName: string }[],
  end: string = addDays(start, 6)
): Promise<ProdWeek> {
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

  // captações: aparecem na coluna de cada pessoa que vai
  const shoots = await listShoots(start, end).catch((e) => {
    console.error('[producao] captações', e);
    return [] as Shoot[];
  });
  for (const sh of shoots) {
    if (sh.status === 'Cancelada') continue;
    for (const person of sh.crew) {
      out.tasks.push({
        key: `s-${sh.id}-${person}`,
        id: sh.id,
        source: 'captacao',
        person,
        title: sh.title,
        client: sh.client || null,
        clientId: clients.find((c) => c.name === sh.client)?.id ?? null,
        day: sh.day,
        time: sh.time,
        kind: 'Captação',
        note: sh.place || null,
        desc: [sh.products.length ? `Produtos: ${produtosToText(sh.products)}` : '', sh.note].filter(Boolean).join('\n') || null,
        urgency: sh.status !== 'Realizada' && sh.day < today ? 'atrasado' : urgencyByDay(sh.day < today ? today : sh.day, today),
        type: 'Captação',
        done: sh.status === 'Realizada',
        url: sh.url
      });
    }
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
      kind: r.format === 'Outro' ? r.formatOther || 'Outro' : r.format,
      fmt: r.format,
      desc: r.desc || null,
      planId: r.contentId,
      note: null,
      type: r.type,
      url: `https://www.notion.so/${normId(r.id)}`,
      launched: r.created
    };
    if (r.type !== 'Tarefa fixa') {
      // tarefa e lembrete: no dia da entrega; se ficou para trás sem fazer, aparece como atrasada
      if (!r.date) {
        // lembrete sem data: fica na lista até ser marcado; depois some na semana seguinte
        const lastDone = [...r.doneOn].sort().pop() ?? null;
        if (lastDone && lastDone < start) continue;
        out.tasks.push({ ...base, key: `r-${r.id}`, day: null, urgency: fromLabel(r.urgency), done: !!lastDone });
        continue;
      }
      const done = r.doneOn.includes(r.date);
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
  // task ligada ao Planejamento: registra quem editou e o card segue para aprovação
  if (done && r.contentId && isPerson(r.person)) {
    const { taskDoneOnPlanning } = await import('./vinculo');
    await taskDoneOnPlanning(r.contentId, r.format, r.person, day).catch((e) => console.error('[producao] planejamento', e));
  }
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
  formatOther: string;
  desc: string;
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
    [R.format]: { select: x.format ? { name: x.format } : null },
    [R.formatOther]: { rich_text: x.format === 'Outro' && x.formatOther ? [{ text: { content: x.formatOther.slice(0, 120) } }] : [] },
    [R.desc]: { rich_text: x.desc ? [{ text: { content: x.desc.slice(0, 1900) } }] : [] }
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

// ---------- dashboard da produção (equipe) ----------

export const METRICS = [
  { k: 'captacoes', label: 'Captações', cls: 'f-capt' },
  { k: 'captou', label: 'Vídeos captados', cls: 'f-capt' },
  { k: 'reels', label: 'Vídeos editados', cls: 'f-reels' },
  { k: 'post', label: 'Posts editados', cls: 'f-post' },
  { k: 'story', label: 'Stories editados', cls: 'f-story' },
  { k: 'foto', label: 'Fotos editadas', cls: 'f-foto' },
  { k: 'postou', label: 'Postou no Instagram', cls: 'f-postar' },
  { k: 'roteiro', label: 'Roteiros', cls: 'f-roteiro' }
] as const;
export type Metric = (typeof METRICS)[number]['k'];
export type MetricCounts = Record<Metric, number>;
const zeroM = (): MetricCounts => Object.fromEntries(METRICS.map((m) => [m.k, 0])) as MetricCounts;

type Fmt = 'reels' | 'post' | 'story' | 'foto';
const fmtOf = (k: string | null): Fmt | null => {
  const s = (k ?? '').toLowerCase();
  return s.startsWith('reels') || s.startsWith('víd') ? 'reels' : s.startsWith('post') || s.startsWith('carross') ? 'post' : s.startsWith('stor') ? 'story' : s.startsWith('foto') ? 'foto' : null;
};

/** Um item produzido (para a lista ao clicar na pessoa). */
export interface DashItem {
  k: Metric;
  title: string;
  client: string | null;
  day: string | null;
  url: string;
}

/** Postado no Instagram no mês (Calendário mensal: data de postagem no mês e Finalizado/Postado). */
export interface PostedTotals {
  total: number;
  reels: number;
  /** Post estático, carrossel e fotos. */
  post: number;
  story: number;
  outro: number;
  equipe: number;
  cliente: number;
  semQuem: number;
}

export interface TeamDashboard {
  month: string;
  people: { name: Person; m: MetricCounts; items: DashItem[]; posted: { reels: number; post: number; story: number; outro: number } }[];
  team: MetricCounts;
  posted: PostedTotals;
}

/**
 * O que cada pessoa fez no mês, juntando:
 * - 📸 Captações (Notion): captações feitas (não canceladas, até hoje) por quem foi;
 * - Calendário mensal: "Gravado/Briefing por" + "Gravado quando" (vídeos captados), "Editado/Design por" + "Editado quando"
 *   (editados por formato) e "Postado por" com data no mês e card Finalizado/Postado (postagens);
 * - aba Produção: tasks com formato marcadas como feitas no mês (Editar…, Postar, Fazer roteiro).
 */
export async function teamDashboard(first: string, today: string): Promise<TeamDashboard | string> {
  if (!env.planningDb) return 'nao-configurado';
  const last = addDays(addMonths(first, 1), -1);
  const monthName = MONTHS[Number(first.slice(5, 7)) - 1];
  return memo(`prod:dash:${first}:${today}`, 30_000, async () => {
    const near = [{ property: P.date, date: { on_or_after: addDays(first, -75) } }, { property: P.date, date: { on_or_before: addDays(last, 75) } }];
    const [edited, editedNoMonth, recordedDated, recordedNoDate, posted, shoots, routines] = await Promise.all([
      queryAll(env.planningDb!, { filter: { and: [{ property: P.editMonth, select: { equals: monthName } }, ...near] } }),
      queryAll(env.planningDb!, {
        filter: {
          and: [
            { property: P.editMonth, select: { is_empty: true } },
            { property: P.date, date: { on_or_after: first } },
            { property: P.date, date: { on_or_before: last } },
            { or: [{ property: P.done, checkbox: { equals: true } }, { property: P.status, status: { equals: 'Postado' } }] }
          ]
        }
      }),
      queryAll(env.planningDb!, { filter: { and: [{ property: P.recMonth, select: { equals: monthName } }, ...near] } }),
      // gravados que ainda não têm data de postagem também contam
      queryAll(env.planningDb!, { filter: { and: [{ property: P.recMonth, select: { equals: monthName } }, { property: P.date, date: { is_empty: true } }] } }),
      queryAll(env.planningDb!, {
        filter: {
          and: [
            { property: P.date, date: { on_or_after: first } },
            { property: P.date, date: { on_or_before: last } },
            { or: [{ property: P.done, checkbox: { equals: true } }, { property: P.status, status: { equals: 'Postado' } }] }
          ]
        }
      }),
      listShoots(first, last).catch(() => [] as Shoot[]),
      listRoutines().catch(() => [] as Routine[])
    ]);
    const people = TEAM.map((name) => ({ name, m: zeroM(), items: [] as DashItem[], posted: { reels: 0, post: 0, story: 0, outro: 0 } }));
    const postedT: PostedTotals = { total: 0, reels: 0, post: 0, story: 0, outro: 0, equipe: 0, cliente: 0, semQuem: 0 };
    const team = zeroM();
    const bump = (who: Person, k: Metric, it: Omit<DashItem, 'k'>) => {
      const p = people.find((x) => x.name === who)!;
      p.m[k]++;
      p.items.push({ k, ...it });
      team[k]++;
    };
    const card = (p: PageObjectResponse): Omit<DashItem, 'k'> => ({
      title: text(p.properties[P.title]) || 'Sem título',
      client: select(p.properties[P.client]),
      day: date(p.properties[P.date])?.slice(0, 10) ?? null,
      url: `https://www.notion.so/${normId(p.id)}`
    });
    const live = (p: unknown): p is PageObjectResponse => isPage(p) && !p.archived;

    // Captações: cada cliente gravado no mês (Calendário mensal: "Gravado/Briefing por" + "Gravado quando")
    // conta como uma captação de quem foi; somam as captações agendadas na aba Captação (📸) de outros clientes.
    const norm = (x: string | null) => (x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^(freelancer|casamento) · /, '').trim();
    const sameClient = (a: string | null, b: string | null) => !!norm(a) && !!norm(b) && (norm(a).includes(norm(b)) || norm(b).includes(norm(a)));
    const capByPerson = new Map<Person, Map<string, { client: string | null; n: number; day: string | null; shoot?: string; url?: string }>>();
    const teamCaps = new Set<string>();
    const cutoff = addDays(first, -150);
    const recorded = [...recordedDated, ...recordedNoDate.filter((p) => isPage(p) && p.created_time.slice(0, 10) >= cutoff)];
    const seenRec = new Set<string>();
    const videosRec = new Set<string>();
    for (const p of recorded) {
      if (!live(p) || seenRec.has(p.id)) continue;
      seenRec.add(p.id);
      const f = fmtOf(select(p.properties[P.kind]));
      const cal = select(p.properties[P.client]);
      const crew = [...new Set(multi(p.properties[P.briefBy]).map(editorToPerson))].filter((x): x is Person => !!x);
      if (!crew.length) continue;
      if (cal) teamCaps.add(`c:${norm(cal)}`);
      for (const who of crew) {
        // captou = vídeos (reels e stories); fotos e posts não entram
        if (f !== 'post' && f !== 'foto') {
          bump(who, 'captou', card(p));
          videosRec.add(p.id);
        }
        if (!cal) continue;
        const m = capByPerson.get(who) ?? new Map();
        const e = m.get(norm(cal)) ?? { client: cal, n: 0, day: null };
        e.n++;
        m.set(norm(cal), e);
        capByPerson.set(who, m);
      }
    }
    for (const sh of shoots) {
      if (sh.status === 'Cancelada' || sh.day > today) continue;
      const covered = [...teamCaps].some((k) => sameClient(k.slice(2), sh.client));
      if (!covered) teamCaps.add(`s:${sh.id}`);
      for (const who of new Set(sh.crew)) {
        const m = capByPerson.get(who) ?? new Map();
        const key = [...m.keys()].find((k) => sameClient(k, sh.client)) ?? `s:${sh.id}`;
        const e = m.get(key) ?? { client: sh.client || sh.title, n: 0, day: null };
        e.day = sh.day;
        e.shoot = sh.title;
        e.url = sh.url;
        m.set(key, e);
        capByPerson.set(who, m);
      }
    }
    team.captacoes = teamCaps.size;
    // no total da equipe, um vídeo gravado por duas pessoas conta uma vez
    team.captou = videosRec.size;
    for (const [who, m] of capByPerson) {
      const p = people.find((x) => x.name === who)!;
      p.m.captacoes = m.size;
      for (const e of m.values()) {
        const rec = e.n ? `${e.n} conteúdo${e.n > 1 ? 's' : ''} gravado${e.n > 1 ? 's' : ''}` : '';
        p.items.push({ k: 'captacoes', title: [e.shoot, rec].filter(Boolean).join(' · ') || 'Captação', client: e.client, day: e.day, url: e.url ?? '' });
      }
    }
    const seen = new Set<string>();
    for (const p of [...edited, ...editedNoMonth]) {
      if (!live(p) || seen.has(p.id)) continue;
      seen.add(p.id);
      const f = fmtOf(select(p.properties[P.kind]));
      const who = editorToPerson(select(p.properties[P.designBy]));
      if (f && who) bump(who, f, card(p));
    }
    for (const p of posted) {
      if (!live(p)) continue;
      const pr = p.properties;
      const f = fmtOf(select(pr[P.kind]));
      const kind = f === 'reels' ? 'reels' : f === 'story' ? 'story' : f === 'post' || f === 'foto' ? 'post' : 'outro';
      postedT.total++;
      postedT[kind]++;
      const by = select(pr[P.postedBy]);
      const who = editorToPerson(by);
      if (by === 'Cliente') postedT.cliente++;
      else if (who) postedT.equipe++;
      else postedT.semQuem++;
      if (who) {
        bump(who, 'postou', card(p));
        people.find((x) => x.name === who)!.posted[kind]++;
      }
    }
    const map: Partial<Record<TaskFormat, Metric>> = {
      'Editar reels': 'reels', 'Editar post': 'post', 'Editar story': 'story', 'Editar foto': 'foto', Postar: 'postou', 'Fazer roteiro': 'roteiro'
    };
    for (const r of routines) {
      const k = r.format ? map[r.format] : undefined;
      if (r.type === 'Tarefa fixa' || !k || !r.date || !isPerson(r.person)) continue;
      if (r.date < first || r.date > last || !r.doneOn.includes(r.date)) continue;
      // edição ligada a um card: já conta pelo "Editado/Design por" do card
      if (r.contentId && r.format?.startsWith('Editar')) continue;
      bump(r.person, k, { title: r.title, client: r.client || null, day: r.date, url: `https://www.notion.so/${normId(r.id)}` });
    }
    for (const p of people) p.items.sort((a, b) => (b.day ?? '').localeCompare(a.day ?? ''));
    return { month: first, people, team, posted: postedT };
  }).catch((e) => {
    console.error('[producao] dashboard', e);
    return 'erro';
  });
}


/** Para o link da equipe: confere se a tarefa é mesmo daquela pessoa antes de marcar. */
export async function taskBelongsTo(person: Person, source: string, id: string): Promise<boolean> {
  const p = await notion().pages.retrieve({ page_id: id });
  if (!isPage(p)) return false;
  const parent = normId(p.parent.type === 'database_id' ? p.parent.database_id : '');
  if (source === 'rotina' && env.routineDb && parent === normId(env.routineDb)) {
    const who = select(p.properties[R.person]);
    return who === person || who === 'Equipe';
  }
  if (source === 'conteudo' && env.planningDb && parent === normId(env.planningDb)) return select(p.properties[P.owner]) === person;
  if (source === 'captacao' && env.shootsDb && parent === normId(env.shootsDb)) return multi(p.properties[schema.shoot.crew]).includes(person);
  return false;
}

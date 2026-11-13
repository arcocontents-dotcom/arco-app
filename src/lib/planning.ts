import 'server-only';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import schema from './schema.json';
import { env } from './env';
import { invalidate, memo } from './cache';
import { MONTHS, localParts, type ContentType, type ItemKey } from './domain';
import {
  checkbox, date, isPage, listContentsLinked, normId, notion, queryAll, sameId, select, setPosted, text, titleProp,
  type ContentRecord
} from './notion';

// Planejamento = o "🗓️ Calendário mensal" que a Arco já usava no Notion (ideias e produção).
// O app lê e escreve nele direto: o que muda lá aparece aqui e vice-versa.
// Regra de ouro: só mexe em Status, Observação, Finalizado, Data, Título, Tipo e Responsável,
// sempre usando opções que já existem. Nunca apaga nada.

const P = schema.planning;

export const PLAN_STATUSES = ['Ideia', 'Realizando', 'Postado'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export interface PlanItem {
  id: string;
  url: string;
  title: string;
  cal: string;
  day: string | null;
  time: string | null;
  status: PlanStatus;
  kind: string | null;
  note: string | null;
  owner: string | null;
  done: boolean;
}

export interface PlanOptions {
  clients: string[];
  kinds: string[];
  notes: string[];
  owners: string[];
}

export type PlanError = 'nao-configurado' | 'sem-acesso' | 'erro';

export const planningConfigured = () => !!env.planningDb;

function status(p: PageObjectResponse['properties'][string] | undefined): string | null {
  if (!p) return null;
  if (p.type === 'status') return p.status?.name ?? null;
  if (p.type === 'select') return p.select?.name ?? null;
  return null;
}

function toPlan(p: PageObjectResponse): PlanItem {
  const pr = p.properties;
  const iso = date(pr[P.date]);
  const parts = iso ? localParts(iso, env.timeZone) : null;
  const st = status(pr[P.status]);
  return {
    id: p.id,
    url: (p as { url?: string }).url ?? `https://www.notion.so/${normId(p.id)}`,
    title: text(pr[P.title]) || 'Sem título',
    cal: select(pr[P.client]) ?? '',
    day: parts?.day ?? null,
    time: parts?.time ?? null,
    status: (PLAN_STATUSES as readonly string[]).includes(st ?? '') ? (st as PlanStatus) : 'Ideia',
    kind: select(pr[P.kind]),
    note: select(pr[P.note]),
    owner: select(pr[P.owner]),
    done: checkbox(pr[P.done])
  };
}

function classify(e: unknown): PlanError {
  const code = (e as { code?: string; status?: number })?.code;
  const st = (e as { status?: number })?.status;
  if (code === 'object_not_found' || code === 'unauthorized' || code === 'restricted_resource' || st === 404 || st === 403) return 'sem-acesso';
  console.error('[planejamento]', e);
  return 'erro';
}

/** Opções que já existem no Calendário mensal (clientes, tipos, observações, responsáveis). */
export async function planOptions(): Promise<PlanOptions | PlanError> {
  if (!env.planningDb) return 'nao-configurado';
  try {
    return await memo('plan:schema', 300_000, async () => {
      const db = (await notion().databases.retrieve({ database_id: env.planningDb! })) as unknown as {
        properties: Record<string, { type: string; select?: { options: { name: string }[] } }>;
      };
      const opts = (name: string) => db.properties[name]?.select?.options.map((o) => o.name) ?? [];
      return { clients: opts(P.client), kinds: opts(P.kind), notes: opts(P.note), owners: opts(P.owner) };
    });
  } catch (e) {
    return classify(e);
  }
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Acha o nome do cliente no Calendário mensal ("Arqui. Victoria Zeni" ↔ "Arqui. Victória Zeni"). */
export function matchCalName(name: string, options: string[]): string | null {
  const n = norm(name);
  return options.find((o) => norm(o) === n) ?? options.find((o) => norm(o).includes(n) || n.includes(norm(o))) ?? null;
}

export function listPlanning(cal: string, fromDay: string, toDay: string): Promise<PlanItem[] | PlanError> {
  if (!env.planningDb) return Promise.resolve('nao-configurado');
  return memo(`plan:${cal}:${fromDay}:${toDay}`, 15_000, async () => {
    // O Notion aceita no máximo 2 níveis de filtro aninhado: por isso são duas buscas.
    const client = { property: P.client, select: { equals: cal } };
    const [dated, ideas] = await Promise.all([
      queryAll(env.planningDb!, {
        filter: { and: [client, { property: P.date, date: { on_or_after: fromDay } }, { property: P.date, date: { on_or_before: toDay } }] },
        sorts: [{ property: P.date, direction: 'ascending' }]
      }),
      queryAll(env.planningDb!, {
        filter: { and: [client, { property: P.date, date: { is_empty: true } }, { property: P.status, status: { equals: 'Ideia' } }] }
      })
    ]);
    const pages = [...dated, ...ideas];
    return pages.filter((p) => !p.archived).map(toPlan);
  }).catch((e) => classify(e));
}

async function assertPlanPage(id: string): Promise<PageObjectResponse> {
  const p = await notion().pages.retrieve({ page_id: id });
  // Só mexe em cards do Calendário mensal; qualquer outra página é recusada.
  if (!isPage(p) || p.archived || !env.planningDb || !sameId(p.parent.type === 'database_id' ? p.parent.database_id : '', env.planningDb)) {
    throw Object.assign(new Error('Card não encontrado'), { code: 'object_not_found' });
  }
  return p;
}

export async function getPlanItem(id: string): Promise<PlanItem | null> {
  try {
    return toPlan(await assertPlanPage(id));
  } catch {
    return null;
  }
}

export interface PlanPatch {
  title?: string;
  status?: PlanStatus;
  kind?: string | null;
  note?: string | null;
  owner?: string | null;
  day?: string | null;
  done?: boolean;
}

function patchProps(x: PlanPatch): Record<string, unknown> {
  const pr: Record<string, unknown> = {};
  if (x.title !== undefined) pr[P.title] = titleProp(x.title);
  if (x.status !== undefined) pr[P.status] = { status: { name: x.status } };
  if (x.kind !== undefined) pr[P.kind] = { select: x.kind ? { name: x.kind } : null };
  if (x.note !== undefined) pr[P.note] = { select: x.note ? { name: x.note } : null };
  if (x.owner !== undefined) pr[P.owner] = { select: x.owner ? { name: x.owner } : null };
  if (x.done !== undefined) pr[P.done] = { checkbox: x.done };
  if (x.day !== undefined) {
    pr[P.date] = { date: x.day ? { start: x.day } : null };
    if (x.day) pr[P.month] = { select: { name: MONTHS[Number(x.day.slice(5, 7)) - 1] } };
  }
  return pr;
}

export async function updatePlanItem(id: string, x: PlanPatch) {
  await assertPlanPage(id);
  await notion().pages.update({ page_id: id, properties: patchProps(x) as never });
  invalidate('plan:');
}

export async function createPlanItem(cal: string, x: PlanPatch & { title: string }): Promise<string> {
  if (!env.planningDb) throw new Error('Planejamento não configurado');
  const page = await notion().pages.create({
    parent: { database_id: env.planningDb },
    properties: { [P.client]: { select: { name: cal } }, ...patchProps({ status: 'Ideia', ...x }) } as never
  });
  invalidate('plan:');
  return page.id;
}

/** "Reels 2" → Reels, "Post 1" → Post, "Storys 3" → Story, "Fotos" → Carrossel. */
export function kindToType(kind: string | null): ContentType {
  const k = (kind ?? '').toLowerCase();
  if (k.startsWith('reels')) return 'Reels';
  if (k.startsWith('stor')) return 'Story';
  if (k.startsWith('foto')) return 'Carrossel';
  return 'Post';
}

const NOTE_FOR_ITEM: Record<ItemKey, string> = {
  video: 'Falta edição',
  capa: 'Falta design',
  arte: 'Falta design',
  story: 'Falta design',
  legenda: 'Falta copy'
};

/**
 * Leva o andamento da aprovação para o card do Calendário mensal:
 * aguardando → "Aprovação post"; ajuste → "Falta edição/design/copy"; aprovado → "Finalizado";
 * postado → Status Postado + Finalizado marcado.
 */
export async function syncPlanFromContent(c: ContentRecord, opts: { unposted?: boolean } = {}) {
  if (!c.planningId || !env.planningDb) return;
  let patch: PlanPatch | null = null;
  if (c.status === 'Postado') patch = { status: 'Postado', note: 'Finalizado', done: true };
  else if (c.status === 'Aprovado') patch = { status: 'Realizando', note: 'Finalizado' };
  else if (c.status === 'Aguardando') patch = { status: 'Realizando', note: 'Aprovação post' };
  else if (c.status === 'Ajustes' || c.status === 'Reprovado') {
    const first = (Object.keys(c.items) as ItemKey[]).find((k) => c.items[k].status === 'Ajuste' || c.items[k].status === 'Reprovado');
    patch = { status: 'Realizando', note: first ? NOTE_FOR_ITEM[first] : 'Outros' };
  }
  if (!patch) return;
  if (opts.unposted) patch.done = false;
  try {
    await updatePlanItem(c.planningId, patch);
  } catch (e) {
    // Nunca trava a aprovação por causa do planejamento.
    console.error('[planejamento] sync', e);
  }
}

/** Conteúdos da aprovação ligados a cards do planejamento (para mostrar no quadro). */
export function linkedContents(clientId: string): Promise<ContentRecord[]> {
  return listContentsLinked(clientId);
}

/** Quando alguém marca "Postado" direto no Notion, a aprovação acompanha. */
export async function pullPostedFromPlan(items: PlanItem[], contents: ContentRecord[]) {
  for (const c of contents) {
    const plan = items.find((i) => sameId(i.id, c.planningId));
    if (plan && plan.status === 'Postado' && c.status !== 'Postado') {
      await setPosted(c, true).catch((e) => console.error('[planejamento] pull', e));
    }
  }
}


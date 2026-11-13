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
// Regra de ouro: só usa opções que já existem no Notion e nunca apaga nada.

const P = schema.planning;

export const PLAN_STATUSES = ['Ideia', 'Realizando', 'Postado'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** Campos de escolha única, na mesma ordem e com os mesmos nomes do Notion. */
export const SELECT_FIELDS = ['owner', 'note', 'kind', 'month', 'recMonth', 'editMonth', 'designBy', 'postedBy'] as const;
export type SelectField = (typeof SELECT_FIELDS)[number];

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
  month: string | null;
  recMonth: string | null;
  editMonth: string | null;
  designBy: string | null;
  postedBy: string | null;
  briefBy: string[];
  deadline: string | null;
  done: boolean;
}

export interface PlanOpt {
  name: string;
  color: string;
}

/** Opções (com a cor do Notion) de cada campo. */
export type PlanOptions = Record<SelectField | 'client' | 'status' | 'briefBy', PlanOpt[]> & {
  /** Nomes dos clientes, usado para ligar o cliente do app. */
  clients: string[];
};

export type PlanError = 'nao-configurado' | 'sem-acesso' | 'erro';

export const planningConfigured = () => !!env.planningDb;

function status(p: PageObjectResponse['properties'][string] | undefined): string | null {
  if (!p) return null;
  if (p.type === 'status') return p.status?.name ?? null;
  if (p.type === 'select') return p.select?.name ?? null;
  return null;
}

function multi(p: PageObjectResponse['properties'][string] | undefined): string[] {
  return p && p.type === 'multi_select' ? p.multi_select.map((o) => o.name) : [];
}

/** Prazo é fórmula no Notion: só lemos o resultado, como texto. */
function formula(p: PageObjectResponse['properties'][string] | undefined): string | null {
  if (!p || p.type !== 'formula') return null;
  const f = p.formula as { type: string; string?: string | null; number?: number | null; boolean?: boolean | null; date?: { start: string } | null };
  if (f.type === 'string') return f.string || null;
  if (f.type === 'number') return f.number === null || f.number === undefined ? null : String(f.number);
  if (f.type === 'boolean') return f.boolean ? 'Sim' : null;
  if (f.type === 'date') return f.date?.start ?? null;
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
    month: select(pr[P.month]),
    recMonth: select(pr[P.recMonth]),
    editMonth: select(pr[P.editMonth]),
    designBy: select(pr[P.designBy]),
    postedBy: select(pr[P.postedBy]),
    briefBy: multi(pr[P.briefBy]),
    deadline: formula(pr[P.deadline]),
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

/** Opções que já existem no Calendário mensal, com as cores do Notion. */
export async function planOptions(): Promise<PlanOptions | PlanError> {
  if (!env.planningDb) return 'nao-configurado';
  try {
    return await memo('plan:schema', 300_000, async () => {
      type Opt = { name: string; color?: string };
      const db = (await notion().databases.retrieve({ database_id: env.planningDb! })) as unknown as {
        properties: Record<string, { type: string; select?: { options: Opt[] }; multi_select?: { options: Opt[] }; status?: { options: Opt[] } }>;
      };
      const opts = (name: string): PlanOpt[] => {
        const pr = db.properties[name];
        const list = pr?.select?.options ?? pr?.multi_select?.options ?? pr?.status?.options ?? [];
        return list.map((o) => ({ name: o.name, color: o.color ?? 'default' }));
      };
      const out = {
        client: opts(P.client),
        status: opts(P.status),
        briefBy: opts(P.briefBy),
        ...Object.fromEntries(SELECT_FIELDS.map((f) => [f, opts(P[f])]))
      } as Omit<PlanOptions, 'clients'>;
      return { ...out, clients: out.client.map((o) => o.name) } as PlanOptions;
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

async function assertPlanPage(id: string, allowTrashed = false): Promise<PageObjectResponse> {
  const p = await notion().pages.retrieve({ page_id: id });
  // Só mexe em cards do Calendário mensal; qualquer outra página é recusada.
  if (!isPage(p) || (p.archived && !allowTrashed) || !env.planningDb || !sameId(p.parent.type === 'database_id' ? p.parent.database_id : '', env.planningDb)) {
    throw Object.assign(new Error('Card não encontrado'), { code: 'object_not_found' });
  }
  return p;
}

export async function getPlanItem(id: string, allowTrashed = false): Promise<PlanItem | null> {
  try {
    return toPlan(await assertPlanPage(id, allowTrashed));
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
  month?: string | null;
  recMonth?: string | null;
  editMonth?: string | null;
  designBy?: string | null;
  postedBy?: string | null;
  briefBy?: string[];
  day?: string | null;
  done?: boolean;
}

function patchProps(x: PlanPatch): Record<string, unknown> {
  const pr: Record<string, unknown> = {};
  if (x.title !== undefined) pr[P.title] = titleProp(x.title);
  if (x.status !== undefined) pr[P.status] = { status: { name: x.status } };
  for (const f of SELECT_FIELDS) {
    const v = x[f];
    if (v !== undefined) pr[P[f]] = { select: v ? { name: v } : null };
  }
  if (x.briefBy !== undefined) pr[P.briefBy] = { multi_select: x.briefBy.map((name) => ({ name })) };
  if (x.done !== undefined) pr[P.done] = { checkbox: x.done };
  if (x.day !== undefined) {
    pr[P.date] = { date: x.day ? { start: x.day } : null };
    // Igual ao jeito da Arco: a data já preenche o "Referente ao mês" (se não vier um escolhido).
    if (x.day && x.month === undefined) pr[P.month] = { select: { name: MONTHS[Number(x.day.slice(5, 7)) - 1] } };
  }
  return pr;
}

export async function updatePlanItem(id: string, x: PlanPatch) {
  await assertPlanPage(id);
  await notion().pages.update({ page_id: id, properties: patchProps(x) as never });
  invalidate('plan:');
}

/** Manda o card para a lixeira do Notion (dá para restaurar por 30 dias), ou tira de lá. */
export async function trashPlanItem(id: string, trash = true) {
  await assertPlanPage(id, !trash);
  await notion().pages.update({ page_id: id, archived: trash });
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


// ---------- briefing do card (o texto dentro da página do Notion) ----------

export const BRIEF_FIELDS = ['objetivo', 'legenda', 'referencia', 'imagens'] as const;
export type BriefField = (typeof BRIEF_FIELDS)[number];
const BRIEF_LABEL: Record<BriefField, string> = { objetivo: 'Objetivo', legenda: 'Legenda', referencia: 'Referência', imagens: 'Imagens' };
const LABEL_RE = /^\s*(objetivo|legenda|refer[eê]ncias?|imagens|roteiro|descri[cç][aã]o)\s*[:：–-]\s*/i;
const labelKey = (raw: string): BriefField | 'roteiro' | null => {
  const k = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (k.startsWith('objetivo')) return 'objetivo';
  if (k.startsWith('legenda')) return 'legenda';
  if (k.startsWith('referencia')) return 'referencia';
  if (k.startsWith('imagens')) return 'imagens';
  if (k.startsWith('roteiro') || k.startsWith('descricao')) return 'roteiro';
  return null;
};

export interface PlanBrief {
  objetivo: string;
  legenda: string;
  referencia: string;
  /** Endereços das imagens anexadas (uma por linha). */
  imagens: string;
  roteiro: string;
  /** Campos que têm continuação escrita à mão no Notion: só editáveis lá. */
  locked: BriefField[];
}

type Block = { id: string; type: string; has_children?: boolean; [k: string]: unknown };
const TEXT_TYPES = ['paragraph', 'heading_1', 'heading_2', 'heading_3', 'bulleted_list_item', 'numbered_list_item', 'quote', 'callout', 'to_do', 'toggle'];

function blockText(b: Block): string {
  const v = b[b.type] as { rich_text?: { plain_text: string }[] } | undefined;
  return (v?.rich_text ?? []).map((t) => t.plain_text).join('');
}

async function pageBlocks(pageId: string): Promise<Block[]> {
  const out: Block[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 5; i++) {
    const r = (await notion().blocks.children.list({ block_id: pageId, page_size: 100, start_cursor: cursor })) as unknown as {
      results: Block[]; has_more: boolean; next_cursor: string | null;
    };
    out.push(...r.results);
    if (!r.has_more || !r.next_cursor) break;
    cursor = r.next_cursor;
  }
  return out.filter((b) => TEXT_TYPES.includes(b.type) && !(b as { archived?: boolean }).archived);
}

/** Lê "Objetivo:", "Legenda:", "Referência:" de dentro do card. Sem rótulos, o texto vira roteiro. */
function parseBrief(blocks: Block[]): PlanBrief & { at: Partial<Record<BriefField, { id: string; continued: boolean }>> } {
  const brief: PlanBrief = { objetivo: '', legenda: '', referencia: '', imagens: '', roteiro: '', locked: [] };
  const at: Partial<Record<BriefField, { id: string; continued: boolean }>> = {};
  let cur: BriefField | 'roteiro' = 'roteiro';
  for (const b of blocks) {
    const t = blockText(b);
    const m = t.match(LABEL_RE);
    if (m) {
      cur = labelKey(m[1]) ?? 'roteiro';
      const rest = t.slice(m[0].length);
      if (cur !== 'roteiro') at[cur] = { id: b.id, continued: false };
      brief[cur] = [brief[cur], rest].filter(Boolean).join('\n');
    } else if (t.trim()) {
      if (cur !== 'roteiro' && at[cur]) at[cur]!.continued = true;
      brief[cur] = [brief[cur], t].filter(Boolean).join('\n');
    }
  }
  brief.locked = BRIEF_FIELDS.filter((f) => at[f]?.continued);
  return { ...brief, at };
}

export async function getPlanBrief(id: string): Promise<PlanBrief> {
  await assertPlanPage(id);
  const { at: _at, ...brief } = parseBrief(await pageBlocks(id));
  return brief;
}

const para = (label: string, value: string) => ({
  rich_text: [
    { type: 'text', text: { content: `${label}: ` }, annotations: { bold: true } },
    { type: 'text', text: { content: value.slice(0, 1900) } }
  ]
});

/**
 * Grava um campo do briefing dentro do card: atualiza a linha "Rótulo: …" que já existe
 * ou acrescenta uma nova no fim. Nunca apaga blocos do Notion.
 */
export async function setPlanBrief(id: string, field: BriefField, value: string) {
  await assertPlanPage(id);
  const parsed = parseBrief(await pageBlocks(id));
  if (parsed.locked.includes(field)) throw Object.assign(new Error('Este texto foi escrito em várias linhas no Notion: edite por lá.'), { code: 'locked' });
  const existing = parsed.at[field];
  const label = BRIEF_LABEL[field];
  if (existing) {
    await notion().blocks.update({ block_id: existing.id, paragraph: para(label, value) } as never);
  } else if (value.trim()) {
    await notion().blocks.children.append({ block_id: id, children: [{ object: 'block', type: 'paragraph', paragraph: para(label, value) }] } as never);
  }
  invalidate(`plan:brief:${id}`);
}

export interface ReportItem extends PlanItem, Omit<PlanBrief, 'locked'> {}

/** Itens com data no mês, já com o briefing, para o relatório do cliente. */
export async function planningReport(cal: string, fromDay: string, toDay: string): Promise<ReportItem[] | PlanError> {
  const items = await listPlanning(cal, fromDay, toDay);
  if (typeof items === 'string') return items;
  const dated = items.filter((i) => i.day).sort((a, b) => `${a.day}${a.time ?? ''}`.localeCompare(`${b.day}${b.time ?? ''}`));
  const briefs = await Promise.all(
    dated.map((i) =>
      memo(`plan:brief:${i.id}`, 30_000, () => pageBlocks(i.id).then((b) => parseBrief(b))).catch(() => null)
    )
  );
  return dated.map((i, n) => {
    const b = briefs[n];
    return { ...i, objetivo: b?.objetivo ?? '', legenda: b?.legenda ?? '', referencia: b?.referencia ?? '', imagens: b?.imagens ?? '', roteiro: b?.roteiro ?? '' };
  });
}

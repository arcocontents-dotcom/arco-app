import 'server-only';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import schema from './schema.json';
import { env } from './env';
import { invalidate } from './cache';
import { MONTHS } from './domain';
import { isPage, listClients, normId, notion, queryAll, select, text, titleProp } from './notion';
import { planOptions } from './planning';
import type { Produto } from './produtos';

// Tudo em um: captação, tasks da Produção e Planejamento (Calendário mensal) ligados.
// - Produtos de uma captação viram cards no Planejamento do cliente (um por unidade), para roteiro/bastidor.
// - Task de edição/roteiro/postagem de um cliente da agência fica ligada a um card do Planejamento
//   (escolhido ou criado pendente) — o fluxo segue: planejar → editar → aprovar.
// Só usa opções que já existem no Calendário mensal; nunca cria propriedade nem apaga nada.

const P = schema.planning;
const EDITOR: Record<string, string> = { Rafa: 'Rafael' };
const monthOf = (day: string) => MONTHS[Number(day.slice(5, 7)) - 1];

/** Nome do cliente no app → nome no Calendário mensal (só cliente da agência). */
export async function calNameOf(client: string): Promise<string | null> {
  if (!client || /^(Freelancer|Casamento) · /.test(client)) return null;
  const c = (await listClients()).find((x) => x.name === client);
  const opts = await planOptions();
  if (typeof opts === 'string') return null;
  const want = c?.calName || client;
  return opts.clients.includes(want) ? want : null;
}

/** "Reels" → base da opção de "Tipo de demanda" (Reels N, Post N, Storys N, Fotos). */
function baseOf(product: string): string | null {
  const s = product.toLowerCase();
  if (s.includes('reels') || s.includes('víd') || s.includes('vid')) return 'Reels';
  if (s.includes('stor')) return 'Storys';
  if (s.includes('foto')) return 'Fotos';
  if (s.includes('post') || s.includes('carross')) return 'Post';
  return null;
}

/** Próxima opção livre do tipo no mês do cliente (Reels 1, Reels 2…). */
async function nextKind(cal: string, month: string, base: string | null, taken: Map<string, number>): Promise<string | null> {
  if (!base) return null;
  const opts = await planOptions();
  if (typeof opts === 'string') return null;
  const names = opts.kind.map((o) => o.name);
  if (base === 'Fotos') return names.includes('Fotos') ? 'Fotos' : null;
  const key = `${cal}|${month}|${base}`;
  if (!taken.has(key)) {
    const pages = await queryAll(env.planningDb!, {
      filter: { and: [{ property: P.client, select: { equals: cal } }, { property: P.month, select: { equals: month } }] }
    }).catch(() => [] as PageObjectResponse[]);
    const used = pages.filter((p) => !p.archived).map((p) => select(p.properties[P.kind]) ?? '').filter((k) => k.startsWith(`${base} `));
    taken.set(key, used.length);
  }
  const n = taken.get(key)! + 1;
  taken.set(key, n);
  const numbered = names.filter((x) => new RegExp(`^${base} \\d+$`).test(x));
  return names.includes(`${base} ${n}`) ? `${base} ${n}` : numbered[numbered.length - 1] ?? null;
}

async function opt(field: 'note' | 'month' | 'recMonth' | 'editMonth' | 'designBy', name: string | null): Promise<string | null> {
  if (!name) return null;
  const opts = await planOptions();
  return typeof opts !== 'string' && opts[field].some((o) => o.name === name) ? name : null;
}

async function briefByOpts(crew: string[]): Promise<string[]> {
  const opts = await planOptions();
  if (typeof opts === 'string') return [];
  return crew.map((c) => EDITOR[c] ?? c).filter((c) => opts.briefBy.some((o) => o.name === c));
}

async function createCard(x: {
  cal: string; title: string; status: 'Ideia' | 'Realizando'; kind: string | null; month: string;
  recMonth?: string | null; note?: string | null; briefBy?: string[]; body: string[];
}): Promise<string> {
  const props: Record<string, unknown> = {
    [P.title]: titleProp(x.title),
    [P.client]: { select: { name: x.cal } },
    [P.status]: { status: { name: x.status } }
  };
  if (x.kind) props[P.kind] = { select: { name: x.kind } };
  const month = await opt('month', x.month);
  if (month) props[P.month] = { select: { name: month } };
  const rec = await opt('recMonth', x.recMonth ?? null);
  if (rec) props[P.recMonth] = { select: { name: rec } };
  const note = await opt('note', x.note ?? null);
  if (note) props[P.note] = { select: { name: note } };
  if (x.briefBy?.length) props[P.briefBy] = { multi_select: x.briefBy.map((name) => ({ name })) };
  const page = await notion().pages.create({ parent: { database_id: env.planningDb! }, properties: props as never });
  const body = x.body.filter(Boolean);
  if (body.length) {
    await notion().blocks.children.append({
      block_id: page.id,
      children: body.map((t) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: t.slice(0, 1900) } }] } }))
    } as never).catch(() => undefined);
  }
  return page.id;
}

const relIds = (p: PageObjectResponse, prop: string): string[] => {
  const r = p.properties[prop];
  return r?.type === 'relation' ? r.relation.map((x) => x.id) : [];
};

/**
 * Captação → Planejamento: cria no Calendário mensal do cliente um card por unidade de cada produto
 * (Reels ×2 → 2 cards) que ainda não foi criado. Nunca apaga: se diminuir, os cards ficam.
 */
export async function linkShootToPlanning(shootId: string, x: {
  title: string; day: string; time: string | null; client: string; crew: string[]; products: Produto[]; status: string; place: string; note: string;
}): Promise<number> {
  if (!env.planningDb || !x.products.length) return 0;
  const cal = await calNameOf(x.client);
  if (!cal) return 0;
  const shoot = await notion().pages.retrieve({ page_id: shootId });
  if (!isPage(shoot)) return 0;
  const linked = relIds(shoot, schema.shoot.contents);
  // quantos de cada produto já existem (pelo começo do título: "Reels 1 · …")
  const have = new Map<string, number>();
  const live: string[] = [];
  for (const id of linked) {
    const p = await notion().pages.retrieve({ page_id: id }).catch(() => null);
    if (!p || !isPage(p) || p.archived) continue;
    live.push(p.id);
    const t = text(p.properties[P.title]);
    const prod = x.products.find((pr) => t.toLowerCase().startsWith(`${pr.name.toLowerCase()} `));
    if (prod) have.set(prod.name, (have.get(prod.name) ?? 0) + 1);
  }
  const month = monthOf(x.day);
  const briefBy = await briefByOpts(x.crew);
  const taken = new Map<string, number>();
  const created: string[] = [];
  const when = `${x.day.slice(8, 10)}/${x.day.slice(5, 7)}${x.time ? ` às ${x.time}` : ''}`;
  for (const pr of x.products) {
    for (let i = (have.get(pr.name) ?? 0) + 1; i <= pr.qty; i++) {
      const id = await createCard({
        cal,
        title: `${pr.name} ${i} · ${x.title}`,
        status: 'Ideia',
        kind: await nextKind(cal, month, baseOf(pr.name), taken),
        month,
        recMonth: x.status === 'Realizada' ? month : null,
        note: x.status === 'Realizada' ? 'Falta edição' : 'Falta captação',
        briefBy,
        body: [
          `📸 Captação: ${x.title} — ${when}${x.place ? ` · ${x.place}` : ''}`,
          `Produto: ${pr.name} (${i} de ${pr.qty}). Complete aqui o roteiro, a referência e a legenda.`,
          x.note ? `Da captação: ${x.note}` : ''
        ]
      });
      created.push(id);
    }
  }
  if (created.length) {
    await notion().pages.update({ page_id: shootId, properties: { [schema.shoot.contents]: { relation: [...live, ...created].map((id) => ({ id })) } } as never });
    invalidate('plan:');
    invalidate('prod:');
  }
  return created.length;
}

/** Captação realizada: os cards dela que esperavam a captação passam para "Falta edição" e ganham "Gravado quando". */
export async function shootDoneOnPlanning(shootId: string, today: string) {
  if (!env.planningDb) return;
  const shoot = await notion().pages.retrieve({ page_id: shootId });
  if (!isPage(shoot)) return;
  const d = shoot.properties[schema.shoot.date];
  const day = (d?.type === 'date' ? d.date?.start?.slice(0, 10) : null) ?? today;
  const month = await opt('recMonth', monthOf(day));
  const next = await opt('note', 'Falta edição');
  for (const id of relIds(shoot, schema.shoot.contents)) {
    const p = await notion().pages.retrieve({ page_id: id }).catch(() => null);
    if (!p || !isPage(p) || p.archived) continue;
    const props: Record<string, unknown> = {};
    if (select(p.properties[P.note]) === 'Falta captação' && next) props[P.note] = { select: { name: next } };
    if (!select(p.properties[P.recMonth]) && month) props[P.recMonth] = { select: { name: month } };
    if (Object.keys(props).length) await notion().pages.update({ page_id: id, properties: props as never });
  }
  invalidate('plan:');
}

export interface OpenCard {
  id: string;
  title: string;
  kind: string | null;
  note: string | null;
}

/** Cards abertos do cliente no Planejamento (para ligar uma task a um conteúdo que já existe). */
export async function openCards(client: string): Promise<OpenCard[]> {
  const cal = await calNameOf(client);
  if (!cal || !env.planningDb) return [];
  const pages = await queryAll(env.planningDb, {
    filter: { and: [{ property: P.client, select: { equals: cal } }, { property: P.status, status: { does_not_equal: 'Postado' } }] },
    sorts: [{ timestamp: 'created_time', direction: 'descending' }]
  });
  return pages
    .filter((p) => !p.archived && !(p.properties[P.done]?.type === 'checkbox' && (p.properties[P.done] as { checkbox: boolean }).checkbox))
    .slice(0, 60)
    .map((p) => ({ id: p.id, title: text(p.properties[P.title]) || 'Sem título', kind: select(p.properties[P.kind]), note: select(p.properties[P.note]) }));
}

const TASK_KIND: Record<string, string> = { 'Editar reels': 'Reels', 'Editar post': 'Post', 'Editar story': 'Storys', 'Editar foto': 'Fotos' };
const TASK_NOTE: Record<string, string> = { 'Fazer roteiro': 'Falta copy', Postar: 'Aprovação post' };

/** Formatos de task que pertencem a um conteúdo do Planejamento. */
export const LINKABLE = ['Editar reels', 'Editar post', 'Editar story', 'Editar foto', 'Fazer roteiro', 'Postar'];

/**
 * Task → Planejamento: liga a task a um card. Se não escolheu um, cria o card pendente
 * ("Falta edição"/"Falta copy") para completar depois no Planejamento.
 */
export async function linkTaskToPlanning(routineId: string, x: { title: string; client: string; format: string | null; date: string | null; desc: string; person: string }, chosen: string | null | 'novo'): Promise<string | null> {
  if (!env.planningDb || !x.format || !LINKABLE.includes(x.format)) return null;
  const cal = await calNameOf(x.client);
  if (!cal) return null;
  let cardId: string | null = null;
  if (chosen && chosen !== 'novo') {
    const p = await notion().pages.retrieve({ page_id: chosen }).catch(() => null);
    if (p && isPage(p) && normId(p.parent.type === 'database_id' ? p.parent.database_id : '') === normId(env.planningDb)) cardId = p.id;
  }
  if (!cardId) {
    const day = x.date ?? new Date().toISOString().slice(0, 10);
    const month = monthOf(day);
    cardId = await createCard({
      cal,
      title: x.title,
      status: x.format.startsWith('Editar') ? 'Realizando' : 'Ideia',
      kind: await nextKind(cal, month, TASK_KIND[x.format] ?? null, new Map()),
      month,
      note: TASK_NOTE[x.format] ?? 'Falta edição',
      body: [`🛠 Criado pela task da Produção (${x.format} · ${x.person}). Complete as informações do conteúdo aqui.`, x.desc]
    });
  }
  await notion().pages.update({ page_id: routineId, properties: { [schema.routine.content]: { relation: [{ id: cardId }] } } as never });
  invalidate('plan:');
  invalidate('prod:');
  return cardId;
}

/** Task de edição feita: registra no card quem editou e quando, e ele segue para aprovação. */
export async function taskDoneOnPlanning(cardId: string, format: string | null, person: string, day: string) {
  if (!env.planningDb || !format) return;
  const props: Record<string, unknown> = {};
  if (format.startsWith('Editar')) {
    const by = await opt('designBy', EDITOR[person] ?? person);
    const m = await opt('editMonth', monthOf(day));
    if (by) props[P.designBy] = { select: { name: by } };
    if (m) props[P.editMonth] = { select: { name: m } };
    const n = await opt('note', 'Aprovação post');
    if (n) props[P.note] = { select: { name: n } };
  } else if (format === 'Fazer roteiro') {
    const n = await opt('note', 'Aprovação briefing');
    if (n) props[P.note] = { select: { name: n } };
  }
  if (Object.keys(props).length) {
    await notion().pages.update({ page_id: cardId, properties: props as never });
    invalidate('plan:');
  }
}

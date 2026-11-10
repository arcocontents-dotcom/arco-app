import 'server-only';
import { Client as NotionClient } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { memo, invalidate } from './cache';
import schema from './schema.json';
import { env } from './env';
import {
  type ContentType,
  type Decision,
  type GeneralStatus,
  type ItemKey,
  type ItemState,
  CONTENT_TYPES,
  ITEM_KEYS,
  addDays,
  chunk,
  generalStatus,
  itemsFor,
  localParts,
  parseEmails
} from './domain';

const C = schema.clients;
const K = schema.contents;

let _client: NotionClient | null = null;
function notion() {
  if (!_client)
    _client = new NotionClient({
      auth: env.notionToken,
      notionVersion: '2022-06-28',
      fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
      // Só para testes automatizados locais (servidor falso do Notion).
      ...(process.env.NOTION_BASE_URL ? { baseUrl: process.env.NOTION_BASE_URL } : {})
    });
  return _client;
}

// ---------------- tipos ----------------

export interface ClientRecord {
  id: string;
  name: string;
  approvers: string[];
  viewers: string[];
  instagram: string;
  igConnected: boolean;
}

export interface ContentRecord {
  id: string;
  clientId: string | null;
  title: string;
  dateIso: string | null;
  day: string | null;
  time: string | null;
  type: ContentType;
  status: GeneralStatus;
  videoUrl: string | null;
  videoUid: string | null;
  coverUrl: string | null;
  artUrls: string[];
  storyImageUrl: string | null;
  caption: string;
  items: Record<ItemKey, ItemState>;
  answeredBy: string | null;
  answeredAt: string | null;
  postedAt: string | null;
}

// ---------------- leitura de propriedades ----------------

type Props = PageObjectResponse['properties'];
type Prop = Props[string];

function text(p: Prop | undefined): string {
  if (!p) return '';
  if (p.type === 'title') return p.title.map((t) => t.plain_text).join('');
  if (p.type === 'rich_text') return p.rich_text.map((t) => t.plain_text).join('');
  if (p.type === 'email') return p.email ?? '';
  if (p.type === 'url') return p.url ?? '';
  return '';
}
function select(p: Prop | undefined): string | null {
  return p && p.type === 'select' ? p.select?.name ?? null : null;
}
function checkbox(p: Prop | undefined): boolean {
  return !!(p && p.type === 'checkbox' && p.checkbox);
}
function url(p: Prop | undefined): string | null {
  return p && p.type === 'url' && p.url ? p.url : null;
}
function date(p: Prop | undefined): string | null {
  return p && p.type === 'date' ? p.date?.start ?? null : null;
}
function relationFirst(p: Prop | undefined): string | null {
  return p && p.type === 'relation' && p.relation.length ? p.relation[0].id : null;
}
function files(p: Prop | undefined): string[] {
  if (!p || p.type !== 'files') return [];
  return p.files.map((f) => ('external' in f ? f.external.url : f.file.url));
}

export function streamUid(u: string | null): string | null {
  if (!u || !/cloudflarestream\.com|videodelivery\.net/.test(u)) return null;
  const m = u.match(/([a-f0-9]{32})/i);
  return m ? m[1].toLowerCase() : null;
}

function normId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}
export function sameId(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && normId(a) === normId(b);
}

function isPage(x: unknown): x is PageObjectResponse {
  return !!x && typeof x === 'object' && (x as { object?: string }).object === 'page' && 'properties' in (x as object);
}

function toClient(p: PageObjectResponse): ClientRecord {
  const pr = p.properties;
  return {
    id: p.id,
    name: text(pr[C.name]) || 'Sem nome',
    approvers: parseEmails(text(pr[C.approvers])),
    viewers: parseEmails(text(pr[C.viewers])),
    instagram: text(pr[C.instagram]).replace(/^@/, ''),
    igConnected: checkbox(pr[C.igConnected])
  };
}

function toContent(p: PageObjectResponse): ContentRecord {
  const pr = p.properties;
  const typeRaw = select(pr[K.type]);
  const type = (CONTENT_TYPES as readonly string[]).includes(typeRaw ?? '') ? (typeRaw as ContentType) : 'Post';
  const items = {} as Record<ItemKey, ItemState>;
  for (const k of ITEM_KEYS) {
    const s = select(pr[K.itemStatus[k]]);
    items[k] = {
      status: s === 'Aprovado' || s === 'Ajuste' || s === 'Reprovado' ? s : 'Pendente',
      note: text(pr[K.itemNote[k]])
    };
  }
  const iso = date(pr[K.date]);
  const parts = iso ? localParts(iso, env.timeZone) : null;
  const statusRaw = select(pr[K.status]) as GeneralStatus | null;
  const videoUrl = url(pr[K.video]);
  return {
    id: p.id,
    clientId: relationFirst(pr[K.client]),
    title: text(pr[K.title]) || 'Sem título',
    dateIso: iso,
    day: parts?.day ?? null,
    time: parts?.time ?? null,
    type,
    status: statusRaw ?? 'Rascunho',
    videoUrl,
    videoUid: streamUid(videoUrl),
    coverUrl: url(pr[K.cover]),
    artUrls: files(pr[K.arts]),
    storyImageUrl: url(pr[K.storyImage]),
    caption: text(pr[K.caption]),
    items,
    answeredBy: text(pr[K.answeredBy]) || null,
    answeredAt: date(pr[K.answeredAt]),
    postedAt: date(pr[K.postedAt])
  };
}

async function queryAll(database_id: string, body: Record<string, unknown>): Promise<PageObjectResponse[]> {
  const out: PageObjectResponse[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion().databases.query({
      database_id,
      page_size: 100,
      start_cursor: cursor,
      ...body
    } as Parameters<NotionClient['databases']['query']>[0]);
    for (const r of res.results) if (isPage(r)) out.push(r);
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);
  return out;
}

const rich = (s: string) => ({ rich_text: chunk(s).map((c) => ({ type: 'text' as const, text: { content: c } })) });
const titleProp = (s: string) => ({ title: [{ type: 'text' as const, text: { content: s.slice(0, 1900) } }] });

// ---------------- clientes ----------------

export function listClients(): Promise<ClientRecord[]> {
  return memo('clients', 15_000, async () => {
    const pages = await queryAll(env.clientsDb, { sorts: [{ property: C.name, direction: 'ascending' }] });
    return pages.filter((p) => !p.archived).map(toClient);
  });
}

export async function getClient(id: string): Promise<ClientRecord | null> {
  const all = await listClients();
  return all.find((c) => sameId(c.id, id)) ?? null;
}

/** Leitura sem cache, usada logo antes de decisões de segurança. */
export async function getClientFresh(id: string): Promise<ClientRecord | null> {
  try {
    const p = await notion().pages.retrieve({ page_id: id });
    if (!isPage(p) || p.archived || !sameId(p.parent.type === 'database_id' ? p.parent.database_id : '', env.clientsDb)) return null;
    return toClient(p);
  } catch {
    return null;
  }
}

export async function getClientInstagramSecrets(id: string): Promise<{ userId: string; token: string; expires: string | null } | null> {
  const p = await notion().pages.retrieve({ page_id: id });
  if (!isPage(p)) return null;
  const token = text(p.properties[C.igToken]);
  const userId = text(p.properties[C.igUserId]);
  if (!token || !userId) return null;
  return { userId, token, expires: date(p.properties[C.igTokenExpires]) };
}

export async function createClient(input: { name: string; instagram: string }): Promise<string> {
  const page = await notion().pages.create({
    parent: { database_id: env.clientsDb },
    properties: {
      [C.name]: titleProp(input.name),
      [C.instagram]: rich(input.instagram.replace(/^@/, ''))
    }
  });
  invalidate('clients');
  return page.id;
}

export async function updateClient(id: string, input: { name?: string; instagram?: string; approvers?: string[]; viewers?: string[] }) {
  const properties: Record<string, unknown> = {};
  if (input.name !== undefined) properties[C.name] = titleProp(input.name);
  if (input.instagram !== undefined) properties[C.instagram] = rich(input.instagram.replace(/^@/, ''));
  if (input.approvers) properties[C.approvers] = rich(input.approvers.join(', '));
  if (input.viewers) properties[C.viewers] = rich(input.viewers.join(', '));
  await notion().pages.update({ page_id: id, properties: properties as never });
  invalidate('clients');
}

export async function setClientInstagram(
  id: string,
  ig: { userId: string; username: string; encToken: string; expires: string } | null
) {
  const properties: Record<string, unknown> = ig
    ? {
        [C.igConnected]: { checkbox: true },
        [C.igUserId]: rich(ig.userId),
        [C.igToken]: rich(ig.encToken),
        [C.igTokenExpires]: { date: { start: ig.expires } },
        ...(ig.username ? { [C.instagram]: rich(ig.username) } : {})
      }
    : {
        [C.igConnected]: { checkbox: false },
        [C.igUserId]: rich(''),
        [C.igToken]: rich(''),
        [C.igTokenExpires]: { date: null }
      };
  await notion().pages.update({ page_id: id, properties: properties as never });
  invalidate('clients');
  invalidate(`ig:${normId(id)}`);
}

export async function listClientsWithInstagram(): Promise<{ id: string; expires: string | null }[]> {
  const pages = await queryAll(env.clientsDb, { filter: { property: C.igConnected, checkbox: { equals: true } } });
  return pages.map((p) => ({ id: p.id, expires: date(p.properties[C.igTokenExpires]) }));
}

// ---------------- conteúdos ----------------

const contentsTag = (clientId: string) => `contents:${normId(clientId)}:`;

export function listContentsInRange(clientId: string, fromDay: string, toDay: string): Promise<ContentRecord[]> {
  return memo(contentsTag(clientId) + 'contents-range:' + fromDay + ':' + toDay, 30000, async () => {
      const pages = await queryAll(env.contentsDb, {
        filter: {
          and: [
            { property: K.client, relation: { contains: clientId } },
            { property: K.date, date: { on_or_after: addDays(fromDay, -1) } },
            { property: K.date, date: { on_or_before: addDays(toDay, 1) } }
          ]
        },
        sorts: [{ property: K.date, direction: 'ascending' }]
      });
      return pages
        .filter((p) => !p.archived)
        .map(toContent)
        .filter((c) => c.day && c.day >= fromDay && c.day <= toDay && c.status !== 'Rascunho');
    });
}

/** Para o painel admin: inclui rascunhos. */
export function listContentsInRangeAdmin(clientId: string, fromDay: string, toDay: string): Promise<ContentRecord[]> {
  return memo(contentsTag(clientId) + 'contents-range-admin:' + fromDay + ':' + toDay, 30000, async () => {
      const pages = await queryAll(env.contentsDb, {
        filter: {
          and: [
            { property: K.client, relation: { contains: clientId } },
            { property: K.date, date: { on_or_after: addDays(fromDay, -1) } },
            { property: K.date, date: { on_or_before: addDays(toDay, 1) } }
          ]
        },
        sorts: [{ property: K.date, direction: 'ascending' }]
      });
      return pages.filter((p) => !p.archived).map(toContent).filter((c) => c.day && c.day >= fromDay && c.day <= toDay);
    });
}

export function listOpenContents(clientId: string): Promise<ContentRecord[]> {
  return memo(contentsTag(clientId) + 'contents-open', 30000, async () => {
      const pages = await queryAll(env.contentsDb, {
        filter: {
          and: [
            { property: K.client, relation: { contains: clientId } },
            { property: K.status, select: { does_not_equal: 'Postado' } },
            { property: K.status, select: { does_not_equal: 'Rascunho' } },
            { property: K.status, select: { is_not_empty: true } }
          ]
        },
        sorts: [{ property: K.date, direction: 'ascending' }]
      });
      return pages.filter((p) => !p.archived).map(toContent);
    });
}

export async function getContentFresh(id: string): Promise<ContentRecord | null> {
  try {
    const p = await notion().pages.retrieve({ page_id: id });
    if (!isPage(p) || p.archived) return null;
    if (!sameId(p.parent.type === 'database_id' ? p.parent.database_id : '', env.contentsDb)) return null;
    return toContent(p);
  } catch {
    return null;
  }
}

export interface ContentInput {
  clientId: string;
  title: string;
  day: string;
  time: string | null;
  type: ContentType;
  caption: string;
  videoUrl: string | null;
  coverUrl: string | null;
  artUrls: string[];
  storyImageUrl: string | null;
  status: GeneralStatus;
  resetApprovals: boolean;
}

function contentProps(input: ContentInput): Record<string, unknown> {
  const start = input.time ? `${input.day}T${input.time}:00` : input.day;
  const props: Record<string, unknown> = {
    [K.title]: titleProp(input.title),
    [K.client]: { relation: [{ id: input.clientId }] },
    [K.date]: { date: input.time ? { start, time_zone: env.timeZone } : { start } },
    [K.type]: { select: { name: input.type } },
    [K.status]: { select: { name: input.status } },
    [K.caption]: rich(input.caption),
    [K.video]: { url: input.videoUrl || null },
    [K.cover]: { url: input.coverUrl || null },
    [K.storyImage]: { url: input.storyImageUrl || null },
    [K.arts]: {
      files: input.artUrls.map((u, i) => ({ name: `Arte ${i + 1}`, type: 'external', external: { url: u } }))
    }
  };
  if (input.resetApprovals) {
    for (const k of ITEM_KEYS) {
      props[K.itemStatus[k]] = { select: { name: 'Pendente' } };
      props[K.itemNote[k]] = rich('');
    }
    props[K.answeredBy] = { email: null };
    props[K.answeredAt] = { date: null };
  }
  return props;
}

export async function createContent(input: ContentInput): Promise<string> {
  const page = await notion().pages.create({
    parent: { database_id: env.contentsDb },
    properties: contentProps({ ...input, resetApprovals: true }) as never
  });
  invalidate(contentsTag(input.clientId));
  return page.id;
}

export async function updateContent(id: string, input: ContentInput, previousClientId: string | null) {
  await notion().pages.update({ page_id: id, properties: contentProps(input) as never });
  invalidate(contentsTag(input.clientId));
  if (previousClientId && !sameId(previousClientId, input.clientId)) invalidate(contentsTag(previousClientId));
}

export async function archiveContent(id: string, clientId: string | null) {
  await notion().pages.update({ page_id: id, archived: true });
  if (clientId) invalidate(contentsTag(clientId));
}

export async function saveDecisions(content: ContentRecord, decisions: Record<string, Decision>, email: string) {
  const keys = itemsFor(content.type);
  const items: Partial<Record<ItemKey, ItemState>> = {};
  const properties: Record<string, unknown> = {};
  for (const k of keys) {
    const d = decisions[k];
    items[k] = { status: d.status, note: d.status === 'Aprovado' ? '' : d.note.trim() };
    properties[K.itemStatus[k]] = { select: { name: d.status } };
    properties[K.itemNote[k]] = rich(items[k]!.note);
  }
  properties[K.status] = { select: { name: generalStatus(content.type, items) } };
  properties[K.answeredBy] = { email };
  properties[K.answeredAt] = { date: { start: new Date().toISOString() } };
  await notion().pages.update({ page_id: content.id, properties: properties as never });
  if (content.clientId) invalidate(contentsTag(content.clientId));
}

export async function setPosted(content: ContentRecord, posted: boolean) {
  const items: Partial<Record<ItemKey, ItemState>> = content.items;
  const properties: Record<string, unknown> = {
    [K.status]: { select: { name: posted ? 'Postado' : generalStatus(content.type, items) } },
    [K.postedAt]: { date: posted ? { start: new Date().toISOString() } : null }
  };
  await notion().pages.update({ page_id: content.id, properties: properties as never });
  if (content.clientId) invalidate(contentsTag(content.clientId));
}

export function listPostedContents(clientId: string): Promise<ContentRecord[]> {
  return memo(contentsTag(clientId) + 'contents-posted', 60000, async () => {
      const res = await notion().databases.query({
        database_id: env.contentsDb,
        page_size: 30,
        filter: {
          and: [
            { property: K.client, relation: { contains: clientId } },
            { property: K.status, select: { equals: 'Postado' } }
          ]
        },
        sorts: [{ property: K.date, direction: 'descending' }]
      });
      return res.results.filter(isPage).filter((p) => !p.archived).map(toContent);
    });
}

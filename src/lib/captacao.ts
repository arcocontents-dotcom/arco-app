import 'server-only';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import schema from './schema.json';
import { env } from './env';
import { invalidate, memo } from './cache';
import { localParts } from './domain';
import { isPage, normId, notion, queryAll, select, text, titleProp } from './notion';
import { multi } from './planning';
import { produtosToText, textToProdutos, type Produto } from './produtos';
import { creatorOf } from './historico';

// 📸 Captações: calendário de gravação da agência.
// Fica numa tabela do app no Notion (aparece no Notion Calendar) e na aba Captação do site.

const S = schema.shoot;
export const CREW = ['Lemuel', 'Marcos', 'Yan', 'Rafa'] as const;
export type CrewMember = (typeof CREW)[number];
export const SHOOT_TYPES = ['Vídeo', 'Foto', 'Vídeo e foto'] as const;
export type ShootType = (typeof SHOOT_TYPES)[number];
export const SHOOT_STATUS = ['Agendada', 'Realizada', 'Cancelada'] as const;
export type ShootStatus = (typeof SHOOT_STATUS)[number];

export interface Shoot {
  id: string;
  title: string;
  day: string;
  time: string | null;
  endTime: string | null;
  client: string;
  crew: CrewMember[];
  type: ShootType | null;
  status: ShootStatus;
  place: string;
  note: string;
  /** O que vai ser feito: Reels ×2, Story ×2… */
  products: Produto[];
  /** Quem agendou e editou (mais novo em cima). */
  history: string;
  /** Quem agendou pelo app e quando a captação foi criada. */
  scheduledBy: string | null;
  createdAt: string;
  url: string;
}

export const shootsConfigured = () => !!env.shootsDb;

function toShoot(p: PageObjectResponse): Shoot | null {
  const pr = p.properties;
  const d = pr[S.date];
  const start = d?.type === 'date' ? d.date?.start ?? null : null;
  if (!start) return null;
  const end = d?.type === 'date' ? d.date?.end ?? null : null;
  const a = localParts(start, env.timeZone);
  const b = end ? localParts(end, env.timeZone) : null;
  const type = select(pr[S.type]);
  const status = select(pr[S.status]);
  return {
    id: p.id,
    title: text(pr[S.title]) || 'Captação',
    day: a.day,
    time: a.time,
    endTime: b?.time ?? null,
    client: text(pr[S.client]),
    crew: multi(pr[S.crew]).filter((x): x is CrewMember => (CREW as readonly string[]).includes(x)),
    type: (SHOOT_TYPES as readonly string[]).includes(type ?? '') ? (type as ShootType) : null,
    status: (SHOOT_STATUS as readonly string[]).includes(status ?? '') ? (status as ShootStatus) : 'Agendada',
    place: text(pr[S.place]),
    note: text(pr[S.note]),
    products: textToProdutos(text(pr[S.products])),
    history: text(pr[S.history]),
    scheduledBy: creatorOf(text(pr[S.history])),
    createdAt: p.created_time.slice(0, 10),
    url: `https://www.notion.so/${normId(p.id)}`
  };
}

/** Captações entre duas datas (inclusive), em ordem de dia e horário. */
export function listShoots(from: string, to: string): Promise<Shoot[]> {
  if (!env.shootsDb) return Promise.resolve([]);
  return memo(`prod:shoots:${from}:${to}`, 15_000, async () => {
    const pages = await queryAll(env.shootsDb!, {
      filter: { and: [{ property: S.date, date: { on_or_after: from } }, { property: S.date, date: { on_or_before: `${to}T23:59:59` } }] },
      sorts: [{ property: S.date, direction: 'ascending' }]
    });
    return pages
      .filter((p) => isPage(p) && !p.archived)
      .map((p) => toShoot(p as PageObjectResponse))
      .filter((x): x is Shoot => !!x)
      .sort((x, y) => (x.day + (x.time ?? '')).localeCompare(y.day + (y.time ?? '')));
  });
}

/** "2026-11-18" + "09:00" no fuso da agência → ISO com o deslocamento certo. */
function zoned(day: string, time: string): string {
  const guess = new Date(`${day}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: env.timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(guess);
  const g = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  const asLocal = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'));
  const offMin = Math.round((asLocal - guess.getTime()) / 60_000);
  const sign = offMin >= 0 ? '+' : '-';
  const abs = Math.abs(offMin);
  return `${day}T${time}:00${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export interface ShootInput {
  title: string;
  day: string;
  time: string | null;
  endTime: string | null;
  client: string;
  crew: CrewMember[];
  type: ShootType | null;
  status: ShootStatus;
  place: string;
  note: string;
  products: Produto[];
}

function shootProps(x: ShootInput) {
  const rich = (v: string) => ({ rich_text: v ? [{ text: { content: v.slice(0, 1900) } }] : [] });
  const date = x.time
    ? { start: zoned(x.day, x.time), end: x.endTime && x.endTime > x.time ? zoned(x.day, x.endTime) : null }
    : { start: x.day };
  return {
    [S.title]: titleProp(x.title),
    [S.date]: { date },
    [S.client]: rich(x.client),
    [S.crew]: { multi_select: x.crew.map((name) => ({ name })) },
    [S.type]: { select: x.type ? { name: x.type } : null },
    [S.status]: { select: { name: x.status } },
    [S.place]: rich(x.place),
    [S.note]: rich(x.note),
    [S.products]: rich(produtosToText(x.products))
  };
}

async function shootPage(id: string) {
  const p = await notion().pages.retrieve({ page_id: id });
  if (!isPage(p) || !env.shootsDb || normId(p.parent.type === 'database_id' ? p.parent.database_id : '') !== normId(env.shootsDb)) {
    throw Object.assign(new Error('Captação não encontrada'), { code: 'object_not_found' });
  }
  return p;
}

export async function createShoot(x: ShootInput): Promise<string> {
  if (!env.shootsDb) throw new Error('Tabela de captações não configurada');
  const p = await notion().pages.create({ parent: { database_id: env.shootsDb }, properties: shootProps(x) as never });
  invalidate('prod:');
  return p.id;
}

export async function updateShoot(id: string, x: ShootInput): Promise<Shoot | null> {
  const before = toShoot(await shootPage(id));
  await notion().pages.update({ page_id: id, properties: shootProps(x) as never });
  invalidate('prod:');
  return before;
}

export async function setShootStatus(id: string, status: ShootStatus) {
  await shootPage(id);
  await notion().pages.update({ page_id: id, properties: { [S.status]: { select: { name: status } } } as never });
  invalidate('prod:');
}

/** Apagar: vai para a lixeira do Notion (30 dias para restaurar). */
export async function trashShoot(id: string) {
  await shootPage(id);
  await notion().pages.update({ page_id: id, archived: true });
  invalidate('prod:');
}

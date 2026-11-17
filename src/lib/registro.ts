import 'server-only';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { env } from './env';
import { date, isPage, notion, select, text, titleProp } from './notion';

// "📜 Registro do app": cada ação feita no app vira uma linha (quem, quando, área, item, detalhe).

export const AREAS = ['Planejamento', 'Aprovação', 'Produção', 'Captação', 'Financeiro', 'Clientes', 'Acessos'] as const;
export type Area = (typeof AREAS)[number];

export interface Activity {
  id: string;
  action: string;
  who: string;
  area: Area | null;
  item: string;
  itemId: string;
  when: string;
  detail: string;
}

const rich = (v: string) => ({ rich_text: v ? [{ text: { content: v.slice(0, 1900) } }] : [] });

/** Grava no registro. Nunca derruba a ação principal se falhar. */
export async function logActivity(x: { area: Area; who: string; action: string; item?: string; itemId?: string; detail?: string }) {
  if (!env.logDb) return;
  try {
    await notion().pages.create({
      parent: { database_id: env.logDb },
      properties: {
        'Ação': titleProp(x.action.slice(0, 200)),
        Quem: rich(x.who),
        'Área': { select: { name: x.area } },
        Item: rich(x.item ?? ''),
        'Item ID': rich((x.itemId ?? '').replace(/-/g, '')),
        Quando: { date: { start: new Date().toISOString() } },
        Detalhe: rich(x.detail ?? '')
      } as never
    });
  } catch (e) {
    console.error('[registro]', e);
  }
}

function toActivity(p: PageObjectResponse): Activity {
  const pr = p.properties;
  const a = select(pr['Área']);
  return {
    id: p.id,
    action: text(pr['Ação']),
    who: text(pr['Quem']),
    area: (AREAS as readonly string[]).includes(a ?? '') ? (a as Area) : null,
    item: text(pr['Item']),
    itemId: text(pr['Item ID']),
    when: date(pr['Quando']) ?? p.created_time,
    detail: text(pr['Detalhe'])
  };
}

/** Últimas ações (mais novas primeiro), com filtro opcional por área ou item. */
export async function listActivity(o: { area?: Area | null; itemId?: string | null; limit?: number } = {}): Promise<Activity[]> {
  if (!env.logDb) return [];
  const and: unknown[] = [];
  if (o.area) and.push({ property: 'Área', select: { equals: o.area } });
  if (o.itemId) and.push({ property: 'Item ID', rich_text: { equals: o.itemId.replace(/-/g, '') } });
  const res = await notion().databases.query({
    database_id: env.logDb,
    filter: and.length === 1 ? (and[0] as never) : and.length ? ({ and } as never) : undefined,
    sorts: [{ property: 'Quando', direction: 'descending' }],
    page_size: Math.min(100, o.limit ?? 100)
  });
  return res.results.filter((p) => isPage(p) && !p.archived).map((p) => toActivity(p as PageObjectResponse));
}

/** "16/11 21:03 · Lemuel editou…" (para a lista de histórico). */
export function asHistoryLines(xs: Activity[], timeZone: string): string {
  const f = new Intl.DateTimeFormat('pt-BR', { timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  return xs.map((a) => `${f.format(new Date(a.when)).replace(',', '')} · ${a.action}${a.detail ? ` — ${a.detail}` : ''}`).join('\n');
}

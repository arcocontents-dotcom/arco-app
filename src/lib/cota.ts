import 'server-only';
import schema from './schema.json';
import { env } from './env';
import { memo } from './cache';
import { MONTHS, addMonths, formatoDe, type Formato } from './domain';
import { date, listClients, mesPausado, queryAll, select, type Pausa } from './notion';
import { planOptions } from './planning';

// Saldo de conteúdo: o cliente contrata N reels/posts/stories por mês. Cada card do Planejamento ocupa uma vaga
// (Tipo de demanda "Reels 3" + Referente ao mês "Outubro"). O próximo card usa a vaga mais antiga em aberto:
// se outubro ficou com 3 de 4 vídeos, o próximo vídeo entra como Reels 4 · Outubro; depois, Reels 1 · Novembro.
// O conteúdo na Aprovação é o mesmo card (ligado a ele), então não ocupa outra vaga.

const P = schema.planning;

/** A conta das vagas começa aqui (antes disso o controle era manual, no Notion). */
export const COTA_START = '2026-10-01';

export const BASE: Record<Exclude<Formato, 'foto'>, string> = { reels: 'Reels', post: 'Post', story: 'Storys' };
export const NOME: Record<Exclude<Formato, 'foto'>, string> = { reels: 'Vídeo', post: 'Post', story: 'Story' };

export interface Vaga {
  kind: string;
  month: string;
  /** Primeiro dia do mês da vaga (YYYY-MM-01). */
  first: string;
  n: number;
  total: number;
  label: string;
}

/** "Referente ao mês" não tem ano: usa o ano que deixa o mês mais perto da data do card. */
export function firstOfRef(monthName: string, refDay: string): string | null {
  const m = MONTHS.indexOf(monthName);
  if (m < 0) return null;
  const y = Number(refDay.slice(0, 4));
  const ref = Date.parse(refDay.slice(0, 10));
  let best: string | null = null;
  let bestD = Infinity;
  for (const yy of [y - 1, y, y + 1]) {
    const f = `${yy}-${String(m + 1).padStart(2, '0')}-01`;
    const d = Math.abs(Date.parse(f) - ref);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

type Ocupadas = Map<string, Set<number>>; // `${formato}|${first}` → números usados

/** Vagas já ocupadas pelos cards do cliente (cards na lixeira não contam). */
function ocupadas(cal: string, exclude?: string | null): Promise<Ocupadas> {
  return memo(`plan:cota:${cal}:${exclude ?? ''}`, 20_000, async () => {
    const pages = env.planningDb
      ? await queryAll(env.planningDb, {
          filter: { and: [{ property: P.client, select: { equals: cal } }, { timestamp: 'created_time', created_time: { on_or_after: addMonths(COTA_START, -3) } }] }
        })
      : [];
    const out: Ocupadas = new Map();
    for (const p of pages) {
      if (p.archived || (exclude && p.id.replace(/-/g, '') === exclude.replace(/-/g, ''))) continue;
      const kind = select(p.properties[P.kind]);
      const month = select(p.properties[P.month]);
      const f = formatoDe(kind);
      const n = Number(kind?.match(/(\d+)$/)?.[1] ?? 0);
      if (!f || f === 'foto' || !month || !n) continue;
      const ref = date(p.properties[P.date])?.slice(0, 10) ?? p.created_time.slice(0, 10);
      const first = firstOfRef(month, ref);
      if (!first) continue;
      const key = `${f}|${first}`;
      if (!out.has(key)) out.set(key, new Set());
      out.get(key)!.add(n);
    }
    return out;
  });
}

/** Cota contratada do cliente pelo nome no Calendário mensal. */
export async function cotaDe(cal: string): Promise<{ reels: number; post: number; story: number } | null> {
  const c = (await listClients().catch(() => [])).find((x) => x.calName === cal);
  return c?.combinado ?? null;
}
async function pausasDe(cal: string): Promise<Pausa[]> {
  return (await listClients().catch(() => [])).find((x) => x.calName === cal)?.pauses ?? [];
}

/**
 * Próxima vaga livre de um formato: a mais antiga em aberto (desde o início da contagem),
 * avançando mês a mês. Sem cota contratada para esse formato, devolve null.
 */
export async function proximaVaga(cal: string, formato: string | null, today: string, exclude?: string | null, skip?: Set<string>): Promise<Vaga | null> {
  const f = formatoDe(formato);
  if (!f || f === 'foto') return null;
  const cota = await cotaDe(cal);
  const total = cota?.[f] ?? 0;
  if (!total) return null;
  const opts = await planOptions();
  const names = typeof opts === 'string' ? [] : opts.kind.map((o) => o.name);
  const used = await ocupadas(cal, exclude);
  const pausas = await pausasDe(cal);
  const cur = `${today.slice(0, 7)}-01`;
  for (let m = COTA_START < cur ? COTA_START : cur, i = 0; i < 24; m = addMonths(m, 1), i++) {
    // mês com o cliente pausado: não tem cota (nada renova)
    if (mesPausado(pausas, m)) continue;
    const taken = used.get(`${f}|${m}`) ?? new Set<number>();
    for (let n = 1; n <= total; n++) {
      const kind = `${BASE[f]} ${n}`;
      const month = MONTHS[Number(m.slice(5, 7)) - 1];
      if (taken.has(n) || !names.includes(kind) || skip?.has(`${kind}|${month}`)) continue;
      return { kind, month, first: m, n, total, label: `${NOME[f]} ${n} de ${total} · ${month}` };
    }
  }
  return null;
}

/** A vaga (tipo + mês) já está com outro card? */
export async function vagaOcupada(cal: string, kind: string | null, month: string | null, refDay: string, exclude?: string | null): Promise<boolean> {
  const f = formatoDe(kind);
  const n = Number(kind?.match(/(\d+)$/)?.[1] ?? 0);
  if (!f || f === 'foto' || !n || !month) return false;
  const first = firstOfRef(month, refDay);
  if (!first) return false;
  return (await ocupadas(cal, exclude)).get(`${f}|${first}`)?.has(n) ?? false;
}

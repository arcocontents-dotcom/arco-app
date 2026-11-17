import 'server-only';
import schema from './schema.json';
import { env } from './env';
import { memo } from './cache';
import { MONTHS, addDays, addMonths } from './domain';
import { checkbox, date, isPage, queryAll, select, setClientCombinado } from './notion';
import { children, gestaoClientPages, norm, plain } from './gestao-sync';

// Entregas do mês por cliente: o "Combinado com a marca" da página do cliente na Gestão
// (Reels mensal: 3 · Post mensal: 0 · Story mensal: 3) contra o que já foi postado no Calendário mensal
// com "Referente ao mês" = o mês. Todo mês começa do zero.

const P = schema.planning;
export type Entrega = 'reels' | 'post' | 'story';
export type Combinado = Record<Entrega, number>;

const idFrom = (s: string) => (s.replace(/-/g, '').match(/[0-9a-f]{32}/i)?.[0] ?? null);

async function clientPageId(c: { name: string; calName: string; notionPage: string }): Promise<string | null> {
  const direct = idFrom(c.notionPage || '');
  if (direct) return direct;
  const pages = await memo('contrato:gestao-pages', 600_000, () => gestaoClientPages()).catch(() => []);
  const keys = [norm(c.name), norm(c.calName || '')].filter(Boolean);
  const hit = pages.find((p) => keys.includes(norm(p.title))) ?? pages.find((p) => keys.some((k) => norm(p.title).includes(k) || k.includes(norm(p.title))));
  return hit?.id ?? null;
}

/** Lê o toggle "Combinado com a marca" (até colunas → toggle). */
async function readCombinado(pageId: string): Promise<Combinado | null> {
  let found: Combinado | null = null;
  const parse = (txt: string, out: Combinado) => {
    // várias linhas podem vir no mesmo bloco ("Reels mensal: 4\nPost mensal: 0")
    for (const m of txt.matchAll(/(reels?|v[íi]deos?|posts?|stor(?:y|ies|ys))\s*mensa(?:l|is)?\s*[:=-]?[ \t]*(\d{1,3})/gi)) {
      const k = m[1].toLowerCase();
      const key: Entrega = k.startsWith('post') ? 'post' : k.startsWith('stor') ? 'story' : 'reels';
      out[key] = Number(m[2]);
    }
  };
  const walk = async (id: string, depth: number): Promise<void> => {
    if (found || depth > 3) return;
    for (const b of await children(id)) {
      if (found) return;
      if (b.type === 'toggle' && /combinado/i.test(plain(b, 'toggle')) && b.has_children) {
        const out: Combinado = { reels: 0, post: 0, story: 0 };
        let any = false;
        for (const c of await children(b.id)) {
          const t = plain(c, c.type);
          if (t) {
            const before = JSON.stringify(out);
            parse(t, out);
            if (JSON.stringify(out) !== before || /mensal/i.test(t)) any = true;
          }
        }
        if (any) found = out;
        return;
      }
      if ((b.type === 'column_list' || b.type === 'column') && b.has_children) await walk(b.id, depth + 1);
    }
  };
  await walk(pageId, 0);
  return found;
}

export interface EntregaMes {
  /** null = não achou o "Combinado com a marca" na página do cliente. */
  combinado: Combinado | null;
  postados: Combinado;
  /** Lançados para o mês e ainda não postados. */
  emProducao: Combinado;
  pagina: string | null;
}

const kindOf = (k: string | null): Entrega | null => {
  const s = (k ?? '').toLowerCase();
  if (s.startsWith('reels') || s.startsWith('víd') || s.startsWith('vid')) return 'reels';
  if (s.startsWith('stor')) return 'story';
  if (s.startsWith('post') || s.startsWith('foto') || s.startsWith('carross')) return 'post';
  return null;
};

export function entregasDoMes(c: { id: string; name: string; calName: string; notionPage: string; combinado: Combinado | null }, cal: string, first: string): Promise<EntregaMes> {
  return memo(`plan:entregas:${cal}:${first}`, 30_000, async () => {
    const pageId = await clientPageId(c).catch(() => null);
    // lê ao vivo da página do cliente; se não der, usa a cópia guardada no cliente
    const live = pageId ? await memo(`contrato:${pageId}`, 300_000, () => readCombinado(pageId)).catch(() => null) : null;
    if (live && JSON.stringify(live) !== JSON.stringify(c.combinado)) await setClientCombinado(c.id, live).catch(() => undefined);
    const combinado = live ?? c.combinado;
    const monthName = MONTHS[Number(first.slice(5, 7)) - 1];
    const pages = env.planningDb
      ? await queryAll(env.planningDb, {
          filter: { and: [{ property: P.client, select: { equals: cal } }, { property: P.month, select: { equals: monthName } }] }
        })
      : [];
    // "Referente ao mês" não tem ano: vale o card com postagem no mesmo ano ou, sem data, criado perto do mês
    const lo = addDays(first, -200);
    const hi = addDays(addMonths(first, 1), 45);
    const postados: Combinado = { reels: 0, post: 0, story: 0 };
    const emProducao: Combinado = { reels: 0, post: 0, story: 0 };
    for (const p of pages) {
      if (!isPage(p) || p.archived) continue;
      const pr = p.properties;
      const k = kindOf(select(pr[P.kind]));
      if (!k) continue;
      const d = date(pr[P.date])?.slice(0, 10) ?? null;
      const ref = d ?? p.created_time.slice(0, 10);
      if (ref < lo || ref > hi) continue;
      const st = pr[P.status];
      const posted = checkbox(pr[P.done]) || (st?.type === 'status' && st.status?.name === 'Postado');
      (posted ? postados : emProducao)[k]++;
    }
    return { combinado, postados, emProducao, pagina: pageId ? `https://www.notion.so/${pageId}` : null };
  });
}

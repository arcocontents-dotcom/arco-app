import 'server-only';
import { env } from './env';
import { memo } from './cache';
import { createClient, listClients, normId, notion, updateClient } from './notion';
import { matchCalName, planOptions } from './planning';

// Clientes novos no Notion entram no app sozinhos.
// Fonte: os toggles "Clientes social media" / "Clientes somente vídeos" da página Gestão.
// O app só CRIA clientes (e preenche a página do cliente); nunca apaga nem cancela ninguém.

type Found = { id: string; title: string };

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(arqui|arq|dra|dr)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, '');

async function children(id: string) {
  const out: Array<{ id: string; type: string; has_children?: boolean; [k: string]: unknown }> = [];
  let cursor: string | undefined;
  do {
    const r = await notion().blocks.children.list({ block_id: id, start_cursor: cursor, page_size: 100 });
    out.push(...(r.results as typeof out));
    cursor = r.has_more ? (r.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

const plain = (b: Record<string, unknown>, type: string) =>
  (((b[type] as { rich_text?: { plain_text: string }[] })?.rich_text ?? []).map((t) => t.plain_text).join('') || '').trim();

/** Páginas de cliente dentro dos toggles "Clientes …" (até colunas → toggle → página). */
export async function gestaoClientPages(): Promise<Found[]> {
  if (!env.gestaoPage) return [];
  const found: Found[] = [];
  const walk = async (id: string, depth: number, inClients: boolean) => {
    if (depth > 3) return;
    for (const b of await children(id)) {
      if (b.type === 'child_page' && inClients) {
        const title = String((b.child_page as { title?: string })?.title ?? '').trim();
        if (title) found.push({ id: b.id, title });
        continue;
      }
      if (b.type === 'toggle') {
        const t = plain(b, 'toggle');
        // "Clientes social media", "Clientes somente vídeos"… (não entra em "Bastidores")
        if (/^clientes\b/i.test(t) && b.has_children) await walk(b.id, depth + 1, true);
        continue;
      }
      if ((b.type === 'column_list' || b.type === 'column') && b.has_children) await walk(b.id, depth + 1, inClients);
    }
  };
  await walk(env.gestaoPage, 0, false);
  return found;
}

export type SyncResult = { status: 'ok' | 'sem-acesso' | 'nao-configurado' | 'erro'; created: string[] };

/** Cria no app os clientes que estão na Gestão e ainda não existem (inclui os cancelados na comparação). */
export function syncClientsFromGestao(): Promise<SyncResult> {
  if (!env.gestaoPage) return Promise.resolve({ status: 'nao-configurado', created: [] });
  return memo('gestao:sync', 60_000, async (): Promise<SyncResult> => {
    let pages: Found[];
    try {
      pages = await gestaoClientPages();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'object_not_found' || code === 'restricted_resource' || code === 'unauthorized') return { status: 'sem-acesso', created: [] };
      console.error('[gestao] sync', e);
      return { status: 'erro', created: [] };
    }
    const clients = await listClients();
    const options = await planOptions().catch(() => null);
    const calOptions = options && typeof options !== 'string' ? options.clients : [];
    const created: string[] = [];
    for (const p of pages) {
      const pid = normId(p.id);
      const match =
        clients.find((c) => c.notionPage && normId(c.notionPage.split(/[/?#-]/).filter(Boolean).pop() ?? '').endsWith(pid)) ??
        clients.find((c) => norm(c.name) === norm(p.title)) ??
        clients.find((c) => {
          const a = norm(c.name), b = norm(p.title);
          return a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a));
        });
      const url = `https://www.notion.so/${pid}`;
      if (match) {
        if (!match.notionPage) await updateClient(match.id, { notionPage: url }).catch(() => undefined);
        continue;
      }
      const calName = matchCalName(p.title, calOptions) ?? '';
      await createClient({ name: p.title.replace(/\s+/g, ' ').trim(), instagram: '', calName, notionPage: url });
      created.push(p.title);
    }
    return { status: 'ok', created };
  });
}

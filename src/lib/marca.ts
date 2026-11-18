import 'server-only';
import { memo } from './cache';
import { children, plain } from './gestao-sync';
import { clientPageId } from './contrato';

// Identidade visual do cliente, lida da página "Marca" (Gestão → cliente → Bastidores → Marca) no Notion.
// Só leitura: paleta de cores, fonte principal, fonte secundária e tamanhos.

export interface Marca {
  cores: { nome: string; hex: string }[];
  fontePrincipal: string | null;
  fonteSecundaria: string | null;
  outrasFontes: { nome: string; valor: string }[];
  tamanhos: { nome: string; valor: string }[];
  pagina: string;
}

const TXT_TYPES = ['paragraph', 'bulleted_list_item', 'numbered_list_item', 'toggle', 'heading_1', 'heading_2', 'heading_3', 'callout', 'quote', 'to_do'];

/** Texto de um bloco e dos filhos (até 3 níveis). */
async function textOf(id: string, depth = 0): Promise<string[]> {
  if (depth > 3) return [];
  const out: string[] = [];
  for (const b of await children(id)) {
    if (TXT_TYPES.includes(b.type)) out.push(...plain(b, b.type).split(/\n/));
    if (b.has_children && b.type !== 'child_page' && b.type !== 'child_database') out.push(...(await textOf(b.id, depth + 1)));
  }
  return out.map((l) => l.trim()).filter(Boolean);
}

/** Acha a subpágina "Marca" dentro da página do cliente (às vezes dentro de toggles e colunas). */
async function marcaPage(clientPage: string): Promise<string | null> {
  const walk = async (id: string, depth: number): Promise<string | null> => {
    if (depth > 3) return null;
    for (const b of await children(id)) {
      if (b.type === 'child_page' && /^\s*marca\b/i.test(String((b.child_page as { title?: string })?.title ?? ''))) return b.id;
    }
    for (const b of await children(id)) {
      if (b.has_children && ['toggle', 'column_list', 'column', 'callout'].includes(b.type)) {
        const hit = await walk(b.id, depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(clientPage, 0);
}

export function parseMarca(lines: string[], pagina: string): Marca {
  const cores: Marca['cores'] = [];
  const tamanhos: Marca['tamanhos'] = [];
  const outras: Marca['outrasFontes'] = [];
  let principal: string | null = null;
  let secundaria: string | null = null;
  for (const raw of lines) {
    const l = raw.replace(/\*\*/g, '').trim();
    for (const m of l.matchAll(/(?:([^:#\n]{1,40}?)\s*[:\-–]\s*)?(#[0-9a-f]{6}\b|#[0-9a-f]{3}\b)/gi)) {
      const hex = m[2].toLowerCase();
      if (!cores.some((c) => c.hex === hex)) cores.push({ nome: (m[1] ?? '').trim() || hex, hex });
    }
    const kv = l.match(/^([^:]{2,40}):\s*(.+)$/);
    if (!kv) continue;
    const k = kv[1].trim();
    const v = kv[2].trim();
    const kl = k.toLowerCase();
    if (/tamanho/.test(kl)) tamanhos.push({ nome: k, valor: v });
    else if (/fonte/.test(kl)) {
      if (!principal && /(t[íi]tulo|principal|prim[áa]ria)/.test(kl)) principal = v;
      else if (!secundaria && /secund[áa]ria/.test(kl)) secundaria = v;
      else outras.push({ nome: k, valor: v });
    }
  }
  if (!principal && outras.length) principal = outras.shift()!.valor;
  return { cores: cores.slice(0, 12), fontePrincipal: principal, fonteSecundaria: secundaria, outrasFontes: outras.slice(0, 6), tamanhos: tamanhos.slice(0, 6), pagina };
}

export function marcaDoCliente(c: { id: string; name: string; calName: string; notionPage: string }): Promise<Marca | null> {
  return memo(`contrato:marca:${c.id}`, 600_000, async () => {
    const page = await clientPageId(c);
    if (!page) return null;
    const mp = await marcaPage(page);
    if (!mp) return null;
    const m = parseMarca(await textOf(mp), `https://www.notion.so/${mp.replace(/-/g, '')}`);
    return m.cores.length || m.fontePrincipal || m.fonteSecundaria || m.tamanhos.length ? m : null;
  }).catch((e) => {
    console.error('[marca]', e);
    return null;
  });
}

import 'server-only';
import { memo } from './cache';
import { children } from './gestao-sync';
import { clientPageId } from './contrato';

// Identidade visual e dados do cliente, lidos da página "Marca" (Gestão → cliente → Bastidores → Marca) no Notion.
// Só leitura. O modelo da Arco tem toggles: Paleta de cores, Fontes, CapCut, Banco de dados (Drive),
// CTA (Links e Informações) e Referência que o cliente gosta.

export interface Kv { nome: string; valor: string; url?: string }
export interface Marca {
  cores: { nome: string; hex: string }[];
  fontePrincipal: string | null;
  fonteSecundaria: string | null;
  fonteInstagram: string | null;
  /** CapCut: tamanho da legenda, fonte, filtro, capa… */
  edicao: Kv[];
  contato: { endereco: string | null; maps: string | null; telefone: string | null; whatsapp: string | null; instagram: string | null; site: string | null; outros: Kv[] };
  /** Banco de dados (Drive): logos, banco de imagens, posts prontos… */
  arquivos: Kv[];
  referencias: Kv[];
  pagina: string;
}

type Line = { section: string; text: string; urls: string[] };
type RT = { plain_text: string; href?: string | null };

const TXT_TYPES = ['paragraph', 'bulleted_list_item', 'numbered_list_item', 'toggle', 'heading_1', 'heading_2', 'heading_3', 'callout', 'quote', 'to_do'];
const SECTIONS: [RegExp, string][] = [
  [/paleta|cores/i, 'cores'],
  [/fonte|tipogra/i, 'fontes'],
  [/capcut|edi[çc][ãa]o/i, 'edicao'],
  [/banco|drive|arquivo/i, 'arquivos'],
  [/cta|links|informa|contato/i, 'contato'],
  [/refer[êe]ncia/i, 'referencias']
];

function richOf(b: Record<string, unknown>): RT[] {
  return ((b[String(b.type)] as { rich_text?: RT[] })?.rich_text ?? []) as RT[];
}

/** Linhas de texto da página, cada uma com a seção (toggle) em que está e os links dela. */
async function linesOf(id: string, section: string, depth: number, out: Line[]) {
  if (depth > 4) return;
  for (const b of await children(id)) {
    if (b.type === 'child_page' || b.type === 'child_database') continue;
    let sec = section;
    if (TXT_TYPES.includes(b.type)) {
      const rt = richOf(b);
      const text = rt.map((t) => t.plain_text).join('');
      const urls = rt.map((t) => t.href).filter((h): h is string => !!h && /^https?:\/\//.test(h));
      // toggle com nome de seção ("Paleta de cores", "Fontes", "CTA (Links e Informações)") abre a seção
      const head = b.type === 'toggle' || b.type.startsWith('heading') ? SECTIONS.find(([re]) => re.test(text) && text.replace(/[:\s]+$/, '').length < 45) : undefined;
      if (head) sec = head[1];
      else for (const l of text.split(/\n/)) {
        const lu = urls.filter((u) => l.includes(u) || urls.length === 1);
        out.push({ section: sec, text: l.trim(), urls: [...new Set([...lu, ...(l.match(/https?:\/\/\S+/g) ?? [])])] });
      }
    }
    if (b.has_children) await linesOf(b.id, sec, depth + 1, out);
  }
}

async function marcaPage(clientPage: string): Promise<string | null> {
  const walk = async (id: string, depth: number): Promise<string | null> => {
    if (depth > 3) return null;
    const list = await children(id);
    for (const b of list) {
      if (b.type === 'child_page' && /^\s*(🔖\s*)?marca\b/i.test(String((b.child_page as { title?: string })?.title ?? ''))) return b.id;
    }
    for (const b of list) {
      if (b.has_children && ['toggle', 'column_list', 'column', 'callout'].includes(b.type)) {
        const hit = await walk(b.id, depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(clientPage, 0);
}

const KV = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 ./()&-]{1,40}?)\s*:\s*(.*)$/;

export function parseMarca(lines: Line[], pagina: string): Marca {
  const m: Marca = {
    cores: [], fontePrincipal: null, fonteSecundaria: null, fonteInstagram: null, edicao: [],
    contato: { endereco: null, maps: null, telefone: null, whatsapp: null, instagram: null, site: null, outros: [] },
    arquivos: [], referencias: [], pagina
  };
  const L = lines.filter((l) => l.text || l.urls.length);
  // "Telefone:" numa linha e o valor na próxima (acontece no Notion)
  const pairs: { section: string; nome: string; valor: string; url?: string }[] = [];
  let lastLabel: { section: string; nome: string } | null = null;
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    for (const h of l.text.matchAll(/(?:([^:#\n]{1,40}?)\s*[:\-–]\s*)?(#[0-9a-f]{6}\b|#[0-9a-f]{3}\b)/gi)) {
      if (/https?:/.test(l.text)) break;
      const hex = h[2].toLowerCase();
      if (!m.cores.some((c) => c.hex === hex)) m.cores.push({ nome: (h[1] ?? '').trim() || hex, hex });
    }
    const kv = /^https?:/i.test(l.text) ? null : l.text.match(KV);
    if (kv) {
      const nome = kv[1].trim();
      let valor = kv[2].trim();
      let url = l.urls[0];
      const next = L[i + 1];
      if (!valor && next && next.section === l.section && !(!/^https?:/i.test(next.text) && KV.test(next.text))) {
        valor = next.text.trim();
        url = url ?? next.urls[0];
        i++;
      }
      if (valor || url) pairs.push({ section: l.section, nome, valor: valor || url || '', url });
      lastLabel = valor || url ? null : { section: l.section, nome };
      continue;
    }
    // linha solta com link: usa o último rótulo da seção (ex.: "Logos:" e o link embaixo)
    if (l.urls.length) {
      for (const u of l.urls) pairs.push({ section: l.section, nome: lastLabel?.section === l.section ? lastLabel.nome : l.text.replace(u, '').trim() || 'Link', valor: u, url: u });
    } else if (l.section === 'referencias' && l.text.length < 60) {
      lastLabel = { section: l.section, nome: l.text.replace(/[:\s]+$/, '') };
    }
  }
  for (const p of pairs) {
    const k = p.nome.toLowerCase();
    const sec = p.section;
    if (/#[0-9a-f]{3,6}\b/i.test(p.valor) && !p.url) continue;
    if (sec === 'edicao') { m.edicao.push({ nome: p.nome, valor: p.valor, url: p.url }); continue; }
    if (/fonte/.test(k)) {
      if (/(t[íi]tulo|princip|prim[áa]ri)/.test(k) && !m.fontePrincipal) m.fontePrincipal = p.valor;
      else if (/secund/.test(k) && !m.fonteSecundaria) m.fonteSecundaria = p.valor;
      else if (/instagram/.test(k) && !m.fonteInstagram) m.fonteInstagram = p.valor;
      else if (!m.fontePrincipal) m.fontePrincipal = p.valor;
      continue;
    }
    if (/tamanho|filtro|capa|legenda/.test(k)) { m.edicao.push({ nome: p.nome, valor: p.valor, url: p.url }); continue; }
    if (/endere/.test(k)) { m.contato.endereco ??= p.valor; continue; }
    if (/maps|mapa|localiza/.test(k)) { m.contato.maps ??= p.url ?? p.valor; continue; }
    if (/telefone|celular|fone/.test(k)) { m.contato.telefone ??= p.valor; continue; }
    if (/whats/.test(k)) { m.contato.whatsapp ??= p.url ?? p.valor; continue; }
    if (/instagram/.test(k)) { m.contato.instagram ??= p.url ?? p.valor; continue; }
    if (/site|link na bio|linktree/.test(k)) { m.contato.site ??= p.url ?? p.valor; continue; }
    if (sec === 'referencias') { if (p.url) m.referencias.push({ nome: p.nome, valor: p.valor, url: p.url }); continue; }
    if (sec === 'arquivos' || (p.url && /drive|mega\.nz|dropbox|canva/i.test(p.url))) { if (p.url) m.arquivos.push({ nome: p.nome, valor: p.valor, url: p.url }); continue; }
    if (sec === 'contato') m.contato.outros.push({ nome: p.nome, valor: p.valor, url: p.url });
  }
  m.cores = m.cores.slice(0, 12);
  m.edicao = m.edicao.slice(0, 8);
  m.arquivos = m.arquivos.slice(0, 10);
  m.referencias = m.referencias.slice(0, 10);
  return m;
}

const vazia = (m: Marca) =>
  !m.cores.length && !m.fontePrincipal && !m.fonteSecundaria && !m.contato.telefone && !m.contato.endereco && !m.arquivos.length;

export function marcaDoCliente(c: { id: string; name: string; calName: string; notionPage: string }): Promise<Marca | null> {
  return memo(`contrato:marca:${c.id}`, 600_000, async () => {
    const page = await clientPageId(c);
    if (!page) return null;
    const mp = await marcaPage(page);
    if (!mp) return null;
    const lines: Line[] = [];
    await linesOf(mp, '', 0, lines);
    const m = parseMarca(lines, `https://www.notion.so/${mp.replace(/-/g, '')}`);
    return vazia(m) ? null : m;
  }).catch((e) => {
    console.error('[marca]', e);
    return null;
  });
}

/** Link do Google Fonts para pré-visualizar a fonte (se ela existir lá). */
export function googleFontHref(name: string | null): string | null {
  if (!name) return null;
  const alias: Record<string, string> = { 'julius sans': 'Julius Sans One', 'adobe caslon pro': 'Libre Caslon Text' };
  const base = name.replace(/[-_](blk|black|bold|regular|light|extralight|thin|medium|semibold)\b.*$/i, '').replace(/\s+/g, ' ').trim();
  if (!base || base.length > 40) return null;
  const fam = alias[base.toLowerCase()] ?? base.toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase());
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, '+')}&display=swap`;
}
export function fontFamilyOf(name: string | null): string | null {
  if (!name) return null;
  const href = googleFontHref(name);
  const fam = href ? decodeURIComponent(href.split('family=')[1].split('&')[0]).replace(/\+/g, ' ') : name;
  return `'${fam}', '${name}', var(--body), sans-serif`;
}

// Produtos da captação (o que vai ser feito lá). Sem dependência de servidor: usado no app e no formulário.
// No Notion fica num texto legível, ex.: "Reels ×2 · Story ×2 · Foto de capa ×2".

export interface Produto {
  name: string;
  qty: number;
}

export const PRODUTOS_PADRAO = ['Reels', 'Story', 'Post', 'Carrossel', 'Foto de capa', 'Foto'] as const;

const SEP = ' · ';

export function produtosToText(xs: Produto[]): string {
  return xs.map((p) => `${p.name} ×${p.qty}`).join(SEP);
}

/** Lê o texto do Notion. Aceita "Reels ×2", "Reels x2", "Reels 2", "2 Reels" e itens separados por ·, vírgula ou linha. */
export function textToProdutos(s: string): Produto[] {
  const out: Produto[] = [];
  for (const raw of s.split(/\s*(?:·|,|;|\n)\s*/)) {
    const t = raw.trim();
    if (!t) continue;
    let m = t.match(/^(.*?)\s*[×xX]\s*(\d{1,3})$/) ?? t.match(/^(.*?)\s+(\d{1,3})$/);
    let name = m?.[1]?.trim() ?? '';
    let qty = m ? Number(m[2]) : 0;
    if (!m) {
      m = t.match(/^(\d{1,3})\s*[×xX]?\s+(.+)$/);
      name = m ? m[2].trim() : t;
      qty = m ? Number(m[1]) : 1;
    }
    if (!name) continue;
    const same = out.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (same) same.qty += Math.max(1, qty);
    else out.push({ name: name.slice(0, 40), qty: Math.min(99, Math.max(1, qty)) });
  }
  return out;
}

export function cleanProdutos(x: unknown): Produto[] {
  if (!Array.isArray(x)) return [];
  const out: Produto[] = [];
  for (const p of x.slice(0, 15)) {
    const name = String((p as Produto)?.name ?? '').replace(/[·×\n]/g, ' ').trim().slice(0, 40);
    const qty = Math.min(99, Math.max(1, Math.round(Number((p as Produto)?.qty) || 1)));
    if (name && !out.some((o) => o.name.toLowerCase() === name.toLowerCase())) out.push({ name, qty });
  }
  return out;
}

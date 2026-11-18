// Sem dependências de servidor: usado também no navegador.

const WEIGHTS: [RegExp, number][] = [
  [/\b(hairline|thin)\b/i, 100], [/\bextra ?light\b/i, 200], [/\blight\b/i, 300], [/\b(regular|book|normal)\b/i, 400],
  [/\bmedium\b/i, 500], [/\bsemi ?bold\b/i, 600], [/\bextra ?bold\b/i, 800], [/\bbold\b/i, 700], [/\b(black|blk|heavy)\b/i, 900]
];
/** Nome no Google Fonts para fontes que a Arco usa (quando existe lá ou tem uma parecida). */
const ALIAS: Record<string, string | null> = {
  'julius sans': 'Julius Sans One', 'julius sans one': 'Julius Sans One', 'adobe caslon pro': 'Libre Caslon Text', 'caslon': 'Libre Caslon Text',
  titillium: 'Titillium Web', titilium: 'Titillium Web', tiltium: 'Titillium Web', 'bodoni 72': 'Bodoni Moda', bodoni: 'Bodoni Moda',
  'eb garamond': 'EB Garamond', ebgaramond: 'EB Garamond', barlow: 'Barlow', cinzel: 'Cinzel', tangerine: 'Tangerine', unbounded: 'Unbounded',
  manis: null, prumo: null, radiano: null, gotham: null, 'proxima nova': null, helvetica: null, arial: null, literature: null, deco: null
};

export interface FontSpec { href: string | null; family: string; weight: number; italic: boolean }

/** Como mostrar a fonte da marca: família (Google Fonts quando dá), peso e itálico. */
export function fontSpec(name: string | null): FontSpec | null {
  if (!name) return null;
  const raw = name.replace(/\.(otf|ttf|woff2?)$/i, '').replace(/[-_]/g, ' ').replace(/variablefont.*$/i, '').replace(/\s+/g, ' ').trim();
  const italic = /\b(italic|inclinada|it[áa]lico)\b/i.test(raw);
  const weight = WEIGHTS.find(([re]) => re.test(raw))?.[1] ?? 400;
  const base = raw
    .replace(/\b(hairline|thin|extra ?light|light|regular|book|normal|medium|semi ?bold|extra ?bold|bold|black|blk|heavy|italic|inclinada|it[áa]lico)\b/gi, '')
    .replace(/\s+/g, ' ').trim();
  const key = base.toLowerCase();
  const alias = key in ALIAS ? ALIAS[key] : base.replace(/\b\w/g, (x) => x.toUpperCase());
  const href = alias
    ? `https://fonts.googleapis.com/css2?family=${encodeURIComponent(alias).replace(/%20/g, '+')}:ital,wght@${italic ? 1 : 0},${weight}&display=swap`
    : null;
  const family = [alias, base].filter(Boolean).map((f) => `'${f}'`).join(', ');
  return { href, family: `${family}, var(--body), sans-serif`, weight, italic };
}
export const googleFontHref = (name: string | null) => fontSpec(name)?.href ?? null;
export const fontFamilyOf = (name: string | null) => fontSpec(name)?.family ?? null;
export function fontStyle(name: string | null): { fontFamily?: string; fontWeight?: number; fontStyle?: 'italic' | 'normal' } {
  const f = fontSpec(name);
  return f ? { fontFamily: f.family, fontWeight: f.weight, fontStyle: f.italic ? 'italic' : 'normal' } : {};
}

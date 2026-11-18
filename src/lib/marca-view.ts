// Sem dependências de servidor: usado também no navegador.

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

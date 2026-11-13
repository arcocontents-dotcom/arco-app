// Referências: transforma links do Instagram, TikTok, YouTube e Pinterest em player dentro do site.

export type EmbedKind = 'instagram' | 'tiktok' | 'youtube' | 'pinterest' | 'link';
export type Embed = { kind: EmbedKind; url: string; src: string | null; vertical: boolean; label: string };

const LABEL: Record<EmbedKind, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', pinterest: 'Pinterest', link: 'Link' };

export function safeUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

/** Separa os links de um texto (um por linha ou separados por espaço). */
export function splitLinks(text: string): string[] {
  const out: string[] = [];
  for (const part of (text ?? '').split(/[\s,]+/)) {
    const u = safeUrl(part);
    if (u && !out.includes(u.href)) out.push(u.href);
  }
  return out;
}

export function toEmbed(raw: string): Embed {
  const u = safeUrl(raw);
  const url = u?.href ?? raw;
  const base = { url, vertical: false };
  if (!u) return { ...base, kind: 'link', src: null, label: LABEL.link };
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  const path = u.pathname;

  if (host === 'instagram.com') {
    const m = path.match(/^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/);
    if (m) {
      const type = m[1] === 'p' ? 'p' : 'reel';
      return { url, kind: 'instagram', src: `https://www.instagram.com/${type}/${m[2]}/embed/`, vertical: true, label: LABEL.instagram };
    }
  }
  if (host === 'tiktok.com') {
    const m = path.match(/\/video\/(\d+)/) ?? path.match(/\/photo\/(\d+)/);
    if (m) return { url, kind: 'tiktok', src: `https://www.tiktok.com/embed/v2/${m[1]}`, vertical: true, label: LABEL.tiktok };
  }
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    let id: string | null = null;
    let vertical = false;
    if (host === 'youtu.be') id = path.slice(1).split('/')[0];
    else if (path.startsWith('/shorts/')) { id = path.split('/')[2]; vertical = true; }
    else if (path.startsWith('/embed/') || path.startsWith('/live/')) id = path.split('/')[2];
    else id = u.searchParams.get('v');
    if (id && /^[\w-]{6,20}$/.test(id)) {
      return { url, kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`, vertical, label: LABEL.youtube };
    }
  }
  if (/(^|\.)pinterest\.[a-z.]+$/.test(host)) {
    const m = path.match(/\/pin\/(?:[\w-]*--)?(\d+)/);
    if (m) return { url, kind: 'pinterest', src: `https://assets.pinterest.com/ext/embed.html?id=${m[1]}`, vertical: true, label: LABEL.pinterest };
  }
  return { ...base, kind: 'link', src: null, label: host };
}

/** Links curtos (vm.tiktok.com, pin.it…) precisam ser abertos no servidor para achar o endereço real. */
export function isShortLink(raw: string): boolean {
  const u = safeUrl(raw);
  if (!u) return false;
  const h = u.hostname.replace(/^www\./, '');
  return h === 'vm.tiktok.com' || h === 'vt.tiktok.com' || (h === 'tiktok.com' && u.pathname.startsWith('/t/')) || h === 'pin.it';
}

/** Domínios que podem aparecer em iframe (vai no CSP). */
export const EMBED_FRAME_SRC = [
  'https://www.instagram.com',
  'https://www.tiktok.com',
  'https://www.youtube-nocookie.com',
  'https://assets.pinterest.com'
];

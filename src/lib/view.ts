import 'server-only';
import type { CSSProperties } from 'react';
import type { ContentRecord } from './notion';
import { videoThumbUrl } from './media';

export function contentThumb(c: ContentRecord): string | null {
  if (c.type === 'Post' || c.type === 'Carrossel') return c.artUrls[0] ?? null;
  if (c.type === 'Story') return c.storyImageUrl ?? (c.videoUid ? safeThumb(c.videoUid) : null);
  return c.coverUrl ?? (c.videoUid ? safeThumb(c.videoUid) : null);
}

function safeThumb(uid: string) {
  try {
    return videoThumbUrl(uid, 480);
  } catch {
    return null;
  }
}

const PRIORITY = ['Reprovado', 'Ajustes', 'Aguardando', 'Aprovado', 'Postado', 'Rascunho'];
export function dayStatus(list: ContentRecord[]): string | null {
  if (!list.length) return null;
  return [...list].sort((a, b) => PRIORITY.indexOf(a.status) - PRIORITY.indexOf(b.status))[0].status;
}

export function cssUrl(u: string | null): CSSProperties | undefined {
  return u ? { backgroundImage: `url("${u.replace(/"/g, '%22')}")` } : undefined;
}

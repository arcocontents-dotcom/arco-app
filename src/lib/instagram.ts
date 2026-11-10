import 'server-only';
import { memo } from './cache';
import { env } from './env';
import { decrypt, encrypt } from './crypto';
import { getClientInstagramSecrets, setClientInstagram } from './notion';

// Instagram API com Instagram Login (contas Profissionais: Comercial ou Criador).

export function instagramConfigured(): boolean {
  return !!(env.igAppId && env.igAppSecret && process.env.TOKEN_ENC_KEY);
}

export function redirectUri() {
  return `${env.appUrl}/api/instagram/callback`;
}

export function authorizeUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: env.igAppId!,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'instagram_business_basic',
    state
  });
  return `https://www.instagram.com/oauth/authorize?${p.toString()}`;
}

export async function exchangeCode(code: string): Promise<{ token: string; userId: string; username: string; expires: string }> {
  const form = new URLSearchParams({
    client_id: env.igAppId!,
    client_secret: env.igAppSecret!,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(),
    code
  });
  const shortRes = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form });
  const short = (await shortRes.json()) as { access_token?: string; user_id?: number | string };
  if (!shortRes.ok || !short.access_token) throw new Error('Instagram recusou a autorização');

  const longRes = await fetch(
    `https://graph.instagram.com/access_token?${new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: env.igAppSecret!,
      access_token: short.access_token
    })}`
  );
  const long = (await longRes.json()) as { access_token?: string; expires_in?: number };
  if (!longRes.ok || !long.access_token) throw new Error('Não foi possível gerar o token de longa duração');

  const meRes = await fetch(
    `https://graph.instagram.com/me?${new URLSearchParams({ fields: 'user_id,username', access_token: long.access_token })}`
  );
  const me = (await meRes.json()) as { user_id?: string; username?: string; id?: string };
  return {
    token: long.access_token,
    userId: String(me.user_id ?? me.id ?? short.user_id ?? ''),
    username: me.username ?? '',
    expires: new Date(Date.now() + (long.expires_in ?? 60 * 24 * 3600) * 1000).toISOString()
  };
}

export async function saveConnection(clientId: string, c: { token: string; userId: string; username: string; expires: string }) {
  await setClientInstagram(clientId, { userId: c.userId, username: c.username, encToken: encrypt(c.token), expires: c.expires });
}

export async function refreshToken(clientId: string): Promise<boolean> {
  const s = await getClientInstagramSecrets(clientId);
  if (!s) return false;
  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: decrypt(s.token)
    })}`
  );
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !j.access_token) return false;
  await setClientInstagram(clientId, {
    userId: s.userId,
    username: '',
    encToken: encrypt(j.access_token),
    expires: new Date(Date.now() + (j.expires_in ?? 60 * 24 * 3600) * 1000).toISOString()
  }).catch(() => undefined);
  return true;
}

export interface IgMedia {
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  thumb: string;
  permalink: string;
  timestamp: string;
}

/** Posts publicados no perfil. Atualiza sozinho a cada 15 minutos. */
export function getPublishedMedia(clientId: string): Promise<IgMedia[]> {
  return memo(`ig:${clientId.replace(/-/g, '').toLowerCase()}:media`, 900_000, async () => {
      if (!instagramConfigured()) return [];
      let s = await getClientInstagramSecrets(clientId).catch(() => null);
      if (!s) return [];
      // Renova o token sozinho quando faltar menos de 20 dias (dispensa agendador).
      if (s.expires && new Date(s.expires).getTime() - Date.now() < 20 * 24 * 3600 * 1000) {
        if (await refreshToken(clientId).catch(() => false)) s = (await getClientInstagramSecrets(clientId).catch(() => null)) ?? s;
      }
      const res = await fetch(
        `https://graph.instagram.com/me/media?${new URLSearchParams({
          fields: 'id,media_type,media_url,thumbnail_url,permalink,timestamp',
          limit: '30',
          access_token: decrypt(s.token)
        })}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        console.error('[instagram] falha ao ler mídia', res.status);
        return [];
      }
      const j = (await res.json()) as {
        data?: { id: string; media_type: IgMedia['type']; media_url?: string; thumbnail_url?: string; permalink: string; timestamp: string }[];
      };
      return (j.data ?? [])
        .map((m) => ({
          id: m.id,
          type: m.media_type,
          thumb: (m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url) ?? m.thumbnail_url ?? '',
          permalink: m.permalink,
          timestamp: m.timestamp
        }))
        .filter((m) => m.thumb);
  });
}

import 'server-only';
import { SignJWT, importJWK } from 'jose';
import { env } from './env';
import { encryptPayload, vapidFrom, type Vapid } from './webpush';

// Aviso no celular. O texto vai criptografado de ponta a ponta para o aparelho (RFC 8291):
// nem o serviço da Apple/Google consegue ler o nome do conteúdo.

let vapidCache: Vapid | null = null;
function vapid(): Vapid {
  if (!vapidCache) vapidCache = vapidFrom(env.sessionSecret, env.vapidPublicKey, env.vapidPrivateKey);
  return vapidCache;
}

/** Chave pública que o aparelho usa para se inscrever. Sempre existe (derivada do SESSION_SECRET). */
export function pushPublicKey(): string | null {
  try {
    return vapid().publicKey;
  } catch {
    return null;
  }
}

export const pushConfigured = () => !!pushPublicKey();

let keyPromise: Promise<CryptoKey | Uint8Array> | null = null;
function key() {
  if (!keyPromise) {
    const v = vapid();
    keyPromise = importJWK({ kty: 'EC', crv: 'P-256', x: v.x, y: v.y, d: v.d }, 'ES256');
  }
  return keyPromise;
}

/** Só endereços dos serviços de aviso conhecidos (Apple, Google, Mozilla, Microsoft). */
export function isPushEndpoint(u: string): boolean {
  try {
    const h = new URL(u);
    return (
      h.protocol === 'https:' &&
      /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/.test(h.hostname)
    );
  } catch {
    return false;
  }
}

export type PushTarget = { endpoint: string; p256dh?: string; auth?: string };
export type PushMessage = { title: string; body: string; url: string; tag: string };

/** Envia um aviso. Retorna 'gone' quando o aparelho não aceita mais (aí removemos). */
export async function sendPush(sub: PushTarget, message?: PushMessage): Promise<'ok' | 'gone' | 'erro'> {
  if (!pushConfigured() || !isPushEndpoint(sub.endpoint)) return 'erro';
  const aud = new URL(sub.endpoint).origin;
  const jwt = await new SignJWT({ aud, sub: `mailto:${env.adminEmail}` })
    .setProtectedHeader({ typ: 'JWT', alg: 'ES256' })
    .setExpirationTime('12h')
    .sign(await key());
  const headers: Record<string, string> = {
    TTL: String(3 * 24 * 3600),
    Urgency: 'high',
    Authorization: `vapid t=${jwt}, k=${vapid().publicKey}`
  };
  let body: Uint8Array | undefined;
  if (message && sub.p256dh && sub.auth) {
    body = await encryptPayload(sub.p256dh, sub.auth, JSON.stringify(message));
    headers['Content-Encoding'] = 'aes128gcm';
    headers['Content-Type'] = 'application/octet-stream';
    if (/^[A-Za-z0-9_-]{1,32}$/.test(message.tag)) headers.Topic = message.tag;
  } else {
    headers['Content-Length'] = '0';
  }
  const res = await fetch(sub.endpoint, { method: 'POST', headers, body: body as unknown as BodyInit | undefined });
  if (res.status === 404 || res.status === 410) return 'gone';
  if (!res.ok) {
    console.error('[push]', res.status, await res.text().catch(() => ''));
    return 'erro';
  }
  return 'ok';
}

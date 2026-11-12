import 'server-only';
import { SignJWT, importJWK } from 'jose';
import { env } from './env';

// Aviso no celular sem conteúdo (o texto fica no próprio aparelho, em /sw.js).
// Assim não há dado do cliente viajando no aviso e não é preciso criptografar nada.

export const pushConfigured = () => !!(env.vapidPublicKey && env.vapidPrivateKey);

let keyPromise: Promise<CryptoKey | Uint8Array> | null = null;
function key() {
  if (!keyPromise) {
    const pub = Buffer.from(env.vapidPublicKey!, 'base64url');
    keyPromise = importJWK(
      {
        kty: 'EC',
        crv: 'P-256',
        x: pub.subarray(1, 33).toString('base64url'),
        y: pub.subarray(33, 65).toString('base64url'),
        d: env.vapidPrivateKey!
      },
      'ES256'
    );
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

/** Envia um aviso. Retorna 'gone' quando o aparelho não aceita mais (aí removemos). */
export async function sendPush(endpoint: string): Promise<'ok' | 'gone' | 'erro'> {
  if (!pushConfigured() || !isPushEndpoint(endpoint)) return 'erro';
  const aud = new URL(endpoint).origin;
  const jwt = await new SignJWT({ aud, sub: `mailto:${env.adminEmail}` })
    .setProtectedHeader({ typ: 'JWT', alg: 'ES256' })
    .setExpirationTime('12h')
    .sign(await key());
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      TTL: String(3 * 24 * 3600),
      Urgency: 'high',
      Authorization: `vapid t=${jwt}, k=${env.vapidPublicKey}`,
      'Content-Length': '0'
    }
  });
  if (res.status === 404 || res.status === 410) return 'gone';
  if (!res.ok) {
    console.error('[push]', res.status, await res.text().catch(() => ''));
    return 'erro';
  }
  return 'ok';
}

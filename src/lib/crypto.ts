import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from './env';

function key(): Buffer {
  const k = Buffer.from(env.tokenEncKey, 'base64');
  if (k.length !== 32) throw new Error('TOKEN_ENC_KEY precisa ter 32 bytes em base64');
  return k;
}

/** AES-256-GCM. Saída: v1.<iv>.<tag>.<dados> em base64url. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decrypt(box: string): string {
  const [v, iv, tag, data] = box.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Token inválido');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}

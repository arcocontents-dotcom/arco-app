// Web Push (RFC 8291 / 8292) sem dependências de servidor: chaves VAPID e criptografia do aviso.
import { p256 } from '@noble/curves/p256';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';

const enc = new TextEncoder();
const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const fromB64u = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

export type Vapid = { publicKey: string; d: string; x: string; y: string };

/**
 * Chaves VAPID. Se VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY existirem, usa elas.
 * Senão, deriva um par fixo a partir do SESSION_SECRET (nada para configurar).
 */
export function vapidFrom(secret: Uint8Array, pub?: string, priv?: string): Vapid {
  let d: Uint8Array;
  let P: Uint8Array;
  if (pub && priv) {
    d = fromB64u(priv);
    P = fromB64u(pub);
  } else {
    d = hkdf(sha256, secret, enc.encode('arco-vapid-salt'), enc.encode('arco vapid p256 v1'), 32);
    // probabilidade ~2^-128 de cair fora do grupo; normaliza por segurança
    d = p256.utils.normPrivateKeyToScalar(d) ? d : sha256(d);
    P = p256.getPublicKey(d, false);
  }
  return { publicKey: b64u(P), d: b64u(d), x: b64u(P.subarray(1, 33)), y: b64u(P.subarray(33, 65)) };
}

/** Criptografa o texto do aviso para um aparelho (aes128gcm, RFC 8291). */
export async function encryptPayload(p256dh: string, auth: string, plaintext: string): Promise<Uint8Array> {
  const ua = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  const asPriv = p256.utils.randomPrivateKey();
  const asPub = p256.getPublicKey(asPriv, false);
  const shared = p256.getSharedSecret(asPriv, ua, true).subarray(1); // só o X
  const ikm = hkdf(sha256, shared, authSecret, concat(enc.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = hkdf(sha256, ikm, salt, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(sha256, ikm, salt, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt']);
  const body = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, key, concat(enc.encode(plaintext), new Uint8Array([2])) as BufferSource)
  );
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, body);
}

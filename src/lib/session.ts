import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { env, isProd } from './env';
import { normalizeEmail } from './domain';

const COOKIE = 'arco_session';
// Depois de entrar uma vez, a pessoa não precisa entrar de novo (o acesso continua
// sendo conferido no Notion a cada visita, então remover o e-mail corta na hora).
const SESSION_DAYS = 400;

export async function signLoginToken(email: string, ttl = '20m'): Promise<string> {
  return new SignJWT({ email: normalizeEmail(email), p: 'login' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(env.sessionSecret);
}

export async function verifyLoginToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, env.sessionSecret, { algorithms: ['HS256'] });
    if (payload.p !== 'login' || typeof payload.email !== 'string') return null;
    return payload.email;
  } catch {
    return null;
  }
}

export async function signState(data: Record<string, string>, ttl = '15m'): Promise<string> {
  return new SignJWT({ ...data, p: 'state' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(env.sessionSecret);
}

export async function verifyState(token: string): Promise<Record<string, string> | null> {
  try {
    const { payload } = await jwtVerify(token, env.sessionSecret, { algorithms: ['HS256'] });
    if (payload.p !== 'state') return null;
    return payload as unknown as Record<string, string>;
  } catch {
    return null;
  }
}

export async function startSession(email: string) {
  const jwt = await new SignJWT({ email: normalizeEmail(email), p: 'session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(env.sessionSecret);
  const jar = await cookies();
  jar.set(COOKIE, jwt, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function sessionEmail(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, env.sessionSecret, { algorithms: ['HS256'] });
    if (payload.p !== 'session' || typeof payload.email !== 'string') return null;
    return payload.email;
  } catch {
    return null;
  }
}

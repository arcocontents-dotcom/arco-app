import { NextResponse, type NextRequest } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

// Renova o acesso a cada visita: quem entrou uma vez não precisa entrar de novo
// (os navegadores limitam um cookie a ~400 dias; com a renovação, ele nunca chega lá).
// Remover o e-mail no painel continua cortando o acesso na hora, porque cada página
// confere o e-mail no Notion.
const COOKIE = 'arco_session';
const DAYS = 400;

export async function middleware(req: NextRequest) {
  const raw = req.cookies.get(COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;
  if (!raw || !secret) return NextResponse.next();
  try {
    const key = new TextEncoder().encode(secret.trim());
    const { payload } = await jwtVerify(raw, key, { algorithms: ['HS256'] });
    if (payload.p !== 'session' || typeof payload.email !== 'string') return NextResponse.next();
    // Renova no máximo uma vez por dia.
    if (payload.iat && Date.now() / 1000 - payload.iat < 24 * 3600) return NextResponse.next();
    const jwt = await new SignJWT({ email: payload.email, p: 'session' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${DAYS}d`)
      .sign(key);
    const res = NextResponse.next();
    res.cookies.set(COOKIE, jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: DAYS * 24 * 3600
    });
    return res;
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\.(?:png|jpg|svg|webmanifest|ico|txt)$).*)']
};

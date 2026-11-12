'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { EMAIL_RE, normalizeEmail } from '@/lib/domain';
import { env } from '@/lib/env';
import { currentViewer, resolveViewer } from '@/lib/access';
import { safeNext } from '@/lib/next-path';
import { sendLoginEmail } from '@/lib/mail';
import { signLoginToken, startSession, verifyLoginToken } from '@/lib/session';
import { allow } from '@/lib/ratelimit';

export type LoginState = { status: 'idle' | 'sent' | 'error'; message?: string; email?: string };

export async function requestLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = normalizeEmail(String(form.get('email') ?? ''));
  if (!EMAIL_RE.test(email)) return { status: 'error', message: 'Digite um e-mail válido.', email };

  // Bloqueio simples contra envio de formulário por outro site.
  const h = await headers();
  const origin = h.get('origin');
  if (origin && origin !== env.appUrl && process.env.NODE_ENV === 'production') {
    return { status: 'error', message: 'Origem inválida.' };
  }

  // No máximo 3 links por e-mail a cada 10 minutos e 20 pedidos por conexão por hora.
  const ip = h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (!allow(`login:ip:${ip}`, 20, 3600_000) || !allow(`login:mail:${email}`, 3, 600_000)) {
    // Mesma resposta de sucesso: não revela nada, só não envia de novo.
    return { status: 'sent', email };
  }

  try {
    const viewer = await resolveViewer(email);
    // Resposta igual para e-mails liberados ou não: ninguém descobre quem é cliente.
    if (viewer) {
      const token = await signLoginToken(email);
      await sendLoginEmail(email, `${env.appUrl}/entrar/confirmar?t=${encodeURIComponent(token)}`);
    }
  } catch (e) {
    console.error('[login]', e);
    return { status: 'error', message: 'Não foi possível enviar agora. Tente de novo em instantes.', email };
  }
  return { status: 'sent', email };
}

export async function confirmLogin(form: FormData) {
  const token = String(form.get('t') ?? '');
  const next = safeNext(form.get('next'));
  const email = await verifyLoginToken(token);
  if (!email) {
    // Link antigo, mas a pessoa já entrou neste aparelho antes: segue direto.
    if (await currentViewer()) redirect(next);
    redirect('/entrar?e=expirado');
  }
  const viewer = await resolveViewer(email);
  if (!viewer) redirect('/entrar?e=sem-acesso');
  await startSession(email);
  redirect(next);
}

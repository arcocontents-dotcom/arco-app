'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { EMAIL_RE, normalizeEmail } from '@/lib/domain';
import { env } from '@/lib/env';
import { resolveViewer } from '@/lib/access';
import { sendLoginEmail } from '@/lib/mail';
import { signLoginToken, startSession, verifyLoginToken } from '@/lib/session';

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
  const email = await verifyLoginToken(token);
  if (!email) redirect('/entrar?e=expirado');
  const viewer = await resolveViewer(email);
  if (!viewer) redirect('/entrar?e=sem-acesso');
  await startSession(email);
  redirect('/');
}

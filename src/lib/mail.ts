import 'server-only';
import { env } from './env';

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export async function sendLoginEmail(to: string, link: string) {
  const html = `<!doctype html><html><body style="margin:0;background:#EEECE9;font-family:Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:48px 20px">
<table role="presentation" width="100%" style="max-width:480px;background:#ffffff" cellpadding="0" cellspacing="0">
<tr><td style="background:#111;padding:28px 32px"><img src="${env.appUrl}/logo-white.png" width="140" alt="Arco Contents" style="display:block"></td></tr>
<tr><td style="padding:36px 32px 12px">
<p style="margin:0 0 8px;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#6B6966">Área do cliente</p>
<h1 style="margin:0 0 18px;font-size:28px;line-height:1.1;text-transform:uppercase;font-weight:600">Seu link de acesso</h1>
<p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#333">Toque no botão para entrar. O link vale por 20 minutos.</p>
<a href="${escapeHtml(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:16px 28px;font-size:12px;font-weight:bold;letter-spacing:.2em;text-transform:uppercase">Entrar</a>
</td></tr>
<tr><td style="padding:24px 32px 36px;font-size:12px;line-height:1.6;color:#6B6966">Se você não pediu este acesso, ignore este e-mail.</td></tr>
</table></td></tr></table></body></html>`;

  if (!env.resendKey) {
    // Sem Resend configurado (desenvolvimento): mostra o link no log do servidor.
    console.log(`[login] link para ${to}: ${link}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [to],
      subject: 'Seu acesso · Arco Contents',
      html,
      text: `Seu link de acesso à Arco Contents (vale por 20 minutos): ${link}`
    })
  });
  if (!res.ok) {
    console.error('[login] falha ao enviar e-mail', res.status, await res.text().catch(() => ''));
    throw new Error('Falha ao enviar e-mail');
  }
}

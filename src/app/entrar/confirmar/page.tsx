import { redirect } from 'next/navigation';
import { currentViewer } from '@/lib/access';
import { verifyLoginToken } from '@/lib/session';
import { confirmLogin } from '../actions';
import { safeNext } from '@/lib/next-path';

// O link do e-mail/WhatsApp abre esta página. Se a pessoa já entrou neste aparelho, segue direto.
// Se não, um toque em "Entrar" cria o acesso (evita que leitores automáticos de link "usem" o convite).
export default async function ConfirmarPage({ searchParams }: { searchParams: Promise<{ t?: string; next?: string }> }) {
  const { t = '', next } = await searchParams;
  const dest = safeNext(next);
  const viewer = await currentViewer();
  const email = await verifyLoginToken(t);
  if (viewer && (!email || email === viewer.email)) redirect(dest);
  return (
    <main className="login">
      <div className="inner" style={{ justifyContent: 'center', gap: 28 }}>
        <img src="/logo-white.png" alt="Arco Contents" style={{ width: 150, height: 'auto' }} className="rise" />
        <h1 className="display rise" style={{ fontSize: 44, ['--d' as string]: '80ms' }}>Tudo pronto</h1>
        <p className="hint rise" style={{ ['--d' as string]: '120ms' }}>Toque em Entrar. Você só precisa fazer isso uma vez neste aparelho.</p>
        <form action={confirmLogin} className="rise" style={{ ['--d' as string]: '160ms' }}>
          <input type="hidden" name="t" value={t} />
          <input type="hidden" name="next" value={dest} />
          <button type="submit" className="btn light block">Entrar</button>
        </form>
      </div>
    </main>
  );
}

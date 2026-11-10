import { redirect } from 'next/navigation';
import { currentViewer } from '@/lib/access';
import LoginForm from './LoginForm';

const NOTICES: Record<string, string> = {
  expirado: 'Esse link expirou. Peça um novo abaixo.',
  'sem-acesso': 'Esse e-mail não tem acesso. Fale com a Arco.'
};

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await currentViewer()) redirect('/');
  const { e } = await searchParams;
  return (
    <main className="login">
      <div className="inner">
        <img src="/logo-white.png" alt="Arco Contents" width={150} height={55} className="rise" style={{ width: 150, height: 'auto' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18, padding: '48px 0' }}>
          <p className="label rise" style={{ ['--d' as string]: '60ms' }}>Área do cliente</p>
          <h1 className="display rise" style={{ fontSize: 'clamp(46px, 13vw, 64px)', lineHeight: 0.98, ['--d' as string]: '120ms' }}>
            Seu<br />conteúdo,<br />sua<br />aprovação.
          </h1>
          <div style={{ width: 40, height: 1, background: '#fff' }} />
        </div>
        <LoginForm notice={e ? NOTICES[e] : undefined} />
      </div>
    </main>
  );
}

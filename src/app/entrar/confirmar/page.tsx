import { confirmLogin } from '../actions';

// O link do e-mail abre esta página; a sessão só é criada ao tocar em "Entrar".
// Isso evita que leitores automáticos de e-mail "usem" o link no lugar da pessoa.
export default async function ConfirmarPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = '' } = await searchParams;
  return (
    <main className="login">
      <div className="inner" style={{ justifyContent: 'center', gap: 28 }}>
        <img src="/logo-white.png" alt="Arco Contents" style={{ width: 150, height: 'auto' }} className="rise" />
        <h1 className="display rise" style={{ fontSize: 44, ['--d' as string]: '80ms' }}>Tudo pronto</h1>
        <form action={confirmLogin} className="rise" style={{ ['--d' as string]: '160ms' }}>
          <input type="hidden" name="t" value={t} />
          <button type="submit" className="btn light block">Entrar</button>
        </form>
      </div>
    </main>
  );
}

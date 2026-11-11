import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="shell" style={{ justifyContent: 'center', padding: 24, gap: 18 }}>
      <p className="label">Página não encontrada</p>
      <h1 className="display lg">Nada por aqui</h1>
      <Link href="/" className="btn outline" style={{ alignSelf: 'flex-start' }}>Voltar ao início</Link>
    </main>
  );
}

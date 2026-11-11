import Icon from '@/components/Icon';
import Link from 'next/link';
export default function ClientTop({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  return (
    <header className="topbar rise">
      <Link href="/" aria-label="Início"><img src="/logo-black.png" alt="Arco Contents" className="logo" /></Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {isAdmin && <Link href="/admin" className="label strong" style={{ textDecoration: 'none' }}>Painel</Link>}
        <span className="label">{name}</span>
        <form action="/sair" method="post">
          <button type="submit" className="link-btn ic-inline" style={{ minHeight: 32 }}><Icon name="logout" size={15} />Sair</button>
        </form>
      </div>
    </header>
  );
}

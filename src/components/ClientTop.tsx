export default function ClientTop({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  return (
    <header className="topbar rise">
      <a href="/" aria-label="Início"><img src="/logo-black.png" alt="Arco Contents" className="logo" /></a>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {isAdmin && <a href="/admin" className="label strong" style={{ textDecoration: 'none' }}>Painel</a>}
        <span className="label">{name}</span>
        <form action="/sair" method="post">
          <button type="submit" className="link-btn" style={{ minHeight: 32 }}>Sair</button>
        </form>
      </div>
    </header>
  );
}

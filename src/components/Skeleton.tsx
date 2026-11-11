// Esqueletos mostrados na hora do clique, enquanto a página busca os dados no Notion.

export function AdminSkeleton() {
  return (
    <div className="admin" aria-busy="true" aria-label="Carregando">
      <aside className="sk-side">
        <img src="/logo-white.png" alt="" className="logo" />
        <i className="sk dark" style={{ height: 36, marginTop: 22 }} />
        <i className="sk dark" style={{ height: 38, marginTop: 22 }} />
        <i className="sk dark" style={{ height: 38 }} />
        <i className="sk dark" style={{ height: 38 }} />
      </aside>
      <main>
        <i className="sk" style={{ width: 140, height: 10 }} />
        <i className="sk" style={{ width: 'min(420px, 70%)', height: 64 }} />
        <div className="sk-grid">
          {Array.from({ length: 8 }).map((_, i) => <i key={i} className="sk" style={{ height: 120, animationDelay: `${i * 60}ms` }} />)}
        </div>
      </main>
    </div>
  );
}

export function ClientSkeleton() {
  return (
    <div className="shell" aria-busy="true" aria-label="Carregando">
      <header className="topbar"><img src="/logo-black.png" alt="" className="logo" /></header>
      <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <i className="sk" style={{ width: 120, height: 10 }} />
        <i className="sk" style={{ width: 220, height: 48 }} />
        <i className="sk" style={{ height: 44 }} />
        {Array.from({ length: 4 }).map((_, i) => <i key={i} className="sk" style={{ height: 96, animationDelay: `${i * 70}ms` }} />)}
      </div>
    </div>
  );
}

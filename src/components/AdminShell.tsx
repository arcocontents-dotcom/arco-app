import type { ReactNode } from 'react';
import { listClients } from '@/lib/notion';
import { sameId } from '@/lib/notion';

export default async function AdminShell({
  current, children, section = 'calendario'
}: { current?: string | null; children: ReactNode; section?: 'calendario' | 'gestao' }) {
  const all = await listClients().catch(() => []);
  const clients = all.filter((c) => !c.cancelled);
  const gone = all.filter((c) => c.cancelled);
  return (
    <div className="admin">
      <aside>
        <a href="/admin" aria-label="Painel"><img src="/logo-white.png" alt="Arco Contents" className="logo" /></a>
        <nav className="admin-nav" aria-label="Áreas">
          <a href="/admin" aria-current={section === 'calendario' ? 'page' : undefined}>Calendário</a>
          <a href="/admin/gestao" aria-current={section === 'gestao' ? 'page' : undefined}>Gestão</a>
        </nav>
        <span className="label" style={{ color: '#a8a5a0', padding: '0 8px 10px' }}>Clientes · {clients.length}</span>
        <nav className="clients-scroll" aria-label="Clientes">
          {clients.map((c) => (
            <a key={c.id} href={section === 'gestao' ? `/admin/clientes/${c.id}` : `/admin?c=${c.id}`} className="client" aria-current={sameId(current, c.id) ? 'page' : undefined}>
              <span className="mini-logo" aria-hidden="true">
                {c.logoUrl ? <img src={c.logoUrl} alt="" loading="lazy" /> : <span>{c.name.charAt(0)}</span>}
              </span>
              <span className="client-name">{c.name}</span>
            </a>
          ))}
          {gone.length > 0 && (
            <details style={{ marginTop: 18 }}>
              <summary className="label" style={{ color: '#a8a5a0', padding: '8px', cursor: 'pointer' }}>Removidos · {gone.length}</summary>
              {gone.map((c) => (
                <a key={c.id} href={`/admin/clientes/${c.id}`} className="client" style={{ opacity: 0.6 }} aria-current={sameId(current, c.id) ? 'page' : undefined}>
                  <span className="mini-logo" aria-hidden="true">
                    {c.logoUrl ? <img src={c.logoUrl} alt="" loading="lazy" /> : <span>{c.name.charAt(0)}</span>}
                  </span>
                  <span className="client-name">{c.name}</span>
                </a>
              ))}
            </details>
          )}
        </nav>
        <div style={{ flex: 1 }} />
        <form action="/sair" method="post" style={{ padding: '16px 8px 0' }}>
          <button type="submit" className="link-btn" style={{ color: '#a8a5a0' }}>Sair</button>
        </form>
      </aside>
      <main>{children}</main>
    </div>
  );
}

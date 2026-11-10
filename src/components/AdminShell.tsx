import type { ReactNode } from 'react';
import { listClients } from '@/lib/notion';
import { sameId } from '@/lib/notion';

export default async function AdminShell({ current, children }: { current?: string | null; children: ReactNode }) {
  const clients = await listClients().catch(() => []);
  return (
    <div className="admin">
      <aside>
        <a href="/admin" aria-label="Painel"><img src="/logo-white.png" alt="Arco Contents" className="logo" /></a>
        <span className="label" style={{ color: '#a8a5a0', padding: '0 8px 10px' }}>Clientes · {clients.length}</span>
        <nav className="clients-scroll" aria-label="Clientes">
          {clients.map((c) => (
            <a key={c.id} href={`/admin?c=${c.id}`} className="client" aria-current={sameId(current, c.id) ? 'page' : undefined}>
              {c.name}
            </a>
          ))}
        </nav>
        <a href="/admin/clientes/novo" className="new">+ Novo cliente</a>
        <div style={{ flex: 1 }} />
        <form action="/sair" method="post" style={{ padding: '16px 8px 0' }}>
          <button type="submit" className="link-btn" style={{ color: '#a8a5a0' }}>Sair</button>
        </form>
      </aside>
      <main>{children}</main>
    </div>
  );
}

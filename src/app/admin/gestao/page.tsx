import Icon from '@/components/Icon';
import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { listAllOpenContents, listClients, sameId } from '@/lib/notion';
import AdminShell from '@/components/AdminShell';
import GestaoTabs from '@/components/GestaoTabs';

export const dynamic = 'force-dynamic';

export default async function Gestao() {
  await requireAdmin();
  const [all, open] = await Promise.all([listClients(), listAllOpenContents().catch(() => [])]);
  const active = all.filter((c) => !c.cancelled);
  const removed = all.filter((c) => c.cancelled);
  const count = (id: string, st: string) => open.filter((x) => sameId(x.clientId, id) && x.status === st).length;

  return (
    <AdminShell section="gestao">
      <div className="toolbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="label rise">Arco Contents · administração</p>
          <h1 className="display rise" style={{ fontSize: 'clamp(44px, 7vw, 88px)', ['--d' as string]: '60ms' }}>Gestão</h1>
        </div>
        <div className="actions rise" style={{ ['--d' as string]: '120ms' }}>
          <Link className="btn small" href="/admin/clientes/novo"><Icon name="plus" size={16} />Novo cliente</Link>
        </div>
      </div>

      <GestaoTabs tab="clientes" />

      <section className="rise" style={{ ['--d' as string]: '240ms' }}>
        <h2 className="label" style={{ marginBottom: 10 }}>Todos os clientes · {active.length}</h2>
        <div className="cal-wrap">
          <table className="gtable">
            <thead>
              <tr>
                <th className="label">Cliente</th>
                <th className="label">Acesso</th>
                <th className="label">Instagram</th>
                <th className="label">Em aberto</th>
                <th className="label"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {active.map((c) => {
                const emails = c.approvers.length + c.viewers.length;
                const ag = count(c.id, 'Aguardando');
                const aj = count(c.id, 'Ajustes') + count(c.id, 'Reprovado');
                return (
                  <tr key={c.id}>
                    <td>
                      <Link className="who" href={`/admin/clientes/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <span className="mini-logo" aria-hidden="true">
                          {c.logoUrl ? <img src={c.logoUrl} alt="" loading="lazy" /> : <span>{c.name.charAt(0)}</span>}
                        </span>
                        <strong>{c.name}</strong>
                      </Link>
                    </td>
                    <td>{emails ? `${emails} e-mail${emails > 1 ? 's' : ''}` : <span className="s-Ajustes">Sem acesso</span>}</td>
                    <td>{c.igConnected ? <span className="s-Aprovado">Conectado</span> : c.instagram ? `@${c.instagram}` : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {ag > 0 && <span className="pill s-Aguardando">{ag} aguardando</span>}
                        {aj > 0 && <span className="pill s-Ajustes">{aj} a corrigir</span>}
                        {!ag && !aj && <span className="hint">—</span>}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link className="btn small outline" href={`/admin?c=${c.id}`}><Icon name="calendar" size={15} />Calendário</Link>{' '}
                      <Link className="btn small" href={`/admin/clientes/${c.id}`}><Icon name="users" size={15} />Gerenciar</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {removed.length > 0 && (
        <details className="panel">
          <summary className="label" style={{ cursor: 'pointer' }}>Removidos · {removed.length}</summary>
          <ul className="people">
            {removed.map((c) => (
              <li key={c.id}>
                <div style={{ flex: 1 }}>{c.name}</div>
                <Link className="btn small outline" href={`/admin/clientes/${c.id}`}>Reativar ou ver</Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </AdminShell>
  );
}

import { requireAdmin } from '@/lib/access';
import { listAllOpenContents, listClients, sameId } from '@/lib/notion';
import { dayLabel } from '@/lib/domain';
import AdminShell from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

export default async function Gestao() {
  await requireAdmin();
  const [all, open] = await Promise.all([listClients(), listAllOpenContents().catch(() => [])]);
  const active = all.filter((c) => !c.cancelled);
  const removed = all.filter((c) => c.cancelled);
  const count = (id: string, st: string) => open.filter((x) => sameId(x.clientId, id) && x.status === st).length;
  const totals = {
    aguardando: open.filter((x) => x.status === 'Aguardando').length,
    ajustes: open.filter((x) => x.status === 'Ajustes').length,
    reprovados: open.filter((x) => x.status === 'Reprovado').length,
    semAcesso: active.filter((c) => !c.approvers.length && !c.viewers.length).length
  };
  const attention = open
    .filter((x) => (x.status === 'Ajustes' || x.status === 'Reprovado') && active.some((c) => sameId(c.id, x.clientId)))
    .slice(0, 30);
  const nameOf = (id: string | null) => all.find((c) => sameId(c.id, id))?.name ?? '';

  return (
    <AdminShell section="gestao">
      <div className="toolbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="label rise">Arco Contents · administração</p>
          <h1 className="display rise" style={{ fontSize: 'clamp(44px, 7vw, 88px)', ['--d' as string]: '60ms' }}>Gestão</h1>
        </div>
        <div className="actions rise" style={{ ['--d' as string]: '120ms' }}>
          <a className="btn small" href="/admin/clientes/novo">+ Novo cliente</a>
        </div>
      </div>

      <div className="tiles rise" style={{ ['--d' as string]: '150ms' }}>
        <div className="tile-stat"><span className="label">Clientes ativos</span><strong>{active.length}</strong></div>
        <div className="tile-stat"><span className="label">Aguardando cliente</span><strong className="s-Aguardando">{totals.aguardando}</strong></div>
        <div className="tile-stat"><span className="label">Ajustes pedidos</span><strong className="s-Ajustes">{totals.ajustes}</strong></div>
        <div className="tile-stat"><span className="label">Reprovados</span><strong className="s-Reprovado">{totals.reprovados}</strong></div>
        <div className="tile-stat"><span className="label">Clientes sem acesso liberado</span><strong>{totals.semAcesso}</strong></div>
      </div>

      {attention.length > 0 && (
        <section className="panel rise" style={{ ['--d' as string]: '200ms' }}>
          <h2 className="label">Precisa de você · ajustes e reprovados</h2>
          <ul className="people">
            {attention.map((x) => (
              <li key={x.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{x.title}</div>
                  <span className="label">{nameOf(x.clientId)} · {x.type} · {x.day ? dayLabel(x.day) : 'sem data'}</span>
                </div>
                <span className={`status s-${x.status}`}>{x.status}</span>
                <a className="btn small outline" href={`/c/${x.clientId}/${x.id}`}>Ver</a>
                <a className="btn small" href={`/admin/conteudo/${x.id}`}>Corrigir</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rise" style={{ ['--d' as string]: '240ms' }}>
        <h2 className="label" style={{ marginBottom: 10 }}>Clientes</h2>
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
                      <a className="who" href={`/admin/clientes/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <span className="mini-logo" aria-hidden="true">
                          {c.logoUrl ? <img src={c.logoUrl} alt="" loading="lazy" /> : <span>{c.name.charAt(0)}</span>}
                        </span>
                        <strong>{c.name}</strong>
                      </a>
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
                      <a className="btn small outline" href={`/admin?c=${c.id}`}>Calendário</a>{' '}
                      <a className="btn small" href={`/admin/clientes/${c.id}`}>Gerenciar</a>
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
                <a className="btn small outline" href={`/admin/clientes/${c.id}`}>Reativar ou ver</a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </AdminShell>
  );
}

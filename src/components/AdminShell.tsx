import type { ReactNode } from 'react';
import Link from 'next/link';
import { env } from '@/lib/env';
import { listAllOpenContents, listClients, sameId } from '@/lib/notion';
import { localParts, todayIn } from '@/lib/domain';
import Icon from './Icon';
import CommandPalette from './CommandPalette';

type Section = 'calendario' | 'gestao' | 'pendencias';

/** Conteúdos que pedem ação: atrasados (data passou e não postou) e ajustes/reprovados. */
export async function alerts() {
  const open = await listAllOpenContents().catch(() => []);
  const today = todayIn(env.timeZone);
  const now = localParts(new Date().toISOString(), env.timeZone).time ?? '00:00';
  const isLate = (d: string | null, t: string | null) => !!d && (d < today || (d === today && !!t && t < now));
  const late = open.filter((x) => isLate(x.day, x.time));
  const fix = open.filter((x) => x.status === 'Ajustes' || x.status === 'Reprovado');
  return { late, fix, today, now };
}

export default async function AdminShell({
  current, children, section = 'calendario'
}: { current?: string | null; children: ReactNode; section?: Section }) {
  const [all, a] = await Promise.all([listClients().catch(() => []), alerts()]);
  const clients = all.filter((c) => !c.cancelled);
  const gone = all.filter((c) => c.cancelled);
  const active = (id: string | null) => clients.some((c) => sameId(c.id, id));
  const pending = new Set([...a.late, ...a.fix].filter((x) => active(x.clientId)).map((x) => x.id)).size;
  const perClient = (id: string) => [...a.fix, ...a.late].filter((x) => sameId(x.clientId, id)).length;
  const href = (id: string) => (section === 'gestao' ? `/admin/clientes/${id}` : `/admin?c=${id}`);
  const currentName = clients.find((c) => sameId(c.id, current))?.name;

  return (
    <div className="admin">
      <aside>
        <div className="side-top">
          <Link href="/admin" aria-label="Calendário" className="side-logo"><img src="/logo-white.png" alt="Arco Contents" className="logo" /></Link>
          <CommandPalette
            clients={clients.map((c) => ({ id: c.id, name: c.name, logo: c.logoUrl }))}
            current={current ?? null}
          />
        </div>

        <nav className="side-nav" aria-label="Áreas">
          <Link href="/admin" aria-current={section === 'calendario' ? 'page' : undefined}>
            <Icon name="calendar" /> <span>Calendário</span>
          </Link>
          <Link href="/admin/gestao" aria-current={section === 'gestao' ? 'page' : undefined}>
            <Icon name="grid" /> <span>Gestão</span>
          </Link>
          <Link href="/admin/pendencias" aria-current={section === 'pendencias' ? 'page' : undefined}>
            <Icon name="bell" className={pending ? 'ic-play' : ''} /> <span>Pendências</span>
            {pending > 0 && <b className="count" aria-label={`${pending} pendências`}>{pending}</b>}
          </Link>
        </nav>

        <div className="side-clients">
          <input type="checkbox" id="side-clients-toggle" className="sc-toggle" />
          <label htmlFor="side-clients-toggle" className="label sc-label">
            <span>Clientes · {clients.length}</span>
            {currentName && <span className="side-current">{currentName}</span>}
            <Icon name="month" size={14} className="sc-icon" />
          </label>
          <nav className="clients-scroll" aria-label="Clientes">
            {clients.map((c) => {
              const n = perClient(c.id);
              return (
                <Link key={c.id} href={href(c.id)} className="client" aria-current={sameId(current, c.id) ? 'page' : undefined}>
                  <span className="mini-logo" aria-hidden="true">
                    {c.logoUrl ? <img src={c.logoUrl} alt="" loading="lazy" /> : <span>{c.name.charAt(0)}</span>}
                  </span>
                  <span className="client-name">{c.name}</span>
                  {n > 0 && <i className="dot" title={`${n} pendência${n > 1 ? 's' : ''}`} />}
                </Link>
              );
            })}
            <Link href="/admin/clientes/novo" className="client add-client">
              <span className="mini-logo ghost" aria-hidden="true"><Icon name="plus" size={14} /></span>
              <span className="client-name">Novo cliente</span>
            </Link>
            {gone.length > 0 && (
              <details style={{ marginTop: 14 }}>
                <summary className="label" style={{ color: '#a8a5a0', padding: '8px', cursor: 'pointer' }}>Removidos · {gone.length}</summary>
                {gone.map((c) => (
                  <Link key={c.id} href={`/admin/clientes/${c.id}`} className="client" style={{ opacity: 0.6 }} aria-current={sameId(current, c.id) ? 'page' : undefined}>
                    <span className="mini-logo" aria-hidden="true">
                      {c.logoUrl ? <img src={c.logoUrl} alt="" loading="lazy" /> : <span>{c.name.charAt(0)}</span>}
                    </span>
                    <span className="client-name">{c.name}</span>
                  </Link>
                ))}
              </details>
            )}
          </nav>
        </div>

        <div className="side-fill" />
        <form action="/sair" method="post" className="side-out">
          <button type="submit" className="side-link"><Icon name="logout" size={16} /> <span>Sair</span></button>
        </form>
      </aside>
      <main>{children}</main>
    </div>
  );
}

import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { listAllContentsInRange, listClients, sameId } from '@/lib/notion';
import { MONTHS, PROD_GROUPS, addDays, addMonths, localParts, monthIdx, parseDay, production, todayIn, yearNum, type ProdNumbers } from '@/lib/domain';
import AdminShell from '@/components/AdminShell';
import GestaoTabs from '@/components/GestaoTabs';
import PrintButton from '@/components/PrintButton';
import Ring from '@/components/Ring';
import { ArrowLeft, ArrowRight } from '@/components/icons';

export const dynamic = 'force-dynamic';

const LABEL = { Total: 'Total', Reels: 'Reels', Post: 'Post', Story: 'Story' } as const;

function Card({ title, n, d }: { title: string; n: ProdNumbers; d: number }) {
  return (
    <div className="ring-card rise" style={{ ['--d' as string]: `${d}ms` }}>
      <span className="label">{title}</span>
      <Ring posted={n.posted} late={n.late} planned={n.planned} />
      <span className="count"><strong>{n.posted}</strong> de {n.planned} postados</span>
      <span className={`late${n.late ? ' on' : ''}`}>{n.late} {n.late === 1 ? 'atrasado' : 'atrasados'}</span>
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ m?: string; c?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayIn(env.timeZone);
  const nowTime = localParts(new Date().toISOString(), env.timeZone).time ?? '00:00';
  const first = `${(parseDay(sp.m) ?? today).slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);

  const [all, contents] = await Promise.all([listClients(), listAllContentsInRange(first, last).catch(() => [])]);
  const active = all.filter((c) => !c.cancelled);
  const client = sp.c ? active.find((c) => sameId(c.id, sp.c!)) ?? null : null;
  const mine = (id: string) => contents.filter((x) => sameId(x.clientId, id));
  const scoped = client ? mine(client.id) : contents.filter((x) => active.some((c) => sameId(c.id, x.clientId)));
  const nums = production(scoped, today, nowTime);
  const perClient = client
    ? []
    : active.map((c) => ({ c, n: production(mine(c.id), today, nowTime).Total })).filter((r) => r.n.planned > 0);

  const month = `${MONTHS[monthIdx(first)]} ${yearNum(first)}`;
  const q = (m: string) => `/admin/gestao/dashboard?m=${m}${client ? `&c=${client.id}` : ''}`;

  return (
    <AdminShell section="gestao">
      <div className="toolbar no-print">
        <h1 className="display rise" style={{ fontSize: 'clamp(44px, 7vw, 88px)' }}>Gestão</h1>
      </div>
      <GestaoTabs tab="dashboard" />

      <div className="print-only">
        <p className="label">Arco Contents · produção</p>
        <h1 className="display" style={{ fontSize: 40, marginTop: 6 }}>{month}</h1>
        <p className="label" style={{ marginTop: 6 }}>{client ? client.name : 'Todos os clientes'}</p>
      </div>

      <div className="toolbar no-print rise" style={{ ['--d' as string]: '80ms' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <a className="icon-btn" href={q(addMonths(first, -1))} aria-label="Mês anterior"><ArrowLeft /></a>
          <h2 className="display" style={{ fontSize: 'clamp(26px, 3.6vw, 40px)' }}>{month}</h2>
          <a className="icon-btn" href={q(addMonths(first, 1))} aria-label="Próximo mês"><ArrowRight /></a>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <form method="get" action="/admin/gestao/dashboard" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="hidden" name="m" value={first} />
            <select name="c" className="select" aria-label="Cliente" defaultValue={client?.id ?? ''} style={{ minWidth: 190 }}>
              <option value="">Todos os clientes</option>
              {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn small" type="submit">Ver</button>
          </form>
          <PrintButton />
        </div>
      </div>

      <section className="rings">
        <Card title={LABEL.Total} n={nums.Total} d={120} />
        {PROD_GROUPS.map((g, i) => <Card key={g} title={LABEL[g]} n={nums[g]} d={170 + i * 50} />)}
      </section>

      {perClient.length > 0 && (
        <section className="client-rows rise" style={{ ['--d' as string]: '320ms' }}>
          {perClient.map(({ c, n }) => (
            <a key={c.id} href={`/admin/gestao/dashboard?m=${first}&c=${c.id}`}>
              <span className="mini-logo" aria-hidden="true" style={{ width: 34, height: 34, background: 'var(--ink)' }}>
                {c.logoUrl ? <img src={c.logoUrl} alt="" loading="lazy" /> : <span>{c.name.charAt(0)}</span>}
              </span>
              <span className="grow">{c.name}</span>
              <span className="num">{n.posted}/{n.planned}</span>
              <span className={`num${n.late ? ' on' : ''}`}>{n.late} atras.</span>
              <Ring posted={n.posted} late={n.late} planned={n.planned} size={44} />
            </a>
          ))}
        </section>
      )}
    </AdminShell>
  );
}

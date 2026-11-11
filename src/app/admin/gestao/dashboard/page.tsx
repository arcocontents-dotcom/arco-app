import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { listAllContentsInRange, listClients, sameId } from '@/lib/notion';
import { MONTHS, PROD_GROUPS, addDays, addMonths, localParts, monthIdx, parseDay, production, todayIn, yearNum, type ProdGroup } from '@/lib/domain';
import AdminShell from '@/components/AdminShell';
import GestaoTabs from '@/components/GestaoTabs';
import DashFilters from '@/components/DashFilters';
import DownloadPdf from '@/components/DownloadPdf';
import Ring from '@/components/Ring';
import { ArrowLeft, ArrowRight } from '@/components/icons';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<ProdGroup | 'Total', string> = { Total: 'Todos os formatos', Reels: 'Reels', Post: 'Post e carrossel', Story: 'Story' };

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ m?: string; c?: string; t?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayIn(env.timeZone);
  const nowTime = localParts(new Date().toISOString(), env.timeZone).time ?? '00:00';
  const first = `${(parseDay(sp.m) ?? today).slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);
  const type: ProdGroup | 'Total' = (PROD_GROUPS as string[]).includes(sp.t ?? '') ? (sp.t as ProdGroup) : 'Total';

  const [all, contents] = await Promise.all([listClients(), listAllContentsInRange(first, last).catch(() => [])]);
  const active = all.filter((c) => !c.cancelled);
  const client = sp.c ? active.find((c) => sameId(c.id, sp.c!)) ?? null : null;
  const scoped = contents.filter((x) => (client ? sameId(x.clientId, client.id) : active.some((c) => sameId(c.id, x.clientId))));
  const n = production(scoped, today, nowTime)[type];

  const month = `${MONTHS[monthIdx(first)]} ${yearNum(first)}`;
  const clientName = client?.name ?? 'Todos os clientes';
  const q = (m: string) => `/admin/gestao/dashboard?m=${m}${client ? `&c=${client.id}` : ''}${type !== 'Total' ? `&t=${type}` : ''}`;
  const tq = (g: ProdGroup | 'Total') => `/admin/gestao/dashboard?m=${first}${client ? `&c=${client.id}` : ''}${g !== 'Total' ? `&t=${g}` : ''}`;
  const fileName = `producao-${slug(month)}${client ? `-${slug(client.name)}` : ''}${type !== 'Total' ? `-${slug(type)}` : ''}.pdf`;

  return (
    <AdminShell section="gestao">
      <div className="toolbar">
        <h1 className="display rise" style={{ fontSize: 'clamp(44px, 7vw, 88px)' }}>Gestão</h1>
      </div>
      <GestaoTabs tab="dashboard" />

      <div className="toolbar rise" style={{ ['--d' as string]: '80ms' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link className="icon-btn" href={q(addMonths(first, -1))} aria-label="Mês anterior"><ArrowLeft /></Link>
          <h2 className="display" style={{ fontSize: 'clamp(26px, 3.6vw, 40px)' }}>{month}</h2>
          <Link className="icon-btn" href={q(addMonths(first, 1))} aria-label="Próximo mês"><ArrowRight /></Link>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <DashFilters month={first} client={client?.id ?? ''} type={type === 'Total' ? '' : type} clients={active.map((c) => ({ id: c.id, name: c.name }))} />
          <DownloadPdf month={month} client={clientName} type={TYPE_LABEL[type]} posted={n.posted} late={n.late} planned={n.planned} fileName={fileName} />
        </div>
      </div>

      <section className="dash-total rise" style={{ ['--d' as string]: '140ms' }}>
        <nav className="seg" aria-label="Categoria">
          {(['Total', ...PROD_GROUPS] as const).map((g) => (
            <Link key={g} href={tq(g)} aria-current={g === type ? 'page' : undefined}>{g === 'Total' ? 'Todos' : g}</Link>
          ))}
        </nav>
        <Ring posted={n.posted} late={n.late} planned={n.planned} size={240} />
        <div className="dash-nums">
          <div><strong className="s-Aprovado">{n.posted}</strong><span className="label">Postados</span></div>
          <div><strong>{n.planned}</strong><span className="label">Planejados</span></div>
          <div><strong className={n.late ? 's-Reprovado' : undefined}>{n.late}</strong><span className="label">Atrasados</span></div>
        </div>
      </section>
    </AdminShell>
  );
}

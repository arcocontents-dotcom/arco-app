import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { listClients } from '@/lib/notion';
import { MONTHS, addDays, addMonths, dayNum, monthGrid, parseDay, startOfWeek, todayIn, yearNum } from '@/lib/domain';
import { listShoots, shootsConfigured } from '@/lib/captacao';
import AdminShell from '@/components/AdminShell';
import Icon from '@/components/Icon';
import ProdTabs from '@/components/ProdTabs';
import CaptacaoBoard from '@/components/CaptacaoBoard';

export const dynamic = 'force-dynamic';
const MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default async function Captacao({ searchParams }: { searchParams: Promise<{ v?: string; d?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const view = sp.v === 'mes' ? 'mes' : 'semana';
  const today = todayIn(env.timeZone);
  const base = parseDay(sp.d) ?? today;
  const first = `${base.slice(0, 7)}-01`;
  const days =
    view === 'semana'
      ? Array.from({ length: 7 }, (_, i) => ({ day: addDays(startOfWeek(base), i), inMonth: true }))
      : monthGrid(first);
  const from = days[0].day;
  const to = days[days.length - 1].day;
  const [shoots, clients] = await Promise.all([listShoots(from, to).catch(() => null), listClients()]);
  const q = (v: string, d: string) => `/admin/producao/captacao?v=${v}&d=${d}`;
  const label =
    view === 'semana'
      ? `${dayNum(from)} ${MON[Number(from.slice(5, 7)) - 1]} – ${dayNum(to)} ${MON[Number(to.slice(5, 7)) - 1]}`
      : `${MONTHS[Number(first.slice(5, 7)) - 1]} ${yearNum(first)}`;

  return (
    <AdminShell section="producao">
      <div className="toolbar">
        <div className="page-title">
          <p className="label rise ic-inline"><Icon name="video" size={14} />Calendário de gravação · igual ao Notion Calendar</p>
          <h1 className="display rise" style={{ fontSize: 'clamp(40px, 6vw, 80px)', ['--d' as string]: '60ms' }}>Captação</h1>
        </div>
      </div>
      <ProdTabs active="captacao" />
      {!shootsConfigured() && <p className="hint">Falta a variável NOTION_SHOOTS_DB.</p>}
      {shoots === null && <p className="error">Não foi possível ler as captações no Notion agora.</p>}
      <CaptacaoBoard
        view={view}
        days={days}
        month={first}
        today={today}
        shoots={shoots ?? []}
        clients={clients.filter((c) => !c.cancelled).map((c) => c.name)}
        label={label}
        prevHref={view === 'semana' ? q('semana', addDays(from, -7)) : q('mes', addMonths(first, -1))}
        nextHref={view === 'semana' ? q('semana', addDays(from, 7)) : q('mes', addMonths(first, 1))}
        todayHref={q(view, today)}
        weekHref={q('semana', view === 'semana' ? from : base)}
        monthHref={q('mes', base)}
      />
    </AdminShell>
  );
}

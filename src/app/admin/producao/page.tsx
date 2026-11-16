import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { listClients } from '@/lib/notion';
import { MONTHS, addDays, addMonths, monthGrid, parseDay, startOfWeek, todayIn } from '@/lib/domain';
import { productionWeek, routineConfigured, tvKey } from '@/lib/producao';
import AdminShell from '@/components/AdminShell';
import Icon from '@/components/Icon';
import ProducaoBoard from '@/components/ProducaoBoard';
import ProdTabs from '@/components/ProdTabs';

export const dynamic = 'force-dynamic';

export default async function Producao({ searchParams }: { searchParams: Promise<{ w?: string; r?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayIn(env.timeZone);
  const mode = sp.r === 'mes' ? 'mes' : 'semana';
  const base = parseDay(sp.w) ?? today;
  const first = `${base.slice(0, 7)}-01`;
  const grid = monthGrid(first);
  const start = mode === 'mes' ? grid[0].day : startOfWeek(base);
  const end = mode === 'mes' ? grid[grid.length - 1].day : addDays(start, 6);
  const clients = (await listClients()).filter((c) => !c.cancelled);
  const week = await productionWeek(start, today, clients.map((c) => ({ id: c.id, name: c.name, calName: c.calName })), end);
  const q = (d: string, r = mode) => `/admin/producao?w=${d}${r === 'mes' ? '&r=mes' : ''}`;

  return (
    <AdminShell section="producao">
      <div className="toolbar">
        <div className="page-title">
          <p className="label rise ic-inline"><Icon name="users" size={14} />Equipe · Lemuel, Marcos, Yan e Rafa</p>
          <h1 className="display rise" style={{ fontSize: 'clamp(40px, 6vw, 80px)', ['--d' as string]: '60ms' }}>Produção</h1>
        </div>
      </div>
      <ProdTabs active="quadro" />
      {week.error && <p className="error">{week.error}</p>}
      {!routineConfigured() && <p className="hint">Falta a variável NOTION_ROUTINE_DB para as tarefas fixas e lembretes.</p>}
      <ProducaoBoard
        start={start}
        today={today}
        tasks={week.tasks}
        routines={week.routines}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        end={end}
        mode={mode}
        monthLabel={`${MONTHS[Number(first.slice(5, 7)) - 1]} ${first.slice(0, 4)}`}
        weekHref={q(mode === 'mes' ? (today.slice(0, 7) === first.slice(0, 7) ? today : first) : start, 'semana')}
        monthHref={q(mode === 'mes' ? first : base, 'mes')}
        prevHref={mode === 'mes' ? q(addMonths(first, -1)) : q(addDays(start, -7))}
        nextHref={mode === 'mes' ? q(addMonths(first, 1)) : q(addDays(start, 7))}
        todayHref={mode === 'mes' ? '/admin/producao?r=mes' : '/admin/producao'}
        tvUrl={`/tv/producao?k=${tvKey()}`}
      />
    </AdminShell>
  );
}

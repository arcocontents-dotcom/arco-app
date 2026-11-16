import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { listClients } from '@/lib/notion';
import { addDays, parseDay, startOfWeek, todayIn } from '@/lib/domain';
import { productionWeek, routineConfigured, tvKey } from '@/lib/producao';
import AdminShell from '@/components/AdminShell';
import Icon from '@/components/Icon';
import ProducaoBoard from '@/components/ProducaoBoard';

export const dynamic = 'force-dynamic';

export default async function Producao({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayIn(env.timeZone);
  const start = startOfWeek(parseDay(sp.w) ?? today);
  const clients = (await listClients()).filter((c) => !c.cancelled);
  const week = await productionWeek(start, today, clients.map((c) => ({ id: c.id, name: c.name, calName: c.calName })));
  const q = (d: string) => `/admin/producao?w=${d}`;

  return (
    <AdminShell section="producao">
      <div className="toolbar">
        <div className="page-title">
          <p className="label rise ic-inline"><Icon name="users" size={14} />Equipe · Lemuel, Marcos, Yan e Rafa</p>
          <h1 className="display rise" style={{ fontSize: 'clamp(40px, 6vw, 80px)', ['--d' as string]: '60ms' }}>Produção</h1>
        </div>
      </div>
      {week.error && <p className="error">{week.error}</p>}
      {!routineConfigured() && <p className="hint">Falta a variável NOTION_ROUTINE_DB para as tarefas fixas e lembretes.</p>}
      <ProducaoBoard
        start={start}
        today={today}
        tasks={week.tasks}
        routines={week.routines}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        prevHref={q(addDays(start, -7))}
        nextHref={q(addDays(start, 7))}
        todayHref="/admin/producao"
        tvUrl={`/tv/producao?k=${tvKey()}`}
      />
    </AdminShell>
  );
}

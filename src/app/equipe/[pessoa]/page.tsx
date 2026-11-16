import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { env } from '@/lib/env';
import { listClients } from '@/lib/notion';
import { startOfWeek, todayIn } from '@/lib/domain';
import { TEAM, productionWeek, validTeamKey } from '@/lib/producao';
import ProducaoBoard from '@/components/ProducaoBoard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Minhas tarefas · Arco Contents', robots: { index: false, follow: false } };

/** Link pessoal de cada pessoa da equipe: as próprias tarefas da semana, com caixinha para marcar. */
export default async function Equipe({ params, searchParams }: { params: Promise<{ pessoa: string }>; searchParams: Promise<{ k?: string }> }) {
  const { pessoa } = await params;
  const { k } = await searchParams;
  const raw = decodeURIComponent(pessoa).toLowerCase();
  const person = TEAM.find((t) => t.toLowerCase() === raw) ?? '';
  if (!validTeamKey(person, k)) notFound();
  const today = todayIn(env.timeZone);
  const start = startOfWeek(today);
  const clients = (await listClients()).filter((c) => !c.cancelled);
  const week = await productionWeek(start, today, clients.map((c) => ({ id: c.id, name: c.name, calName: c.calName })));
  const mine = week.tasks.filter((t) => t.person === person || t.person === 'Equipe');
  return (
    <main className="team-shell">
      <header className="team-head">
        <img src="/logo-black.png" alt="Arco Contents" />
        <div>
          <span className="label">Minhas tarefas</span>
          <h1>Oi, {person}!</h1>
        </div>
      </header>
      <ProducaoBoard
        member={{ person, k: k! }}
        start={start}
        today={today}
        tasks={mine}
        routines={[]}
        clients={[]}
        prevHref=""
        nextHref=""
        todayHref=""
      />
    </main>
  );
}

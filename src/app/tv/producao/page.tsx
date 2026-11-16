import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { env } from '@/lib/env';
import { listClients } from '@/lib/notion';
import { startOfWeek, todayIn } from '@/lib/domain';
import { productionWeek, validTvKey } from '@/lib/producao';
import ProducaoBoard from '@/components/ProducaoBoard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Produção · Arco Contents', robots: { index: false, follow: false } };

/** Tela da TV: só leitura, abre com o link fixo (sem login) e se atualiza sozinha. */
export default async function TvProducao({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams;
  if (!validTvKey(k)) notFound();
  const today = todayIn(env.timeZone);
  const start = startOfWeek(today);
  const clients = (await listClients()).filter((c) => !c.cancelled);
  const week = await productionWeek(start, today, clients.map((c) => ({ id: c.id, name: c.name, calName: c.calName })));
  return (
    <main className="tv-shell">
      <img src="/logo-white.png" alt="Arco Contents" className="tv-logo" />
      <ProducaoBoard
        tv
        start={start}
        today={today}
        tasks={week.tasks}
        routines={[]}
        clients={[]}
        prevHref=""
        nextHref=""
        todayHref=""
      />
    </main>
  );
}

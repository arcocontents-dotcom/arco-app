import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { listClients, sameId } from '@/lib/notion';
import { parseDay, todayIn } from '@/lib/domain';
import AdminShell from '@/components/AdminShell';
import ContentForm from '@/components/ContentForm';

export const dynamic = 'force-dynamic';

export default async function NovoConteudo({ searchParams }: { searchParams: Promise<{ c?: string; d?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const clients = await listClients();
  const client = clients.find((c) => sameId(c.id, sp.c ?? '')) ?? clients[0];
  if (!client) {
    return (
      <AdminShell>
        <p>Crie um cliente primeiro.</p>
        <a className="btn" href="/admin/clientes/novo" style={{ alignSelf: 'flex-start' }}>+ Novo cliente</a>
      </AdminShell>
    );
  }
  return (
    <AdminShell current={client.id}>
      <p className="label rise">{client.name}</p>
      <h1 className="display rise" style={{ fontSize: 'clamp(40px, 6vw, 72px)', ['--d' as string]: '60ms' }}>Novo conteúdo</h1>
      <ContentForm
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        initial={{
          clientId: client.id,
          title: '',
          day: parseDay(sp.d) ?? todayIn(env.timeZone),
          time: '18:00',
          type: 'Reels',
          caption: '',
          videoUrl: '',
          coverUrl: '',
          artUrls: [],
          storyImageUrl: ''
        }}
      />
    </AdminShell>
  );
}

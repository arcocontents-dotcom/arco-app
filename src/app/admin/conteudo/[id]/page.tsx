import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/access';
import { getContentFresh, listClients } from '@/lib/notion';
import { videoThumbUrl } from '@/lib/media';
import AdminShell from '@/components/AdminShell';
import ContentForm from '@/components/ContentForm';
import NotifyButton from '@/components/NotifyButton';

export const dynamic = 'force-dynamic';

export default async function EditarConteudo({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const c = await getContentFresh(id);
  if (!c || !c.clientId) notFound();
  const clients = await listClients();
  let thumb: string | null = null;
  try { thumb = c.videoUid ? videoThumbUrl(c.videoUid) : null; } catch { thumb = null; }
  return (
    <AdminShell current={c.clientId}>
      <div className="toolbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="label rise">Editar · <span className={`status s-${c.status}`}>{c.status}</span></p>
          <h1 className="display rise" style={{ fontSize: 'clamp(36px, 5vw, 64px)', ['--d' as string]: '60ms' }}>{c.title}</h1>
        </div>
        <div className="actions">
          {c.status !== 'Rascunho' && <NotifyButton contentId={c.id} title={c.title} />}
          <Link className="btn outline small" href={`/c/${c.clientId}/${c.id}`}>Ver aprovação</Link>
        </div>
      </div>
      <ContentForm
        clients={clients.map((x) => ({ id: x.id, name: x.name }))}
        videoThumb={thumb}
        initial={{
          id: c.id,
          status: c.status,
          clientId: c.clientId,
          title: c.title,
          day: c.day ?? '',
          time: c.time ?? '',
          type: c.type,
          caption: c.caption,
          videoUrl: c.videoUrl ?? '',
          coverUrl: c.coverUrl ?? '',
          artUrls: c.artUrls,
          storyImageUrl: c.storyImageUrl ?? ''
        }}
      />
    </AdminShell>
  );
}

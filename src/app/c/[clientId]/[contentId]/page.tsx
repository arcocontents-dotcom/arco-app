import { notFound } from 'next/navigation';
import { requireClientAccess } from '@/lib/access';
import { getContentFresh, sameId, type ContentRecord } from '@/lib/notion';
import { dayLabel, itemLabel, itemsFor, type ItemKey } from '@/lib/domain';
import { videoEmbedUrl, videoThumbUrl } from '@/lib/media';
import ClientTop from '@/components/ClientTop';
import VideoPlayer from '@/components/VideoPlayer';
import Carousel from '@/components/Carousel';
import ZoomImage from '@/components/ZoomImage';
import ReviewPanel from '@/components/ReviewPanel';
import { ArrowLeft } from '@/components/icons';

export const dynamic = 'force-dynamic';

function Empty({ text, ratio = '9 / 16' }: { text: string; ratio?: string }) {
  return (
    <div style={{ aspectRatio: ratio, background: '#d6d3ce', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span className="label">{text}</span>
    </div>
  );
}

function mediaFor(c: ContentRecord, key: ItemKey) {
  const poster = c.coverUrl ?? (c.videoUid ? videoThumbUrl(c.videoUid) : null);
  switch (key) {
    case 'video':
      return c.videoUrl ? (
        <VideoPlayer embedUrl={c.videoUid ? videoEmbedUrl(c.videoUid, poster) : null} fileUrl={c.videoUrl} poster={poster} label="vídeo" />
      ) : (
        <Empty text="Vídeo em breve" />
      );
    case 'capa':
      return c.coverUrl ? <ZoomImage src={c.coverUrl} alt="Capa do Reels" /> : <Empty text="Capa em breve" />;
    case 'arte':
      return <Carousel images={c.artUrls} title={c.title} />;
    case 'legenda':
      return <p className="caption-big">{c.caption || 'Legenda ainda não enviada.'}</p>;
    case 'story':
      if (c.videoUrl) {
        return (
          <VideoPlayer
            embedUrl={c.videoUid ? videoEmbedUrl(c.videoUid, c.storyImageUrl ?? poster) : null}
            fileUrl={c.videoUrl}
            poster={c.storyImageUrl ?? poster}
            label="story"
          />
        );
      }
      return c.storyImageUrl ? <ZoomImage src={c.storyImageUrl} alt="Story" /> : <Empty text="Story em breve" />;
  }
}

export default async function ReviewPage({ params }: { params: Promise<{ clientId: string; contentId: string }> }) {
  const { clientId, contentId } = await params;
  const { viewer, client, canApprove } = await requireClientAccess(clientId);
  const c = await getContentFresh(contentId);
  // O conteúdo precisa pertencer a ESTE cliente. Sem isso, nada aparece.
  if (!c || !sameId(c.clientId, client.id)) notFound();
  const isAdmin = viewer.role === 'admin';
  if (c.status === 'Rascunho' && !isAdmin) notFound();

  const items = itemsFor(c.type).map((k) => ({
    key: k,
    label: itemLabel(c.type, k),
    status: c.items[k].status,
    note: c.items[k].note,
    media: mediaFor(c, k)
  }));

  return (
    <main className="shell">
      <ClientTop name={client.name} isAdmin={isAdmin} />
      <div className="rise" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '14px 20px 0 8px' }}>
        <a href={`/c/${client.id}${c.day ? `?v=semana&d=${c.day}` : ''}`} className="icon-btn" aria-label="Voltar"><ArrowLeft /></a>
        <span className="label" style={{ flex: 1 }}>{c.day ? dayLabel(c.day) : 'Sem data'}{c.time ? ` · ${c.time}` : ''}</span>
        <span className="label strong">{c.type}</span>
      </div>
      <h1 className="display lg rise" style={{ padding: '14px 20px 26px', ['--d' as string]: '60ms' }}>{c.title}</h1>

      <ReviewPanel
        key={`${c.id}-${c.answeredAt ?? ''}-${c.status}`}
        contentId={c.id}
        items={items}
        canApprove={canApprove}
        isAdmin={isAdmin}
        status={c.status}
        answeredBy={c.answeredBy}
      />
      {isAdmin && (
        <div style={{ maxWidth: 640, width: '100%', margin: '0 auto', padding: '0 16px 48px' }}>
          <a href={`/admin/conteudo/${c.id}`} className="btn outline block">Editar conteúdo</a>
        </div>
      )}
    </main>
  );
}

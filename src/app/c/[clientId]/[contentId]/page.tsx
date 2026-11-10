import { notFound } from 'next/navigation';
import { requireClientAccess } from '@/lib/access';
import { getContentFresh, sameId } from '@/lib/notion';
import { dayLabel, itemLabel, itemsFor } from '@/lib/domain';
import { videoEmbedUrl, videoThumbUrl } from '@/lib/media';
import ClientTop from '@/components/ClientTop';
import VideoPlayer from '@/components/VideoPlayer';
import Carousel from '@/components/Carousel';
import ReviewPanel from '@/components/ReviewPanel';
import { ArrowLeft, CheckIcon } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: Promise<{ clientId: string; contentId: string }> }) {
  const { clientId, contentId } = await params;
  const { viewer, client, canApprove } = await requireClientAccess(clientId);
  const c = await getContentFresh(contentId);
  // O conteúdo precisa pertencer a ESTE cliente. Sem isso, nada aparece.
  if (!c || !sameId(c.clientId, client.id)) notFound();
  const isAdmin = viewer.role === 'admin';
  if (c.status === 'Rascunho' && !isAdmin) notFound();

  const keys = itemsFor(c.type);
  const items = keys.map((k) => ({ key: k, label: itemLabel(c.type, k), status: c.items[k].status, note: c.items[k].note }));
  const ok = (k: string) => c.items[k as keyof typeof c.items]?.status === 'Aprovado';
  const poster = c.coverUrl ?? (c.videoUid ? videoThumbUrl(c.videoUid) : null);

  const titleWords = c.title;

  return (
    <main className="shell wide">
      <ClientTop name={client.name} isAdmin={isAdmin} />
      <div className="rise" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '14px 20px 0 8px' }}>
        <a href={`/c/${client.id}${c.day ? `?v=semana&d=${c.day}` : ''}`} className="icon-btn" aria-label="Voltar"><ArrowLeft /></a>
        <span className="label" style={{ flex: 1 }}>{c.day ? dayLabel(c.day) : 'Sem data'}{c.time ? ` · ${c.time}` : ''}</span>
        <span className="label strong">{c.type}</span>
      </div>
      <h1 className="display lg rise" style={{ padding: '14px 24px 24px', ['--d' as string]: '60ms' }}>{titleWords}</h1>

      <div className="review">
        <div className="review-cols">
          <div className="media rise" style={{ ['--d' as string]: '140ms' }}>
            {c.type === 'Reels' && (
              <div className="media-pair">
                <figure className="v">
                  {c.videoUrl ? (
                    <div style={{ position: 'relative' }}>
                      <VideoPlayer embedUrl={c.videoUid ? videoEmbedUrl(c.videoUid, poster) : null} fileUrl={c.videoUrl} poster={poster} label="vídeo" />
                      {ok('video') && <span className="corner-check pop"><CheckIcon size={13} color="#fff" /></span>}
                    </div>
                  ) : (
                    <div className="frame-916" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="label" style={{ color: '#bdbab4' }}>Vídeo em breve</span></div>
                  )}
                  <figcaption className="label">Vídeo</figcaption>
                </figure>
                <figure className="c">
                  <div className="frame-916" style={{ background: '#d6d3ce' }}>
                    {c.coverUrl ? <img src={c.coverUrl} alt="Capa do Reels" decoding="async" /> : null}
                    {ok('capa') && <span className="corner-check pop"><CheckIcon size={13} color="#fff" /></span>}
                  </div>
                  <figcaption className="label">Capa</figcaption>
                </figure>
              </div>
            )}

            {(c.type === 'Post' || c.type === 'Carrossel') && (
              <div style={{ position: 'relative' }}>
                <Carousel images={c.artUrls} title={c.title} />
                {ok('arte') && <span className="corner-check pop" style={{ left: 12, right: 'auto', top: 12 }}><CheckIcon size={13} color="#fff" /></span>}
              </div>
            )}

            {c.type === 'Story' && (
              <div className="story-frame">
                {c.videoUrl ? (
                  <div style={{ position: 'relative' }}>
                    <VideoPlayer embedUrl={c.videoUid ? videoEmbedUrl(c.videoUid, poster) : null} fileUrl={c.videoUrl} poster={c.storyImageUrl ?? poster} label="story" />
                  </div>
                ) : c.storyImageUrl ? (
                  <div className="frame-916"><img src={c.storyImageUrl} alt="Story" decoding="async" /></div>
                ) : (
                  <div className="frame-916" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="label" style={{ color: '#bdbab4' }}>Story em breve</span></div>
                )}
              </div>
            )}
          </div>

          <div className="side">
            {c.type !== 'Story' && (
              <section className="caption-box rise" style={{ ['--d' as string]: '240ms' }}>
                <h2 className="label">Legenda</h2>
                <p>{c.caption || 'Legenda ainda não enviada.'}</p>
              </section>
            )}
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
              <a href={`/admin/conteudo/${c.id}`} className="btn outline block">Editar conteúdo</a>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

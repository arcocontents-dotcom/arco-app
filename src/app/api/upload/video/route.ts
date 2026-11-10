import { NextResponse } from 'next/server';
import { currentViewer } from '@/lib/access';
import { env } from '@/lib/env';
import { createVideoFileUpload, createVideoUpload, videoWatchUrl } from '@/lib/media';

// Com Stream (pago): versão leve automática. Sem Stream: arquivo direto no R2 (grátis).
export async function POST(req: Request) {
  const v = await currentViewer();
  if (!v || v.role !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { contentType?: string };
  try {
    if (env.streamEnabled) {
      const { uploadURL, uid } = await createVideoUpload();
      return NextResponse.json({ mode: 'stream', uploadURL, url: videoWatchUrl(uid) });
    }
    const { uploadURL, publicUrl } = await createVideoFileUpload(String(body.contentType ?? ''));
    return NextResponse.json({ mode: 'file', uploadURL, url: publicUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

import { sameOrigin } from '@/lib/origin';
import { NextResponse } from 'next/server';
import { currentViewer } from '@/lib/access';
import { createDocUpload } from '@/lib/media';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 });
  const v = await currentViewer();
  if (!v || v.role !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  try {
    return NextResponse.json(await createDocUpload(String(body.name ?? 'planejamento')));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

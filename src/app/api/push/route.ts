import { sameOrigin } from '@/lib/origin';
import { NextResponse } from 'next/server';
import { currentViewer } from '@/lib/access';
import { getClientFresh, getClientPushSubs, setClientPushSubs } from '@/lib/notion';
import { isPushEndpoint } from '@/lib/push';
import { allow } from '@/lib/ratelimit';

// O cliente liga ou desliga os avisos deste aparelho.
async function guard(req: Request) {
  if (!sameOrigin(req)) return { error: NextResponse.json({ error: 'Origem inválida.' }, { status: 403 }) };
  const v = await currentViewer();
  if (!v) return { error: NextResponse.json({ error: 'Entre de novo.' }, { status: 401 }) };
  if (!allow(`push:${v.email}`, 20, 3600_000)) return { error: NextResponse.json({ error: 'Muitas tentativas.' }, { status: 429 }) };
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; endpoint?: string };
  const client = await getClientFresh(String(body.clientId ?? ''));
  const allowed =
    client && !client.cancelled && (v.role === 'admin' || client.approvers.includes(v.email) || client.viewers.includes(v.email));
  if (!client || !allowed) return { error: NextResponse.json({ error: 'Sem acesso.' }, { status: 403 }) };
  const endpoint = String(body.endpoint ?? '');
  if (!isPushEndpoint(endpoint)) return { error: NextResponse.json({ error: 'Aparelho inválido.' }, { status: 400 }) };
  return { v, client, endpoint };
}

export async function POST(req: Request) {
  const g = await guard(req);
  if ('error' in g) return g.error;
  const subs = (await getClientPushSubs(g.client.id)).filter((s) => s.endpoint !== g.endpoint);
  subs.push({ endpoint: g.endpoint, email: g.v.email, at: new Date().toISOString() });
  await setClientPushSubs(g.client.id, subs);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const g = await guard(req);
  if ('error' in g) return g.error;
  const subs = (await getClientPushSubs(g.client.id)).filter((s) => s.endpoint !== g.endpoint);
  await setClientPushSubs(g.client.id, subs);
  return NextResponse.json({ ok: true });
}

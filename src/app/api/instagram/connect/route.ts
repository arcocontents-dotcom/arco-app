import { NextResponse } from 'next/server';
import { currentViewer } from '@/lib/access';
import { env } from '@/lib/env';
import { getClientFresh } from '@/lib/notion';
import { authorizeUrl, instagramConfigured } from '@/lib/instagram';
import { signState } from '@/lib/session';

export async function GET(req: Request) {
  const v = await currentViewer();
  if (!v || v.role !== 'admin') return NextResponse.redirect(`${env.appUrl}/entrar`);
  const clientId = new URL(req.url).searchParams.get('c') ?? '';
  const client = await getClientFresh(clientId);
  if (!client || !instagramConfigured()) return NextResponse.redirect(`${env.appUrl}/admin`);
  const state = await signState({ c: client.id, by: v.email });
  return NextResponse.redirect(authorizeUrl(state));
}

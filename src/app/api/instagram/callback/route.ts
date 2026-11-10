import { NextResponse } from 'next/server';
import { currentViewer } from '@/lib/access';
import { env } from '@/lib/env';
import { exchangeCode, saveConnection } from '@/lib/instagram';
import { verifyState } from '@/lib/session';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = await verifyState(url.searchParams.get('state') ?? '');
  const v = await currentViewer();
  if (!state || !v || v.role !== 'admin' || state.by !== v.email) {
    return NextResponse.redirect(`${env.appUrl}/admin`);
  }
  const back = `${env.appUrl}/admin/clientes/${state.c}`;
  const code = url.searchParams.get('code');
  if (!code) return NextResponse.redirect(`${back}?e=ig`);
  try {
    const conn = await exchangeCode(code.replace(/#_$/, ''));
    await saveConnection(state.c, conn);
    return NextResponse.redirect(`${back}?ok=ig-ok`);
  } catch (e) {
    console.error('[instagram]', e);
    return NextResponse.redirect(`${back}?e=ig`);
  }
}

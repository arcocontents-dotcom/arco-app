import { NextResponse } from 'next/server';
import { endSession } from '@/lib/session';
import { env } from '@/lib/env';

export async function POST() {
  await endSession();
  return NextResponse.redirect(`${env.appUrl}/entrar`, { status: 303 });
}

'use server';

import { requireAdmin } from '@/lib/access';
import { diffLine, logHistory } from '@/lib/historico';
import { produtosToText } from '@/lib/produtos';
import { parseDay } from '@/lib/domain';
import { cleanProdutos } from '@/lib/produtos';
import { env } from '@/lib/env';
import { todayIn } from '@/lib/domain';
import { linkShootToPlanning, shootDoneOnPlanning } from '@/lib/vinculo';
import { CREW, SHOOT_STATUS, SHOOT_TYPES, createShoot, setShootStatus, trashShoot, updateShoot, type ShootInput } from '@/lib/captacao';

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function clean(x: Partial<ShootInput>): ShootInput | string {
  const title = String(x.title ?? '').trim().slice(0, 200);
  if (!title) return 'Escreva o que vai ser gravado.';
  const day = parseDay(String(x.day ?? ''));
  if (!day) return 'Escolha o dia.';
  const time = x.time && TIME.test(String(x.time)) ? String(x.time) : null;
  const endTime = time && x.endTime && TIME.test(String(x.endTime)) ? String(x.endTime) : null;
  const crew = (Array.isArray(x.crew) ? x.crew : []).filter((p): p is ShootInput['crew'][number] => (CREW as readonly string[]).includes(p));
  if (!crew.length) return 'Escolha quem vai.';
  const type = (SHOOT_TYPES as readonly string[]).includes(String(x.type)) ? (x.type as ShootInput['type']) : null;
  const status = (SHOOT_STATUS as readonly string[]).includes(String(x.status)) ? (x.status as ShootInput['status']) : 'Agendada';
  return {
    title, day, time, endTime, crew, type, status,
    client: String(x.client ?? '').trim().slice(0, 120),
    place: String(x.place ?? '').trim().slice(0, 300),
    note: String(x.note ?? '').trim().slice(0, 1500),
    products: cleanProdutos(x.products)
  };
}

export async function saveShootAction(id: string | null, x: Partial<ShootInput>): Promise<R<{ id: string; planned: number }>> {
  const who = await requireAdmin();
  const v = clean(x);
  if (typeof v === 'string') return { ok: false, error: v };
  try {
    const before = id ? await updateShoot(id, v) : null;
    const sid = id ?? (await createShoot(v));
    const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
    if (!id) await logHistory(sid, `${who.name} agendou para ${br(v.day)}${v.time ? ` às ${v.time}` : ''}`);
    else if (before) {
      const line = diffLine([
        ['captação', before.title, v.title],
        ['dia', br(before.day), br(v.day)],
        ['horário', before.time, v.time],
        ['quem vai', before.crew.join(', '), v.crew.join(', ')],
        ['cliente', before.client, v.client],
        ['local', before.place, v.place],
        ['produtos', produtosToText(before.products), produtosToText(v.products)],
        ['status', before.status, v.status]
      ]);
      if (line || before.note !== v.note) await logHistory(sid, `${who.name} editou: ${[line, before.note !== v.note ? 'descrição alterada' : ''].filter(Boolean).join(' · ')}`);
    }
    // produtos → cards no Planejamento do cliente (roteiro, bastidor, edição, aprovação)
    const planned = await linkShootToPlanning(sid, v).catch((e) => {
      console.error('[captacao] planejamento', e);
      return 0;
    });
    if (v.status === 'Realizada') await shootDoneOnPlanning(sid, todayIn(env.timeZone)).catch(() => undefined);
    return { ok: true, id: sid, planned };
  } catch (e) {
    console.error('[captacao] salvar', e);
    return { ok: false, error: 'Não foi possível salvar no Notion.' };
  }
}

export async function shootStatusAction(id: string, status: string): Promise<R> {
  const who = await requireAdmin();
  if (!(SHOOT_STATUS as readonly string[]).includes(status)) return { ok: false, error: 'Status inválido.' };
  try {
    await setShootStatus(id, status as ShootInput['status']);
    await logHistory(id, `${who.name} marcou como ${status}`);
    if (status === 'Realizada') await shootDoneOnPlanning(id, todayIn(env.timeZone)).catch((e) => console.error('[captacao] planejamento', e));
    return { ok: true };
  } catch (e) {
    console.error('[captacao] status', e);
    return { ok: false, error: 'Não foi possível salvar no Notion.' };
  }
}

export async function trashShootAction(id: string): Promise<R> {
  const who = await requireAdmin();
  try {
    await trashShoot(id);
    const { logActivity } = await import('@/lib/registro');
    await logActivity({ area: 'Captação', who: who.name, action: `${who.name} apagou a captação`, itemId: id });
    return { ok: true };
  } catch (e) {
    console.error('[captacao] apagar', e);
    return { ok: false, error: 'Não foi possível apagar.' };
  }
}

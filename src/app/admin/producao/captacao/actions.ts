'use server';

import { requireAdmin } from '@/lib/access';
import { parseDay } from '@/lib/domain';
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
    note: String(x.note ?? '').trim().slice(0, 1500)
  };
}

export async function saveShootAction(id: string | null, x: Partial<ShootInput>): Promise<R<{ id: string }>> {
  await requireAdmin();
  const v = clean(x);
  if (typeof v === 'string') return { ok: false, error: v };
  try {
    if (id) {
      await updateShoot(id, v);
      return { ok: true, id };
    }
    return { ok: true, id: await createShoot(v) };
  } catch (e) {
    console.error('[captacao] salvar', e);
    return { ok: false, error: 'Não foi possível salvar no Notion.' };
  }
}

export async function shootStatusAction(id: string, status: string): Promise<R> {
  await requireAdmin();
  if (!(SHOOT_STATUS as readonly string[]).includes(status)) return { ok: false, error: 'Status inválido.' };
  try {
    await setShootStatus(id, status as ShootInput['status']);
    return { ok: true };
  } catch (e) {
    console.error('[captacao] status', e);
    return { ok: false, error: 'Não foi possível salvar no Notion.' };
  }
}

export async function trashShootAction(id: string): Promise<R> {
  await requireAdmin();
  try {
    await trashShoot(id);
    return { ok: true };
  } catch (e) {
    console.error('[captacao] apagar', e);
    return { ok: false, error: 'Não foi possível apagar.' };
  }
}

'use server';

import { requireAdmin } from '@/lib/access';
import { getClientFresh, createContent, updateClient } from '@/lib/notion';
import { parseDay, todayIn } from '@/lib/domain';
import { env } from '@/lib/env';
import {
  createPlanItem, getPlanItem, kindToType, planOptions, updatePlanItem, PLAN_STATUSES,
  type PlanPatch, type PlanStatus
} from '@/lib/planning';

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function clientCal(clientId: string) {
  const c = await getClientFresh(clientId);
  if (!c || !c.calName) return null;
  return c;
}

/** Valida o que vai para o Notion: só opções que já existem lá. */
async function clean(x: PlanPatch): Promise<PlanPatch | string> {
  const o = await planOptions();
  if (typeof o === 'string') return 'O Calendário mensal não está acessível agora.';
  const out: PlanPatch = {};
  if (x.title !== undefined) {
    const t = String(x.title).trim().slice(0, 200);
    if (!t) return 'Dê um título.';
    out.title = t;
  }
  if (x.status !== undefined) {
    if (!(PLAN_STATUSES as readonly string[]).includes(x.status)) return 'Status inválido.';
    out.status = x.status as PlanStatus;
  }
  const pick = (v: string | null | undefined, list: string[]) => (v === null || v === '' ? null : v && list.includes(v) ? v : undefined);
  if (x.kind !== undefined) { const v = pick(x.kind, o.kinds); if (v === undefined) return 'Tipo inválido.'; out.kind = v; }
  if (x.note !== undefined) { const v = pick(x.note, o.notes); if (v === undefined) return 'Observação inválida.'; out.note = v; }
  if (x.owner !== undefined) { const v = pick(x.owner, o.owners); if (v === undefined) return 'Responsável inválido.'; out.owner = v; }
  if (x.day !== undefined) {
    if (x.day === null || x.day === '') out.day = null;
    else { const d = parseDay(x.day); if (!d) return 'Data inválida.'; out.day = d; }
  }
  if (x.done !== undefined) out.done = !!x.done;
  return out;
}

export async function setCalNameAction(clientId: string, calName: string): Promise<R> {
  await requireAdmin();
  const o = await planOptions();
  if (typeof o === 'string' || !o.clients.includes(calName)) return { ok: false, error: 'Escolha um nome da lista.' };
  const c = await getClientFresh(clientId);
  if (!c) return { ok: false, error: 'Cliente não encontrado.' };
  await updateClient(c.id, { calName });
  return { ok: true };
}

export async function createIdeaAction(clientId: string, x: { title: string; kind?: string | null; day?: string | null }): Promise<R<{ id: string }>> {
  await requireAdmin();
  const c = await clientCal(clientId);
  if (!c) return { ok: false, error: 'Ligue este cliente ao Calendário mensal primeiro.' };
  const p = await clean({ title: x.title, kind: x.kind ?? undefined, day: x.day ?? undefined, status: 'Ideia' });
  if (typeof p === 'string') return { ok: false, error: p };
  try {
    const id = await createPlanItem(c.calName, { ...p, title: p.title! });
    return { ok: true, id };
  } catch (e) {
    console.error('[planejamento] criar', e);
    return { ok: false, error: 'Não foi possível criar no Notion.' };
  }
}

export async function updatePlanAction(clientId: string, planId: string, x: PlanPatch): Promise<R> {
  await requireAdmin();
  const c = await clientCal(clientId);
  const item = await getPlanItem(planId);
  if (!c || !item || item.cal !== c.calName) return { ok: false, error: 'Card não encontrado.' };
  const p = await clean(x);
  if (typeof p === 'string') return { ok: false, error: p };
  try {
    await updatePlanItem(planId, p);
    return { ok: true };
  } catch (e) {
    console.error('[planejamento] editar', e);
    return { ok: false, error: 'Não foi possível salvar no Notion.' };
  }
}

/** Leva o card do planejamento para a aprovação: cria o conteúdo (rascunho) já ligado. */
export async function sendToApprovalAction(clientId: string, planId: string): Promise<R<{ contentId: string }>> {
  await requireAdmin();
  const c = await clientCal(clientId);
  const item = await getPlanItem(planId);
  if (!c || !item || item.cal !== c.calName) return { ok: false, error: 'Card não encontrado.' };
  try {
    const contentId = await createContent({
      clientId: c.id,
      title: item.title,
      day: item.day ?? todayIn(env.timeZone),
      time: item.time,
      type: kindToType(item.kind),
      caption: '',
      videoUrl: null,
      coverUrl: null,
      artUrls: [],
      storyImageUrl: null,
      status: 'Rascunho',
      resetApprovals: true,
      planningId: item.id
    });
    if (item.status === 'Ideia') await updatePlanItem(item.id, { status: 'Realizando' });
    return { ok: true, contentId };
  } catch (e) {
    console.error('[planejamento] aprovar', e);
    return { ok: false, error: 'Não foi possível criar na aprovação.' };
  }
}

'use server';

import { isShortLink, splitLinks } from '@/lib/embed';
import { isOwnMediaUrl } from '@/lib/media';

import { requireAdmin } from '@/lib/access';
import { getClientFresh, createContent, updateClient } from '@/lib/notion';
import { parseDay, todayIn } from '@/lib/domain';
import { env } from '@/lib/env';
import {
  createPlanItem, trashPlanItem, getPlanBrief, getPlanItem, kindToType, planOptions, setPlanBrief, updatePlanItem, BRIEF_FIELDS, PLAN_STATUSES, SELECT_FIELDS,
  type BriefField, type PlanBrief,
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
  const names = (f: keyof typeof o) => (o[f] as { name: string }[]).map((x) => x.name);
  const pick = (v: string | null | undefined, list: string[]) => (v === null || v === '' ? null : v && list.includes(v) ? v : undefined);
  for (const f of SELECT_FIELDS) {
    if (x[f] === undefined) continue;
    const v = pick(x[f], names(f));
    if (v === undefined) return 'Opção inválida.';
    out[f] = v;
  }
  if (x.briefBy !== undefined) {
    if (!Array.isArray(x.briefBy) || x.briefBy.some((v) => !names('briefBy').includes(v))) return 'Opção inválida.';
    out.briefBy = [...new Set(x.briefBy)];
  }
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

export async function createIdeaAction(
  clientId: string,
  x: PlanPatch & { title: string }
): Promise<R<{ id: string }>> {
  await requireAdmin();
  const c = await clientCal(clientId);
  if (!c) return { ok: false, error: 'Ligue este cliente ao Calendário mensal primeiro.' };
  const strip = Object.fromEntries(Object.entries(x).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length)));
  const p = await clean({ status: 'Ideia', ...strip, title: x.title });
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

async function ownCard(clientId: string, planId: string, allowTrashed = false) {
  const c = await clientCal(clientId);
  const item = await getPlanItem(planId, allowTrashed);
  return c && item && item.cal === c.calName ? item : null;
}

/** Objetivo, legenda e referência que ficam dentro do card no Notion. */
export async function getBriefAction(clientId: string, planId: string): Promise<R<{ brief: PlanBrief }>> {
  await requireAdmin();
  if (!(await ownCard(clientId, planId))) return { ok: false, error: 'Card não encontrado.' };
  try {
    return { ok: true, brief: await getPlanBrief(planId) };
  } catch {
    return { ok: false, error: 'Não foi possível ler o card no Notion.' };
  }
}

/** Abre links curtos (vm.tiktok.com, pin.it) só nesses domínios, para achar o endereço do post. */
async function expandShort(url: string): Promise<string> {
  let cur = url;
  for (let i = 0; i < 4 && isShortLink(cur); i++) {
    try {
      const r = await fetch(cur, { method: 'GET', redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; ArcoApp)' } });
      const loc = r.headers.get('location');
      if (!loc) break;
      cur = new URL(loc, cur).href;
    } catch {
      break;
    }
  }
  return cur;
}

async function normalizeBrief(field: BriefField, value: string): Promise<string> {
  const v = String(value ?? '');
  if (field === 'referencia') {
    const links = await Promise.all(splitLinks(v).slice(0, 12).map(expandShort));
    return [...new Set(links.map((l) => l.replace(/[?&](igsh|igshid|utm_[a-z]+|is_from_webapp|sender_device)=[^&]*/g, '').replace(/\?&/, '?').replace(/\?$/, '')))].join('\n');
  }
  if (field === 'imagens') return splitLinks(v).filter(isOwnMediaUrl).slice(0, 12).join('\n');
  return v.slice(0, 1900);
}

export async function saveBriefAction(clientId: string, planId: string, field: BriefField, value: string): Promise<R<{ value: string }>> {
  await requireAdmin();
  if (!(BRIEF_FIELDS as readonly string[]).includes(field)) return { ok: false, error: 'Campo inválido.' };
  if (!(await ownCard(clientId, planId))) return { ok: false, error: 'Card não encontrado.' };
  try {
    const clean = await normalizeBrief(field, value);
    await setPlanBrief(planId, field, clean);
    return { ok: true, value: clean };
  } catch (e) {
    if ((e as { code?: string }).code === 'locked') return { ok: false, error: (e as Error).message };
    console.error('[planejamento] briefing', e);
    return { ok: false, error: 'Não foi possível salvar no Notion.' };
  }
}

/** Apagar task: vai para a lixeira do Notion. Com restore = true, volta de lá (botão Desfazer). */
export async function trashPlanAction(clientId: string, planId: string, restore = false): Promise<R> {
  await requireAdmin();
  if (!(await ownCard(clientId, planId, restore))) return { ok: false, error: 'Card não encontrado.' };
  try {
    await trashPlanItem(planId, !restore);
    return { ok: true };
  } catch (e) {
    console.error('[planejamento] lixeira', e);
    return { ok: false, error: restore ? 'Não foi possível restaurar.' : 'Não foi possível apagar no Notion.' };
  }
}

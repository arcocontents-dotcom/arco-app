'use server';

import { isShortLink, splitLinks } from '@/lib/embed';
import { isOwnMediaUrl } from '@/lib/media';

import { requireAdmin } from '@/lib/access';
import { getClientFresh, contentsOfPlanning, createContent, updateClient } from '@/lib/notion';
import { parseDay, todayIn } from '@/lib/domain';
import { env } from '@/lib/env';
import {
  createPlanItem, trashPlanItem, getPlanBrief, getPlanItem, kindToType, planOptions, setPlanBrief, updatePlanItem, BRIEF_FIELDS, PLAN_STATUSES, SELECT_FIELDS,
  type BriefField, type PlanBrief,
  type PlanPatch, type PlanStatus
} from '@/lib/planning';

import { FORMATS, createRoutine, isPerson, type TaskFormat } from '@/lib/producao';
import { setTaskCard, tasksOfCard, type CardTask } from '@/lib/vinculo';
import { logHistory } from '@/lib/historico';

import { logActivity } from '@/lib/registro';
import { proximaVaga, vagaOcupada, type Vaga } from '@/lib/cota';
import { MONTHS, formatoDe } from '@/lib/domain';

const FIELD: Record<string, string> = {
  title: 'título', day: 'data', time: 'horário', status: 'status', kind: 'tipo', note: 'observação', owner: 'com quem está', done: 'finalizado',
  month: 'mês', copyBy: 'roteiro/copy por', briefBy: 'gravado por', designBy: 'editado por', postedBy: 'postado por', recMonth: 'gravado quando', editMonth: 'editado quando',
  objetivo: 'objetivo', legenda: 'legenda', referencia: 'referência', imagens: 'imagens', roteiro: 'roteiro'
};
// edição salva sozinha a cada tecla: no registro entra no máximo 1 linha por card e pessoa a cada 10 min
const lastLog = new Map<string, number>();
async function logPlanEdit(who: string, planId: string, title: string, fields: string[]) {
  const k = `${who}|${planId}`;
  const now = Date.now();
  if ((lastLog.get(k) ?? 0) > now - 600_000) return;
  lastLog.set(k, now);
  await logActivity({ area: 'Planejamento', who, action: `${who} editou o card`, item: title, itemId: planId, detail: fields.map((f) => FIELD[f] ?? f).join(', ') });
}

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
    // "Nenhum": o conteúdo não teve gravação (o Notion cria a opção na primeira vez)
    if (!Array.isArray(x.briefBy) || x.briefBy.some((v) => v !== 'Nenhum' && !names('briefBy').includes(v))) return 'Opção inválida.';
    out.briefBy = x.briefBy.includes('Nenhum') ? ['Nenhum'] : [...new Set(x.briefBy)];
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
  const who = await requireAdmin();
  const c = await clientCal(clientId);
  if (!c) return { ok: false, error: 'Ligue este cliente ao Calendário mensal primeiro.' };
  const strip = Object.fromEntries(Object.entries(x).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length)));
  const p = await clean({ status: 'Ideia', ...strip, title: x.title });
  if (typeof p === 'string') return { ok: false, error: p };
  // saldo de conteúdo: cada card ocupa uma vaga só. Vaga já ocupada (ou sem mês) → a próxima livre.
  const today = todayIn(env.timeZone);
  const f = formatoDe(p.kind ?? null);
  if (f && f !== 'foto' && /\d+$/.test(p.kind ?? '')) {
    const busy = !p.month || (await vagaOcupada(c.calName, p.kind!, p.month, p.day ?? today).catch(() => false));
    if (busy) {
      const v = await proximaVaga(c.calName, p.kind!, today).catch(() => null);
      if (v) { p.kind = v.kind; p.month = v.month; }
    }
  }
  try {
    const id = await createPlanItem(c.calName, { ...p, title: p.title! });
    await logActivity({ area: 'Planejamento', who: who.name, action: `${who.name} criou o card`, item: p.title!, itemId: id, detail: c.calName });
    return { ok: true, id };
  } catch (e) {
    console.error('[planejamento] criar', e);
    return { ok: false, error: 'Não foi possível criar no Notion.' };
  }
}

export async function updatePlanAction(clientId: string, planId: string, x: PlanPatch): Promise<R> {
  const who = await requireAdmin();
  const c = await clientCal(clientId);
  const item = await getPlanItem(planId);
  if (!c || !item || item.cal !== c.calName) return { ok: false, error: 'Card não encontrado.' };
  const p = await clean(x);
  if (typeof p === 'string') return { ok: false, error: p };
  // a data agendada só preenche o mês de referência quando o card ainda não tem um
  if (p.day && p.month === undefined && !item.month) p.month = MONTHS[Number(p.day.slice(5, 7)) - 1];
  // uma vaga da cota por card: não deixa dois cards no mesmo "Reels 3 · Outubro"
  if (p.kind !== undefined || p.month !== undefined) {
    const kind = p.kind !== undefined ? p.kind : item.kind;
    const month = p.month !== undefined ? p.month : item.month;
    if (kind !== item.kind || month !== item.month) {
      if (await vagaOcupada(c.calName, kind, month, p.day ?? item.day ?? item.created, planId).catch(() => false)) {
        return { ok: false, error: `${kind} · ${month} já está com outro card. Cada vaga do contrato é de um card só.` };
      }
    }
  }
  try {
    await updatePlanItem(planId, p);
    if (p.title !== undefined && p.title !== item.title) {
      await logActivity({ area: 'Planejamento', who: who.name, action: `${who.name} mudou o título`, item: p.title, itemId: planId, detail: `${item.title || '(sem título)'} → ${p.title}` });
    }
    if (p.owner !== undefined && p.owner !== item.owner) {
      await logActivity({ area: 'Planejamento', who: who.name, action: `${who.name} transferiu a demanda${item.owner ? ` de ${item.owner}` : ''} para ${p.owner ?? 'ninguém'}`, item: p.title ?? item.title, itemId: planId });
    }
    const rest = Object.keys(p).filter((k) => k !== 'title' && k !== 'owner');
    if (rest.length) await logPlanEdit(who.name, planId, p.title ?? item.title, rest);
    return { ok: true };
  } catch (e) {
    console.error('[planejamento] editar', e);
    return { ok: false, error: 'Não foi possível salvar no Notion.' };
  }
}

/** Próxima vaga do contrato para um formato (Reels/Post/Storys): a mais antiga em aberto. */
export async function nextSlotAction(clientId: string, formato: string, exclude?: string | null): Promise<Vaga | null> {
  await requireAdmin();
  const c = await clientCal(clientId);
  if (!c) return null;
  return proximaVaga(c.calName, String(formato).slice(0, 30), todayIn(env.timeZone), exclude ?? null).catch(() => null);
}

/** Leva o card do planejamento para a aprovação: cria o conteúdo (rascunho) já ligado. */
export async function sendToApprovalAction(clientId: string, planId: string): Promise<R<{ contentId: string }>> {
  const who = await requireAdmin();
  const c = await clientCal(clientId);
  const item = await getPlanItem(planId);
  if (!c || !item || item.cal !== c.calName) return { ok: false, error: 'Card não encontrado.' };
  // já está na aprovação: abre o mesmo conteúdo (não cria outro, nem ocupa outra vaga)
  const existing = (await contentsOfPlanning(item.id).catch(() => [])).find((x) => x.clientId && x.clientId.replace(/-/g, '') === c.id.replace(/-/g, ''));
  if (existing) return { ok: true, contentId: existing.id };
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
    await logActivity({ area: 'Planejamento', who: who.name, action: `${who.name} enviou para aprovação`, item: item.title, itemId: item.id });
    await logActivity({ area: 'Aprovação', who: who.name, action: `${who.name} criou o conteúdo para aprovar`, item: item.title, itemId: contentId });
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
  const who = await requireAdmin();
  if (!(BRIEF_FIELDS as readonly string[]).includes(field)) return { ok: false, error: 'Campo inválido.' };
  const card = await ownCard(clientId, planId);
  if (!card) return { ok: false, error: 'Card não encontrado.' };
  try {
    const clean = await normalizeBrief(field, value);
    await setPlanBrief(planId, field, clean);
    await logPlanEdit(who.name, planId, card.title, [field]);
    return { ok: true, value: clean };
  } catch (e) {
    if ((e as { code?: string }).code === 'locked') return { ok: false, error: (e as Error).message };
    console.error('[planejamento] briefing', e);
    return { ok: false, error: 'Não foi possível salvar no Notion.' };
  }
}

/** Apagar task: vai para a lixeira do Notion. Com restore = true, volta de lá (botão Desfazer). */
export async function trashPlanAction(clientId: string, planId: string, restore = false): Promise<R> {
  const who = await requireAdmin();
  const card = await ownCard(clientId, planId, restore);
  if (!card) return { ok: false, error: 'Card não encontrado.' };
  try {
    await trashPlanItem(planId, !restore);
    await logActivity({ area: 'Planejamento', who: who.name, action: `${who.name} ${restore ? 'restaurou' : 'apagou'} o card`, item: card.title, itemId: planId });
    return { ok: true };
  } catch (e) {
    console.error('[planejamento] lixeira', e);
    return { ok: false, error: restore ? 'Não foi possível restaurar.' : 'Não foi possível apagar no Notion.' };
  }
}

/** Tarefas da Produção ligadas a este card. */
export async function cardTasksAction(planId: string): Promise<R<{ tasks: CardTask[] }>> {
  await requireAdmin();
  try {
    return { ok: true, tasks: await tasksOfCard(planId) };
  } catch (e) {
    console.error('[planejamento] tarefas', e);
    return { ok: false, error: 'Não foi possível ler as tarefas agora.' };
  }
}

/** Cria a tarefa na Produção a partir do card, já preenchida e ligada (sem lançar duas vezes). */
export async function createTaskFromCardAction(
  clientId: string,
  planId: string,
  x: { person: string; format: string | null; date: string | null; desc?: string }
): Promise<R<{ id: string }>> {
  const who = await requireAdmin();
  const c = await clientCal(clientId);
  const item = await getPlanItem(planId);
  if (!c || !item) return { ok: false, error: 'Card não encontrado.' };
  if (!isPerson(x.person)) return { ok: false, error: 'Escolha quem faz.' };
  const format = x.format && (FORMATS as readonly string[]).includes(x.format) ? (x.format as TaskFormat) : null;
  const date = parseDay(String(x.date ?? '')) ?? item.day ?? todayIn(env.timeZone);
  try {
    const id = await createRoutine({
      title: item.title || 'Sem título', person: x.person, type: 'Tarefa', days: [], date, urgency: 'Média',
      client: c.name, format, formatOther: '', desc: String(x.desc ?? '').trim().slice(0, 1900)
    });
    await setTaskCard(id, planId);
    await logHistory(id, `${who.name} lançou para ${x.person} pelo planejamento · entrega ${date.slice(8, 10)}/${date.slice(5, 7)}`);
    return { ok: true, id };
  } catch (e) {
    console.error('[planejamento] criar tarefa', e);
    return { ok: false, error: 'Não foi possível criar a tarefa no Notion.' };
  }
}

/** Histórico do card (Registro do app). */
export async function planHistoryAction(planId: string): Promise<R<{ history: string }>> {
  await requireAdmin();
  try {
    const { listActivity, asHistoryLines } = await import('@/lib/registro');
    return { ok: true, history: asHistoryLines(await listActivity({ itemId: planId, limit: 50 }), env.timeZone) };
  } catch {
    return { ok: true, history: '' };
  }
}

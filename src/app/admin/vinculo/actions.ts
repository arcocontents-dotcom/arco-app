'use server';

import { requireAdmin } from '@/lib/access';
import { FORMATO_LABEL, formatoDe, mesmoFormato } from '@/lib/domain';
import { logHistory } from '@/lib/historico';
import { logActivity } from '@/lib/registro';
import { contentsOfPlanning, contentsToLink, getClientFresh, getContentFresh, setContentPlanning } from '@/lib/notion';
import { getPlanItem } from '@/lib/planning';
import { getRoutine, listRoutines } from '@/lib/producao';
import { LINKABLE, openCards, setTaskCard, tasksOfCard, type CardTask, type OpenCard } from '@/lib/vinculo';
import { invalidate } from '@/lib/cache';

// Vínculos entre Planejamento, Produção e Aprovação.
// Regra: mesmo cliente e mesmo formato (reels com reels, post com post, story com story, foto com foto).

/** "Vídeo 4 de 4 · Outubro": a vaga do contrato que o card ocupa (a mesma no Planejamento e na Aprovação). */
function vagaTexto(kind: string | null, month: string | null, cota: { reels: number; post: number; story: number } | null): string | null {
  const f = formatoDe(kind);
  const n = Number(kind?.match(/(\d+)$/)?.[1] ?? 0);
  if (!f || f === 'foto' || !n || !month || !cota?.[f]) return null;
  return `${f === 'reels' ? 'Vídeo' : f === 'story' ? 'Story' : 'Post'} ${n} de ${cota[f]} · ${month}`;
}

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fmtErr = (a: string | null, b: string | null) =>
  `Formatos diferentes: ${a ?? '—'} não liga com ${b ?? '—'}. Reels só com reels, post só com post.`;

export interface LinkContent { id: string; title: string; type: string; status: string; day: string | null; planningId: string | null }
const asLink = (c: { id: string; title: string; type: string; status: string; day: string | null; planningId: string | null }): LinkContent =>
  ({ id: c.id, title: c.title, type: c.type, status: c.status, day: c.day, planningId: c.planningId });

/** No card do Planejamento: o que já está ligado e o que dá para ligar (mesmo cliente, mesmo formato). */
export async function cardLinksAction(planId: string, clientId: string): Promise<R<{
  formato: string | null;
  contents: LinkContent[];
  contentOptions: LinkContent[];
  taskOptions: { id: string; title: string; person: string; format: string | null; date: string | null; linked: boolean }[];
}>> {
  await requireAdmin();
  try {
    const [item, client] = await Promise.all([getPlanItem(planId), getClientFresh(clientId)]);
    if (!item || !client) return { ok: false, error: 'Card não encontrado.' };
    const f = formatoDe(item.kind);
    const [linked, options, routines] = await Promise.all([
      contentsOfPlanning(planId).catch(() => []),
      contentsToLink(client.id).catch(() => []),
      listRoutines().catch(() => [])
    ]);
    const contentOptions = options.filter((c) => !linked.some((l) => l.id === c.id) && mesmoFormato(c.type, item.kind)).map(asLink);
    const taskOptions = routines
      .filter((r) => r.type === 'Tarefa' && r.client === client.name && r.contentId !== planId)
      .filter((r) => r.format && LINKABLE.includes(r.format) && mesmoFormato(r.format, item.kind))
      .filter((r) => !(r.date ? r.doneOn.includes(r.date) : r.doneOn.length > 0))
      .slice(0, 60)
      .map((r) => ({ id: r.id, title: r.title, person: r.person, format: r.format, date: r.date, linked: !!r.contentId }));
    return { ok: true, formato: f ? FORMATO_LABEL[f] : null, contents: linked.map(asLink), contentOptions, taskOptions };
  } catch (e) {
    console.error('[vinculo] card', e);
    return { ok: false, error: 'Não foi possível ler os vínculos agora.' };
  }
}

/** Liga um conteúdo da aprovação a um card (ou desliga, com planId = null). */
export async function linkContentAction(contentId: string, planId: string | null): Promise<R> {
  const who = await requireAdmin();
  const c = await getContentFresh(contentId);
  if (!c) return { ok: false, error: 'Conteúdo não encontrado.' };
  let cardTitle = '';
  if (planId) {
    const item = await getPlanItem(planId);
    if (!item) return { ok: false, error: 'Card não encontrado.' };
    const client = c.clientId ? await getClientFresh(c.clientId) : null;
    if (!client || client.calName !== item.cal) return { ok: false, error: 'O card é de outro cliente.' };
    if (!mesmoFormato(c.type, item.kind)) return { ok: false, error: fmtErr(c.type, item.kind) };
    cardTitle = item.title;
  }
  try {
    await setContentPlanning(c.id, planId, c.clientId);
    invalidate('plan:');
    await logActivity({
      area: 'Aprovação', who: who.name, item: c.title, itemId: c.id,
      action: planId ? 'vinculou ao planejamento' : 'desvinculou do planejamento',
      detail: planId ? `card: ${cardTitle}` : undefined
    });
    return { ok: true };
  } catch (e) {
    console.error('[vinculo] conteúdo', e);
    return { ok: false, error: 'Não foi possível salvar no Notion.' };
  }
}

/** Liga uma task da Produção que já existe a um card (mesmo cliente e formato). */
export async function linkTaskAction(taskId: string, planId: string | null): Promise<R> {
  const who = await requireAdmin();
  const t = await getRoutine(taskId).catch(() => null);
  if (!t) return { ok: false, error: 'Tarefa não encontrada.' };
  if (planId) {
    const item = await getPlanItem(planId);
    if (!item) return { ok: false, error: 'Card não encontrado.' };
    if (!mesmoFormato(t.format, item.kind)) return { ok: false, error: fmtErr(t.format, item.kind) };
  }
  try {
    await setTaskCard(t.id, planId);
    invalidate('plan:');
    await logHistory(t.id, `${who.name} ${planId ? 'vinculou a um card do planejamento' : 'desvinculou do planejamento'}`);
    return { ok: true };
  } catch (e) {
    console.error('[vinculo] task', e);
    return { ok: false, error: 'Não foi possível salvar no Notion.' };
  }
}

/** Na aprovação: o card ligado, as tasks dele e os cards que dá para escolher (mesmo cliente, mesmo formato). */
export async function contentLinksAction(contentId: string): Promise<R<{
  card: { id: string; title: string; kind: string | null; vaga: string | null } | null;
  tasks: CardTask[];
  cards: OpenCard[];
}>> {
  await requireAdmin();
  try {
    const c = await getContentFresh(contentId);
    if (!c || !c.clientId) return { ok: false, error: 'Conteúdo não encontrado.' };
    const client = await getClientFresh(c.clientId);
    const [item, cards, tasks] = await Promise.all([
      c.planningId ? getPlanItem(c.planningId) : Promise.resolve(null),
      client ? openCards(client.name, c.type).catch(() => []) : Promise.resolve([]),
      c.planningId ? tasksOfCard(c.planningId).catch(() => []) : Promise.resolve([])
    ]);
    return {
      ok: true,
      card: item ? { id: item.id, title: item.title, kind: item.kind, vaga: vagaTexto(item.kind, item.month, client?.combinado ?? null) } : null,
      tasks,
      cards: cards.filter((x) => x.id !== item?.id)
    };
  } catch (e) {
    console.error('[vinculo] aprovação', e);
    return { ok: false, error: 'Não foi possível ler os vínculos agora.' };
  }
}

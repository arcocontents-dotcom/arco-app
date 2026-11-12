'use server';

import { currentViewer } from '@/lib/access';
import { getClientFresh, getContentFresh, saveDecisions, setPosted } from '@/lib/notion';
import { type Decision, type GeneralStatus, validateDecisions } from '@/lib/domain';
import { syncPlanFromContent } from '@/lib/planning';

export type ReviewResult = { ok: true; status: GeneralStatus } | { ok: false; error: string };

export async function submitReview(contentId: string, decisions: Record<string, Decision>): Promise<ReviewResult> {
  const viewer = await currentViewer();
  if (!viewer) return { ok: false, error: 'Sua sessão expirou. Entre de novo.' };

  const content = await getContentFresh(contentId);
  if (!content || !content.clientId) return { ok: false, error: 'Conteúdo não encontrado.' };

  // Permissão relida direto do Notion, sem cache.
  if (viewer.role !== 'admin') {
    const client = await getClientFresh(content.clientId);
    if (!client || client.cancelled || !client.approvers.includes(viewer.email)) {
      return { ok: false, error: 'Seu acesso é só de visualização.' };
    }
    if (content.status === 'Rascunho') return { ok: false, error: 'Conteúdo não encontrado.' };
  }
  if (content.status === 'Postado') return { ok: false, error: 'Este conteúdo já foi postado.' };

  const clean: Record<string, Decision> = {};
  for (const [k, v] of Object.entries(decisions ?? {})) {
    if (v && typeof v === 'object') clean[k] = { status: v.status, note: String(v.note ?? '').slice(0, 1000) };
  }
  const err = validateDecisions(content.type, clean);
  if (err) return { ok: false, error: err };

  try {
    await saveDecisions(content, clean, viewer.email);
  } catch (e) {
    console.error('[review]', e);
    return { ok: false, error: 'Não foi possível salvar agora. Tente de novo.' };
  }
  const fresh = await getContentFresh(contentId);
  if (fresh?.planningId) await syncPlanFromContent(fresh);
  return { ok: true, status: fresh?.status ?? 'Aguardando' };
}

export async function togglePosted(contentId: string, posted: boolean): Promise<ReviewResult> {
  const viewer = await currentViewer();
  if (!viewer || viewer.role !== 'admin') return { ok: false, error: 'Só o administrador pode marcar como postado.' };
  const content = await getContentFresh(contentId);
  if (!content) return { ok: false, error: 'Conteúdo não encontrado.' };
  try {
    await setPosted(content, posted);
    const fresh = await getContentFresh(contentId);
    if (fresh?.planningId) await syncPlanFromContent(fresh, { unposted: !posted });
  } catch (e) {
    console.error('[posted]', e);
    return { ok: false, error: 'Não foi possível salvar agora.' };
  }
  return { ok: true, status: posted ? 'Postado' : 'Aguardando' };
}

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/access';
import { syncPlanFromContent } from '@/lib/planning';
import { pushConfigured, sendPush } from '@/lib/push';
import { allow } from '@/lib/ratelimit';
import { env } from '@/lib/env';
import {
  archiveContent,
  listClients,
  listClientsFresh,
  sameId,
  createClient,
  createContent,
  getClientFresh,
  setClientPhone,
  getContentFresh,
  setClientInstagram,
  setPosted,
  getClientPushSubs,
  setClientPushSubs,
  updateClient,
  updateContent,
  type ContentInput
} from '@/lib/notion';
import { CONTENT_TYPES, EMAIL_RE, normalizeEmail, normalizePhone, parseDay, type ContentType, type GeneralStatus } from '@/lib/domain';
import { isOwnMediaUrl } from '@/lib/media';
import { signLoginToken } from '@/lib/session';

// ---------- clientes ----------

export type CreateClientResult = { ok: true; id: string; link: string | null } | { ok: false; error: string };

/** Cria o cliente já com e-mail liberado e logo (opcionais) e devolve o link de acesso. */
export async function createClientFullAction(input: {
  name: string;
  instagram: string;
  email: string;
  role: 'approver' | 'viewer';
  logoUrl: string | null;
}): Promise<CreateClientResult> {
  await requireAdmin();
  const name = String(input.name ?? '').trim().slice(0, 120);
  const instagram = String(input.instagram ?? '').trim().replace(/^@/, '').slice(0, 60);
  const email = normalizeEmail(String(input.email ?? ''));
  if (!name) return { ok: false, error: 'Dê um nome ao cliente.' };
  if (email) {
    if (!EMAIL_RE.test(email)) return { ok: false, error: 'Digite um e-mail válido.' };
    if (email === env.adminEmail) return { ok: false, error: 'Esse é o e-mail do administrador.' };
    const owner = (await listClientsFresh()).find((x) => x.approvers.includes(email) || x.viewers.includes(email));
    if (owner) return { ok: false, error: `Esse e-mail já está liberado no cliente ${owner.name}. Cada e-mail só pode acessar um cliente.` };
  }
  if (input.logoUrl && !isOwnMediaUrl(input.logoUrl)) return { ok: false, error: 'Logo inválida.' };
  try {
    const id = await createClient({ name, instagram });
    if (email || input.logoUrl) {
      await updateClient(id, {
        ...(email ? (input.role === 'viewer' ? { approvers: [], viewers: [email] } : { approvers: [email], viewers: [] }) : {}),
        ...(input.logoUrl ? { logoUrl: input.logoUrl } : {})
      });
    }
    const link = email ? await buildLink(email, id) : null;
    return { ok: true, id, link };
  } catch (e) {
    console.error('[cliente]', e);
    return { ok: false, error: 'Não foi possível salvar no Notion. Tente de novo.' };
  }
}

export type LinkResult = { ok: true; link: string } | { ok: false; error: string };

/** Um link só: entra direto no calendário do cliente, na semana que tem conteúdo. */
async function buildLink(email: string, clientId: string) {
  const token = await signLoginToken(email, '24h');
  const next = `/c/${clientId}`;
  return `${env.appUrl}/entrar/confirmar?t=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
}

export async function setClientCancelledAction(id: string, cancelled: boolean): Promise<SaveResult> {
  await requireAdmin();
  const c = await getClientFresh(id);
  if (!c) return { ok: false, error: 'Cliente não encontrado.' };
  await updateClient(id, { cancelled });
  return { ok: true, id };
}

/** Gera um link de acesso (vale 24h) para mandar ao cliente por WhatsApp. */
export async function accessLinkAction(clientId: string, email: string): Promise<LinkResult> {
  await requireAdmin();
  const e = normalizeEmail(email);
  const c = await getClientFresh(clientId);
  if (!c || !(c.approvers.includes(e) || c.viewers.includes(e))) return { ok: false, error: 'Esse e-mail não está liberado neste cliente.' };
  if (c.cancelled) return { ok: false, error: 'Este cliente está removido. Reative antes.' };
  return { ok: true, link: await buildLink(e, c.id) };
}

export async function updateClientAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get('id') ?? '');
  const name = String(form.get('name') ?? '').trim().slice(0, 120);
  const instagram = String(form.get('instagram') ?? '').trim().replace(/^@/, '').slice(0, 60);
  if (!id || !name) redirect(`/admin/clientes/${id}?e=nome`);
  await updateClient(id, { name, instagram });
  revalidatePath('/admin', 'layout');
  redirect(`/admin/clientes/${id}?ok=salvo`);
}

export async function addAccessAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get('id') ?? '');
  const email = normalizeEmail(String(form.get('email') ?? ''));
  const role = form.get('role') === 'viewer' ? 'viewer' : 'approver';
  if (!EMAIL_RE.test(email)) redirect(`/admin/clientes/${id}?e=email`);
  if (email === env.adminEmail) redirect(`/admin/clientes/${id}?e=admin`);
  const c = await getClientFresh(id);
  if (!c) redirect('/admin');
  // Cada e-mail de cliente pertence a um único cliente: assim ninguém vê a página de outro.
  const owner = (await listClientsFresh()).find((x) => !sameId(x.id, id) && (x.approvers.includes(email) || x.viewers.includes(email)));
  if (owner) redirect(`/admin/clientes/${id}?e=outro&quem=${encodeURIComponent(owner.name)}`);
  const approvers = c.approvers.filter((e) => e !== email);
  const viewers = c.viewers.filter((e) => e !== email);
  (role === 'approver' ? approvers : viewers).push(email);
  await updateClient(id, { approvers, viewers });
  redirect(`/admin/clientes/${id}?ok=liberado`);
}

export async function removeAccessAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get('id') ?? '');
  const email = normalizeEmail(String(form.get('email') ?? ''));
  const c = await getClientFresh(id);
  if (!c) redirect('/admin');
  await updateClient(id, { approvers: c.approvers.filter((e) => e !== email), viewers: c.viewers.filter((e) => e !== email) });
  redirect(`/admin/clientes/${id}?ok=removido`);
}

export async function setClientPhoneAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get('id') ?? '');
  const phone = normalizePhone(String(form.get('phone') ?? ''));
  if (!(await getClientFresh(id))) redirect('/admin');
  if (phone === null) redirect(`/admin/clientes/${id}?e=telefone`);
  await setClientPhone(id, phone);
  redirect(`/admin/clientes/${id}?ok=telefone`);
}

export async function disconnectInstagramAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get('id') ?? '');
  await setClientInstagram(id, null);
  redirect(`/admin/clientes/${id}?ok=ig-off`);
}

// ---------- conteúdos ----------

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export interface ContentPayload {
  id?: string;
  clientId: string;
  title: string;
  day: string;
  time: string;
  type: ContentType;
  caption: string;
  videoUrl: string;
  coverUrl: string;
  artUrls: string[];
  storyImageUrl: string;
  publish: boolean;
  resetApprovals: boolean;
}

export async function saveContentAction(p: ContentPayload): Promise<SaveResult> {
  await requireAdmin();
  const title = String(p.title ?? '').trim().slice(0, 200);
  if (!title) return { ok: false, error: 'Dê um título ao conteúdo.' };
  const day = parseDay(p.day);
  if (!day) return { ok: false, error: 'Escolha a data.' };
  const time = /^\d{2}:\d{2}$/.test(p.time ?? '') ? p.time : null;
  if (!(CONTENT_TYPES as readonly string[]).includes(p.type)) return { ok: false, error: 'Tipo inválido.' };
  const client = await getClientFresh(p.clientId);
  if (!client) return { ok: false, error: 'Cliente não encontrado.' };

  const media = (u: string) => (u && isOwnMediaUrl(u) ? u : null);
  const arts = (Array.isArray(p.artUrls) ? p.artUrls : []).filter((u) => typeof u === 'string' && isOwnMediaUrl(u)).slice(0, 20);
  const caption = String(p.caption ?? '').slice(0, 2200);

  const input: ContentInput = {
    clientId: client.id,
    title,
    day,
    time,
    type: p.type,
    caption,
    videoUrl: p.type === 'Reels' || p.type === 'Story' ? media(p.videoUrl) : null,
    coverUrl: p.type === 'Reels' ? media(p.coverUrl) : null,
    artUrls: p.type === 'Post' || p.type === 'Carrossel' ? (p.type === 'Post' ? arts.slice(0, 1) : arts) : [],
    storyImageUrl: p.type === 'Story' ? media(p.storyImageUrl) : null,
    status: 'Rascunho',
    resetApprovals: !!p.resetApprovals
  };

  try {
    if (p.id) {
      const prev = await getContentFresh(p.id);
      if (!prev) return { ok: false, error: 'Conteúdo não encontrado.' };
      let status: GeneralStatus = prev.status;
      if (p.publish && (status === 'Rascunho' || p.resetApprovals)) status = 'Aguardando';
      if (!p.publish) status = 'Rascunho';
      if (p.resetApprovals && p.publish) status = 'Aguardando';
      await updateContent(p.id, { ...input, status }, prev.clientId);
      if (prev.planningId) await syncPlanFor(p.id);
      return { ok: true, id: p.id };
    }
    const id = await createContent({ ...input, status: p.publish ? 'Aguardando' : 'Rascunho', resetApprovals: true });
    return { ok: true, id };
  } catch (e) {
    console.error('[content]', e);
    return { ok: false, error: 'Não foi possível salvar no Notion. Tente de novo.' };
  }
}

export async function deleteContentAction(id: string): Promise<SaveResult> {
  await requireAdmin();
  const c = await getContentFresh(id);
  if (!c) return { ok: false, error: 'Conteúdo não encontrado.' };
  await archiveContent(id, c.clientId);
  return { ok: true, id };
}

export async function setClientLogoAction(id: string, logoUrl: string | null): Promise<SaveResult> {
  await requireAdmin();
  if (logoUrl && !isOwnMediaUrl(logoUrl)) return { ok: false, error: 'Imagem inválida.' };
  const c = await getClientFresh(id);
  if (!c) return { ok: false, error: 'Cliente não encontrado.' };
  await updateClient(id, { logoUrl });
  return { ok: true, id };
}


/** Ação rápida das Pendências: marca como postado sem abrir o conteúdo. */
export async function markPostedAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get('id') ?? '');
  const content = await getContentFresh(id);
  if (content) {
    await setPosted(content, true);
    await syncPlanFor(id);
  }
  revalidatePath('/admin/pendencias');
  redirect('/admin/pendencias?ok=postado');
}

/** Leva o andamento da aprovação para o card ligado no Calendário mensal. */
async function syncPlanFor(id: string, unposted = false) {
  const fresh = await getContentFresh(id);
  if (fresh?.planningId) await syncPlanFromContent(fresh, { unposted });
}

async function notifyContext(contentId: string) {
  const c = await getContentFresh(contentId);
  if (!c || !c.clientId) return { error: 'Conteúdo não encontrado.' } as const;
  const client = await getClientFresh(c.clientId);
  if (!client || client.cancelled) return { error: 'Cliente não encontrado.' } as const;
  const first = client.name.split(/\s+/).filter((w) => !/^(arqui?\.?|dra?\.?)$/i.test(w))[0] ?? client.name;
  const path = `/c/${client.id}/${c.id}`;
  return { c, client, first, path } as const;
}

export type NotifyInfo =
  | { ok: false; error: string }
  | { ok: true; clientName: string; phone: string; message: string; devices: number; draft: boolean };

/** Monta o aviso de UM conteúdo: mensagem pronta, celular do cliente e quantos aparelhos têm o app com aviso. */
export async function notifyInfoAction(contentId: string): Promise<NotifyInfo> {
  await requireAdmin();
  const x = await notifyContext(contentId);
  if ('error' in x) return { ok: false, error: x.error! };
  const { c, client, first, path } = x;
  const when = c.day ? ` (${c.type}, ${c.day.slice(8, 10)}/${c.day.slice(5, 7)})` : ` (${c.type})`;
  const message =
    c.status === 'Aguardando'
      ? `Olá, ${first}! O conteúdo "${c.title}"${when} já está no app esperando a sua aprovação. É só abrir, revisar e aprovar:\n${env.appUrl}${path}`
      : `Olá, ${first}! Atualizei o conteúdo "${c.title}"${when} no app:\n${env.appUrl}${path}`;
  const devices = pushConfigured() ? (await getClientPushSubs(client.id).catch(() => [])).length : 0;
  return { ok: true, clientName: client.name, phone: client.phone, message, devices, draft: c.status === 'Rascunho' };
}

/** Aviso no celular (app) de UM conteúdo, com o nome do post, abrindo direto nele. */
export async function notifyContentAction(contentId: string): Promise<{ ok: boolean; sent: number; error?: string }> {
  await requireAdmin();
  const x = await notifyContext(contentId);
  if ('error' in x) return { ok: false, sent: 0, error: x.error };
  const { c, client, first, path } = x;
  if (c.status === 'Rascunho') return { ok: false, sent: 0, error: 'É rascunho: o cliente ainda não vê. Mude para Aguardando.' };
  if (!pushConfigured()) return { ok: false, sent: 0, error: 'Avisos no celular indisponíveis agora.' };
  if (!allow(`notify:${c.id}`, 3, 10 * 60_000)) return { ok: false, sent: 0, error: 'Aviso deste conteúdo já enviado há pouco.' };
  const subs = await getClientPushSubs(client.id);
  if (!subs.length) return { ok: false, sent: 0, error: `${first} ainda não ativou os avisos no app.` };
  const message = {
    title: c.status === 'Aguardando' ? 'Conteúdo para aprovar' : 'Conteúdo atualizado',
    body: `${c.type} · ${c.title}${c.day ? ` · ${c.day.slice(8, 10)}/${c.day.slice(5, 7)}` : ''}. Toque para revisar.`,
    url: path,
    tag: `c${c.id.replace(/-/g, '').slice(0, 30)}`
  };
  const results = await Promise.all(subs.map((s) => sendPush(s, message).catch(() => 'erro' as const)));
  const keep = subs.filter((_, i) => results[i] !== 'gone');
  if (keep.length !== subs.length) await setClientPushSubs(client.id, keep);
  const sent = results.filter((r) => r === 'ok').length;
  if (!sent) return { ok: false, sent: 0, error: 'Não foi possível entregar no celular agora.' };
  return { ok: true, sent };
}

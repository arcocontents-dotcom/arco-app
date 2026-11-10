'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import {
  archiveContent,
  listClients,
  listClientsFresh,
  sameId,
  createClient,
  createContent,
  getClientFresh,
  getContentFresh,
  setClientInstagram,
  updateClient,
  updateContent,
  type ContentInput
} from '@/lib/notion';
import { CONTENT_TYPES, EMAIL_RE, normalizeEmail, parseDay, type ContentType, type GeneralStatus } from '@/lib/domain';
import { isOwnMediaUrl } from '@/lib/media';
import { signLoginToken } from '@/lib/session';

// ---------- clientes ----------

export type CreateClientResult = { ok: true; id: string; links: { mes: string; semana: string } | null } | { ok: false; error: string };

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
    const links = email ? { mes: await buildLink(email, id, 'mes'), semana: await buildLink(email, id, 'semana') } : null;
    return { ok: true, id, links };
  } catch (e) {
    console.error('[cliente]', e);
    return { ok: false, error: 'Não foi possível salvar no Notion. Tente de novo.' };
  }
}

export type LinkKind = 'mes' | 'semana';
export type LinkResult = { ok: true; link: string } | { ok: false; error: string };

async function buildLink(email: string, clientId: string, kind: LinkKind) {
  const token = await signLoginToken(email, '24h');
  const next = `/c/${clientId}?v=${kind}`;
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
export async function accessLinkAction(clientId: string, email: string, kind: LinkKind): Promise<LinkResult> {
  await requireAdmin();
  const e = normalizeEmail(email);
  const c = await getClientFresh(clientId);
  if (!c || !(c.approvers.includes(e) || c.viewers.includes(e))) return { ok: false, error: 'Esse e-mail não está liberado neste cliente.' };
  if (c.cancelled) return { ok: false, error: 'Este cliente está removido. Reative antes.' };
  return { ok: true, link: await buildLink(e, c.id, kind === 'semana' ? 'semana' : 'mes') };
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

import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { env } from './env';
import { sessionEmail } from './session';
import { getClientFresh, getContentFresh, listClients, listClientsFresh, sameId, type ClientRecord } from './notion';
import { normalizeEmail } from './domain';

export type Viewer =
  | { email: string; role: 'admin' }
  | { email: string; role: 'client'; clients: { id: string; name: string; canApprove: boolean }[] };

export function isAdminEmail(email: string): boolean {
  return normalizeEmail(email) === env.adminEmail;
}

/** Quem pode entrar e o que pode ver. Nunca confia no navegador: sempre consulta o Notion. */
export async function resolveViewer(email: string): Promise<Viewer | null> {
  const e = normalizeEmail(email);
  if (isAdminEmail(e)) return { email: e, role: 'admin' };
  const pick = (clients: ClientRecord[]) =>
    clients
      .filter((c) => !c.cancelled && (c.approvers.includes(e) || c.viewers.includes(e)))
      .map((c) => ({ id: c.id, name: c.name, canApprove: c.approvers.includes(e) }));
  let mine = pick(await listClients());
  // Acesso liberado há instantes pode ainda não estar no cache: confere direto no Notion.
  if (!mine.length) mine = pick(await listClientsFresh());
  if (!mine.length) return null;
  return { email: e, role: 'client', clients: mine };
}

export async function currentViewer(): Promise<Viewer | null> {
  const email = await sessionEmail();
  if (!email) return null;
  return resolveViewer(email);
}

export async function requireViewer(): Promise<Viewer> {
  const v = await currentViewer();
  if (!v) redirect('/entrar');
  return v;
}

export async function requireAdmin(): Promise<Viewer & { role: 'admin' }> {
  const v = await requireViewer();
  if (v.role !== 'admin') notFound();
  return v;
}

/**
 * Garante que o usuário pode ver este cliente. Para decisões que gravam dados,
 * use `fresh: true` para reler o cliente direto do Notion (sem cache).
 */
/** Igual a requireClientAccess, mas feito uma vez só por requisição (layout + página). */
export const requireClientAccess = cache(checkClientAccess);

async function checkClientAccess(
  clientId: string,
  opts: { fresh?: boolean } = {}
): Promise<{ viewer: Viewer; client: ClientRecord; canApprove: boolean }> {
  const viewer = await requireViewer();
  // Cliente: sempre relê do Notion, para que um acesso removido valha na hora.
  const fresh = opts.fresh || viewer.role !== 'admin';
  const client = fresh ? await getClientFresh(clientId) : (await listClients()).find((c) => sameId(c.id, clientId)) ?? null;
  if (!client) notFound();
  if (viewer.role === 'admin') return { viewer, client, canApprove: true };
  if (client.cancelled) notFound();
  const canApprove = client.approvers.includes(viewer.email);
  const canView = canApprove || client.viewers.includes(viewer.email);
  if (!canView) notFound();
  return { viewer, client, canApprove };
}

/** Conteúdo lido uma vez por requisição e já validado: pertence ao cliente e não é rascunho (para o cliente). */
export const requireContentAccess = cache(async (clientId: string, contentId: string) => {
  const access = await requireClientAccess(clientId);
  const c = await getContentFresh(contentId);
  // O conteúdo precisa pertencer a ESTE cliente. Sem isso, nada aparece.
  if (!c || !sameId(c.clientId, access.client.id)) notFound();
  if (c.status === 'Rascunho' && access.viewer.role !== 'admin') notFound();
  return { ...access, content: c };
});

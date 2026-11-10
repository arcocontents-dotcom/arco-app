import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { env } from './env';
import { sessionEmail } from './session';
import { getClientFresh, listClients, listClientsFresh, sameId, type ClientRecord } from './notion';
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
      .filter((c) => c.approvers.includes(e) || c.viewers.includes(e))
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
export async function requireClientAccess(
  clientId: string,
  opts: { fresh?: boolean } = {}
): Promise<{ viewer: Viewer; client: ClientRecord; canApprove: boolean }> {
  const viewer = await requireViewer();
  // Cliente: sempre relê do Notion, para que um acesso removido valha na hora.
  const fresh = opts.fresh || viewer.role !== 'admin';
  const client = fresh ? await getClientFresh(clientId) : (await listClients()).find((c) => sameId(c.id, clientId)) ?? null;
  if (!client) notFound();
  if (viewer.role === 'admin') return { viewer, client, canApprove: true };
  const canApprove = client.approvers.includes(viewer.email);
  const canView = canApprove || client.viewers.includes(viewer.email);
  if (!canView) notFound();
  return { viewer, client, canApprove };
}

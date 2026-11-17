import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { env } from './env';
import { sessionEmail } from './session';
import { getClientFresh, getContentFresh, listClients, listClientsFresh, sameId, type ClientRecord } from './notion';
import { normalizeEmail } from './domain';
import { listTeamAdmins } from './acessos';

export type Viewer =
  | { email: string; role: 'admin'; name: string; master: boolean; finance: boolean }
  | { email: string; role: 'client'; clients: { id: string; name: string; canApprove: boolean }[] };

export function isAdminEmail(email: string): boolean {
  return normalizeEmail(email) === env.adminEmail;
}

/** Quem pode entrar e o que pode ver. Nunca confia no navegador: sempre consulta o Notion. */
export async function resolveViewer(email: string): Promise<Viewer | null> {
  const e = normalizeEmail(email);
  if (isAdminEmail(e)) return { email: e, role: 'admin', name: 'Arco (admin)', master: true, finance: true };
  // Outros administradores: tabela "🔑 Acessos do app" no Notion
  const team = (await listTeamAdmins()).find((a) => a.email === e);
  if (team) return { email: e, role: 'admin', name: team.name, master: false, finance: team.finance };
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

/** Financeiro: só o administrador principal e quem tem "Financeiro" marcado nos Acessos. Link direto também não abre. */
/** Pode ver o Financeiro (antes da senha). */
export async function requireFinanceAccess(): Promise<Viewer & { role: 'admin' }> {
  const v = await requireAdmin();
  if (!v.finance) notFound();
  return v;
}

const FIN_COOKIE = 'arco_fin';

/** Financeiro destravado pela senha neste aparelho (vale 12h). Sem senha configurada, sempre aberto. */
export async function financeUnlocked(email: string): Promise<boolean> {
  if (!env.financePassword) return true;
  const { cookies } = await import('next/headers');
  const t = (await cookies()).get(FIN_COOKIE)?.value;
  if (!t) return false;
  const { verifyState } = await import('./session');
  const d = await verifyState(t);
  return !!d && d.fin === normalizeEmail(email);
}

export async function unlockFinanceCookie(email: string) {
  const { cookies } = await import('next/headers');
  const { signState } = await import('./session');
  (await cookies()).set(FIN_COOKIE, await signState({ fin: normalizeEmail(email) }, '12h'), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 12 * 3600
  });
}

export async function lockFinanceCookie() {
  const { cookies } = await import('next/headers');
  (await cookies()).delete(FIN_COOKIE);
}

/** Financeiro liberado e destravado (para gravar). Link direto ou chamada sem a senha não passa. */
export async function requireFinance(): Promise<Viewer & { role: 'admin' }> {
  const v = await requireFinanceAccess();
  if (!(await financeUnlocked(v.email))) notFound();
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

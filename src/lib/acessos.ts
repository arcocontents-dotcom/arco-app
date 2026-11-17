import 'server-only';
import { env } from './env';
import { memo } from './cache';
import { normalizeEmail } from './domain';
import { checkbox, isPage, queryAll, text } from './notion';

// "🔑 Acessos do app": outros administradores além do e-mail principal.
// Desmarcar "Ativo" tira o acesso na hora (a cada requisição é conferido, com cache curto).

export interface TeamAdmin {
  id: string;
  name: string;
  email: string;
  finance: boolean;
}

export function listTeamAdmins(): Promise<TeamAdmin[]> {
  if (!env.accessDb) return Promise.resolve([]);
  return memo('acessos', 20_000, async () => {
    const pages = await queryAll(env.accessDb!, {});
    return pages
      .filter((p) => isPage(p) && !p.archived && checkbox(p.properties['Ativo']))
      .map((p) => {
        const e = p.properties['E-mail'];
        const email = normalizeEmail(e?.type === 'email' ? e.email ?? '' : text(e));
        return { id: p.id, name: text(p.properties['Nome']) || email, email, finance: checkbox(p.properties['Financeiro']) };
      })
      .filter((a) => a.email.includes('@'));
  }).catch((err) => {
    console.error('[acessos]', err);
    return [] as TeamAdmin[];
  });
}

/** Nome para o histórico: quem fez a ação. */
export async function actorName(email: string): Promise<string> {
  const e = normalizeEmail(email);
  if (e === env.adminEmail) return 'Arco (admin)';
  return (await listTeamAdmins()).find((a) => a.email === e)?.name ?? e;
}

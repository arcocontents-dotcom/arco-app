import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { requireTeam } from '@/lib/access';
import { syncClientsFromGestao } from '@/lib/gestao-sync';

// App do administrador no celular: abre direto na Produção (lançar tarefa de cada pessoa).
export const metadata: Metadata = {
  manifest: '/admin.webmanifest',
  appleWebApp: { capable: true, title: 'Arco Admin', statusBarStyle: 'default' }
};

// Só o administrador passa daqui (checado antes do carregamento começar).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  // perfil Equipe passa daqui; cada página (menos a Produção) manda a equipe de volta para a Produção
  const v = await requireTeam();
  if (v.staff) return children;
  // Cliente novo na Gestão do Notion entra no app sozinho (no máximo 1 checagem por minuto).
  await Promise.race([syncClientsFromGestao().catch(() => undefined), new Promise((r) => setTimeout(r, 3500))]);
  return children;
}

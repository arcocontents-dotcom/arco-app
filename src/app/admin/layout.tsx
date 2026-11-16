import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/access';
import { syncClientsFromGestao } from '@/lib/gestao-sync';

// Só o administrador passa daqui (checado antes do carregamento começar).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  // Cliente novo na Gestão do Notion entra no app sozinho (no máximo 1 checagem por minuto).
  await Promise.race([syncClientsFromGestao().catch(() => undefined), new Promise((r) => setTimeout(r, 3500))]);
  return children;
}

import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/access';

// Só o administrador passa daqui (checado antes do carregamento começar).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}

import type { ReactNode } from 'react';
import { requireClientAccess } from '@/lib/access';

// A checagem de acesso fica no layout (fora do carregamento), para que acesso negado
// responda 404/redirect de verdade antes de qualquer conteúdo ser enviado.
export default async function ClientLayout({ children, params }: { children: ReactNode; params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  await requireClientAccess(clientId);
  return children;
}

import type { ReactNode } from 'react';
import { requireContentAccess } from '@/lib/access';

export default async function ContentLayout({ children, params }: { children: ReactNode; params: Promise<{ clientId: string; contentId: string }> }) {
  const { clientId, contentId } = await params;
  await requireContentAccess(clientId, contentId);
  return children;
}

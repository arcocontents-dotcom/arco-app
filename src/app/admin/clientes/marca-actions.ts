'use server';

import { requireAdmin } from '@/lib/access';
import { getClientFresh } from '@/lib/notion';
import { marcaDoCliente, type Marca } from '@/lib/marca';

/** Marca do cliente lida do Notion, num pedido separado (a página abre na hora e a marca chega logo depois). */
export async function marcaAction(clientId: string): Promise<{ marca: Marca | null }> {
  await requireAdmin();
  const c = await getClientFresh(String(clientId));
  if (!c) return { marca: null };
  return { marca: await marcaDoCliente(c).catch(() => null) };
}

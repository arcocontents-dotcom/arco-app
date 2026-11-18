'use server';

import { requireAdmin } from '@/lib/access';
import { getClientFresh } from '@/lib/notion';
import { invalidate } from '@/lib/cache';
import { lerMarcaDoNotion, marcaDoCliente, type Marca } from '@/lib/marca';
import { logActivity } from '@/lib/registro';

/** Marca do cliente (da cópia guardada; se não tiver, lê a página Marca no Notion e guarda). */
export async function marcaAction(clientId: string): Promise<{ marca: Marca | null }> {
  await requireAdmin();
  const c = await getClientFresh(String(clientId));
  if (!c) return { marca: null };
  return { marca: await marcaDoCliente(c).catch(() => null) };
}

/** Lê a página Marca do Notion de novo e guarda a cópia (botão "Atualizar do Notion"). */
export async function atualizarMarcaAction(clientId: string): Promise<{ marca: Marca | null }> {
  const who = await requireAdmin();
  const c = await getClientFresh(String(clientId));
  if (!c) return { marca: null };
  invalidate(`contrato:marca:${c.id}`);
  const marca = await lerMarcaDoNotion(c).catch((e) => {
    console.error('[marca] atualizar', e);
    return null;
  });
  if (marca) await logActivity({ area: 'Clientes', who: who.name, item: c.name, itemId: c.id, action: `${who.name} atualizou a marca do Notion` }).catch(() => undefined);
  return { marca };
}

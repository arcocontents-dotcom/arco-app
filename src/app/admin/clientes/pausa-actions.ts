'use server';

import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { MONTHS, addMonths, todayIn } from '@/lib/domain';
import { getClientFresh, setClientPauses } from '@/lib/notion';
import { logActivity } from '@/lib/registro';

type R = { ok: true; paused: boolean; since: string | null } | { ok: false; error: string };

/**
 * Pausar: a partir do mês seguinte a cota do cliente não renova e os atrasados ficam congelados
 * (o mês atual já está contratado e continua contando). Reativar: volta a contar a partir deste mês.
 * Só quem tem "Pausa clientes" nos Acessos (e o administrador principal).
 */
export async function setClientPausedAction(clientId: string, pause: boolean): Promise<R> {
  const who = await requireAdmin();
  if (!who.pause) return { ok: false, error: 'Só a Arco, o Marcos e o Lemuel podem pausar ou reativar um cliente.' };
  const c = await getClientFresh(String(clientId));
  if (!c) return { ok: false, error: 'Cliente não encontrado.' };
  const cur = `${todayIn(env.timeZone).slice(0, 7)}-01`;
  const next = addMonths(cur, 1);
  let pauses = [...c.pauses];
  const open = pauses.find((p) => !p.to);
  if (pause) {
    if (open) return { ok: true, paused: true, since: open.from };
    pauses.push({ from: next, to: null, by: who.name });
  } else {
    if (!open) return { ok: true, paused: false, since: null };
    // reativou antes da pausa começar: a pausa some; senão, fecha a pausa neste mês
    pauses = open.from > cur ? pauses.filter((p) => p !== open) : pauses.map((p) => (p === open ? { ...p, to: cur } : p));
  }
  try {
    await setClientPauses(c.id, pause, pauses);
    const mes = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]}/${d.slice(0, 4)}`;
    await logActivity({
      area: 'Clientes', who: who.name, item: c.name, itemId: c.id,
      action: pause ? `${who.name} pausou o cliente` : `${who.name} reativou o cliente`,
      detail: pause ? `cota congelada a partir de ${mes(next)}` : `volta a contar em ${mes(cur)}`
    });
    return { ok: true, paused: pause, since: pause ? next : null };
  } catch (e) {
    console.error('[clientes] pausa', e);
    return { ok: false, error: 'Não foi possível salvar no Notion.' };
  }
}

'use server';

import { parseDay } from '@/lib/domain';
import { allow } from '@/lib/ratelimit';
import { setShootStatus } from '@/lib/captacao';
import { setContentDone, setRoutineDone, taskBelongsTo, validTeamKey } from '@/lib/producao';

type R = { ok: true } | { ok: false; error: string };

/** Link pessoal da equipe: só marca/desmarca como feito as próprias tarefas. */
export async function teamToggleAction(person: string, k: string, source: string, id: string, day: string | null, done: boolean): Promise<R> {
  if (!validTeamKey(person, k)) return { ok: false, error: 'Link inválido.' };
  if (!allow(`team:${person}`, 120, 60 * 60_000)) return { ok: false, error: 'Muitas alterações. Espere um pouco.' };
  try {
    if (!(await taskBelongsTo(person, source, id))) return { ok: false, error: 'Essa tarefa não é sua.' };
    if (source === 'rotina') {
      const d = parseDay(day ?? '');
      if (!d) return { ok: false, error: 'Dia inválido.' };
      await setRoutineDone(id, d, done);
    } else if (source === 'captacao') {
      await setShootStatus(id, done ? 'Realizada' : 'Agendada');
    } else {
      await setContentDone(id, done);
    }
    return { ok: true };
  } catch (e) {
    console.error('[equipe] marcar', e);
    return { ok: false, error: 'Não foi possível salvar no Notion.' };
  }
}

'use server';

import { parseDay } from '@/lib/domain';
import { allow } from '@/lib/ratelimit';
import { setShootStatus } from '@/lib/captacao';
import { setContentDone, setRoutineDone, taskBelongsTo, validTeamKey } from '@/lib/producao';
import { logHistory } from '@/lib/historico';

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
      await logHistory(id, `${person} ${done ? 'marcou como feita' : 'desmarcou'} (${d.slice(8, 10)}/${d.slice(5, 7)}) pelo link da equipe`);
    } else if (source === 'captacao') {
      await setShootStatus(id, done ? 'Realizada' : 'Agendada');
      await logHistory(id, `${person} ${done ? 'marcou como realizada' : 'voltou para agendada'} pelo link da equipe`);
    } else {
      await setContentDone(id, done);
    }
    return { ok: true };
  } catch (e) {
    console.error('[equipe] marcar', e);
    return { ok: false, error: 'Não foi possível salvar no Notion.' };
  }
}

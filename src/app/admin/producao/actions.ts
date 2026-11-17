'use server';

import { requireAdmin } from '@/lib/access';
import { parseDay, todayIn } from '@/lib/domain';
import { env } from '@/lib/env';
import { diffLine, logHistory } from '@/lib/historico';
import { linkTaskToPlanning, openCards, setTaskCard, type OpenCard } from '@/lib/vinculo';
import {
  FORMATS, ROUTINE_TYPES, TEAM, URGENCY_LABEL, WEEKDAYS, createRoutine, passContent, setContentDone, setRoutineDone, trashRoutine, updateRoutine,
  type RoutineInput
} from '@/lib/producao';

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function clean(x: Partial<RoutineInput>): RoutineInput | string {
  const title = String(x.title ?? '').trim().slice(0, 200);
  if (!title) return 'Escreva a tarefa.';
  const person = String(x.person ?? '');
  if (!(TEAM as readonly string[]).includes(person) && person !== 'Equipe') return 'Escolha quem faz.';
  const type = String(x.type ?? '');
  if (!(ROUTINE_TYPES as readonly string[]).includes(type)) return 'Tipo inválido.';
  const days = (Array.isArray(x.days) ? x.days : []).filter((d) => (WEEKDAYS as readonly string[]).includes(d));
  if (type === 'Tarefa fixa' && !days.length) return 'Tarefa fixa sem dias.';
  const date = x.date ? parseDay(String(x.date)) : null;
  if (type === 'Tarefa' && !date) return 'Escolha a data de entrega.';
  const urgency = (URGENCY_LABEL as readonly string[]).includes(String(x.urgency)) ? (x.urgency as RoutineInput['urgency']) : 'Média';
  const format = (FORMATS as readonly string[]).includes(String(x.format ?? '')) ? (x.format as RoutineInput['format']) : null;
  const formatOther = format === 'Outro' ? String(x.formatOther ?? '').trim().slice(0, 120) : '';
  if (format === 'Outro' && !formatOther) return 'Descreva o formato da tarefa.';
  return { title, person: person as RoutineInput['person'], type: type as RoutineInput['type'], days, date, urgency, client: String(x.client ?? '').trim().slice(0, 120), format, formatOther, desc: String(x.desc ?? '').trim().slice(0, 1900) };
}

const br = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');

export async function toggleRoutineAction(id: string, day: string, done: boolean): Promise<R> {
  const v = await requireAdmin();
  const d = parseDay(day);
  if (!d) return { ok: false, error: 'Dia inválido.' };
  try {
    await setRoutineDone(id, d, done);
    await logHistory(id, `${v.name} ${done ? 'marcou como feita' : 'desmarcou'} (${br(d)})`);
    return { ok: true };
  } catch (e) {
    console.error('[producao] feito', e);
    return { ok: false, error: 'Não foi possível salvar no Notion.' };
  }
}

export async function saveRoutineAction(
  id: string | null,
  x: Partial<RoutineInput>,
  /** Card do Planejamento: id de um existente, 'novo' para criar pendente, 'desligar' para tirar, null para não mexer. */
  link: string | null = 'novo'
): Promise<R<{ id: string; planId: string | null }>> {
  const who = await requireAdmin();
  const v = clean(x);
  if (typeof v === 'string') return { ok: false, error: v };
  try {
    const before = id ? await updateRoutine(id, v) : null;
    const rid = id ?? (await createRoutine(v));
    if (before) {
      const diff = diffLine([
        ['tarefa', before.title, v.title],
        ['pessoa', before.person, v.person],
        ['entrega', br(before.date), br(v.date)],
        ['formato', before.format === 'Outro' ? before.formatOther : before.format, v.format === 'Outro' ? v.formatOther : v.format],
        ['urgência', before.urgency, v.urgency],
        ['cliente', before.client, v.client]
      ]);
      const descChanged = (before.desc ?? '') !== v.desc;
      const line = [diff, descChanged ? 'descrição alterada' : ''].filter(Boolean).join(' · ');
      if (line) await logHistory(rid, `${who.name} editou: ${line}`);
    } else {
      await logHistory(rid, `${who.name} lançou para ${v.person}${v.date ? ` · entrega ${br(v.date)}` : ''}`);
    }
    let planId: string | null = null;
    if (link === 'desligar') {
      if (id) await setTaskCard(rid, null);
    } else if (link && v.client) {
      // card novo (edição/roteiro/postagem de cliente da agência) ou um card que já existe no Planejamento
      planId = await linkTaskToPlanning(rid, { title: v.title, client: v.client, format: v.format, date: v.date, desc: v.desc, person: v.person }, link).catch((e) => {
        console.error('[producao] planejamento', e);
        return null;
      });
    }
    return { ok: true, id: rid, planId };
  } catch (e) {
    console.error('[producao] salvar', e);
    return { ok: false, error: 'Não foi possível salvar no Notion.' };
  }
}

export async function trashRoutineAction(id: string): Promise<R> {
  await requireAdmin();
  try {
    await trashRoutine(id);
    return { ok: true };
  } catch (e) {
    console.error('[producao] apagar', e);
    return { ok: false, error: 'Não foi possível apagar.' };
  }
}

export async function passContentAction(id: string, to: string, editedBy?: string | null): Promise<R> {
  await requireAdmin();
  if (!(TEAM as readonly string[]).includes(to) && to !== 'Finalizado') return { ok: false, error: 'Pessoa inválida.' };
  const by = editedBy && (TEAM as readonly string[]).includes(editedBy) ? (editedBy as (typeof TEAM)[number]) : null;
  try {
    await passContent(id, to as (typeof TEAM)[number] | 'Finalizado', by, todayIn(env.timeZone));
    return { ok: true };
  } catch (e) {
    console.error('[producao] passar', e);
    return { ok: false, error: 'Não foi possível atualizar no Notion.' };
  }
}

export async function toggleContentAction(id: string, done: boolean): Promise<R> {
  await requireAdmin();
  try {
    await setContentDone(id, done);
    return { ok: true };
  } catch (e) {
    console.error('[producao] entregue', e);
    return { ok: false, error: 'Não foi possível salvar no Notion.' };
  }
}

/** Cards abertos do cliente no Planejamento, para ligar a task a um conteúdo que já existe. */
export async function openCardsAction(client: string): Promise<OpenCard[]> {
  await requireAdmin();
  return openCards(String(client).slice(0, 120)).catch(() => []);
}

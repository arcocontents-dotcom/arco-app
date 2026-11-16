'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import { cardTasksAction, createTaskFromCardAction } from '@/app/admin/planejamento/actions';

type Person = 'Lemuel' | 'Marcos' | 'Yan' | 'Rafa';
const TEAM: Person[] = ['Lemuel', 'Marcos', 'Yan', 'Rafa'];
const FORMATS: [string, string][] = [
  ['Editar reels', 'f-reels'], ['Editar post', 'f-post'], ['Editar story', 'f-story'], ['Editar foto', 'f-foto'],
  ['Fazer roteiro', 'f-roteiro'], ['Postar', 'f-postar']
];
const fromKind = (kind: string | null) => {
  const k = (kind ?? '').toLowerCase();
  return k.startsWith('reels') ? 'Editar reels' : k.startsWith('stor') ? 'Editar story' : k.startsWith('foto') ? 'Editar foto' : k.startsWith('post') ? 'Editar post' : null;
};
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** No card do Planejamento: as tarefas da Produção ligadas a ele e o atalho para criar uma já preenchida. */
export default function CardTasks({ clientId, planId, kind, day, today }: { clientId: string; planId: string; kind: string | null; day: string | null; today: string }) {
  const [tasks, setTasks] = useState<{ id: string; title: string; person: string; format: string | null; date: string | null; done: boolean }[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [person, setPerson] = useState<Person | null>(null);
  const [format, setFormat] = useState<string | null>(fromKind(kind));
  const [date, setDate] = useState(day && day >= today ? day : today);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = () => cardTasksAction(planId).then((r) => setTasks(r.ok ? r.tasks : []));
  useEffect(() => {
    setTasks(null);
    setAdding(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  const create = () =>
    start(async () => {
      if (!person) return setErr('Escolha quem faz.');
      setErr(null);
      const r = await createTaskFromCardAction(clientId, planId, { person, format, date });
      if (!r.ok) return setErr(r.error);
      setAdding(false);
      setPerson(null);
      await load();
    });

  return (
    <section className="card-tasks" aria-label="Tarefas na Produção">
      <div className="card-tasks-head">
        <span className="label">Tarefas na Produção</span>
        {!adding && (
          <button type="button" className="link-btn ic-inline" onClick={() => setAdding(true)}><Icon name="plus" size={13} />Criar tarefa</button>
        )}
      </div>
      {tasks === null && <span className="hint">Lendo…</span>}
      {tasks && tasks.length === 0 && !adding && <span className="hint">Nenhuma tarefa ligada ainda.</span>}
      {tasks && tasks.length > 0 && (
        <ul>
          {tasks.map((t) => (
            <li key={t.id} className={t.done ? 'done' : ''}>
              <span className="pav sm">{t.person.charAt(0)}</span>
              <span className="ct-t">{t.format ?? 'Tarefa'} · {t.person}</span>
              <span className="ct-d">{t.done ? 'feita' : t.date ? `entrega ${br(t.date)}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="card-tasks-new" role="group" aria-label="Nova tarefa a partir do card">
          <div className="pchips" role="group" aria-label="Quem faz">
            {TEAM.map((p) => (
              <button key={p} type="button" aria-pressed={person === p} onClick={() => setPerson(p)}><span className="pav sm">{p.charAt(0)}</span>{p}</button>
            ))}
          </div>
          <div className="rf-urg rf-fmt" role="radiogroup" aria-label="Formato da tarefa">
            {FORMATS.map(([v, c]) => (
              <button key={v} type="button" role="radio" aria-checked={format === v} className={c} onClick={() => setFormat(format === v ? null : v)}><i />{v}</button>
            ))}
          </div>
          <label className="rf-row">
            <span className="rf-l">Entrega</span>
            <input type="date" className="ninput" min={today} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Entrega da tarefa" />
          </label>
          <p className="hint" style={{ margin: 0 }}>Título, cliente e o vínculo vêm deste card: não precisa lançar de novo na Produção.</p>
          {err && <p className="error" role="alert" style={{ margin: 0 }}>{err}</p>}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="button" className="btn small" disabled={pending} onClick={create}><Icon name="check" size={14} />{pending ? 'Criando…' : 'Criar tarefa'}</button>
            <button type="button" className="link-btn" onClick={() => setAdding(false)}>Cancelar</button>
            <Link className="link-btn" href="/admin/producao" style={{ marginLeft: 'auto' }}>Ver na Produção</Link>
          </div>
        </div>
      )}
    </section>
  );
}

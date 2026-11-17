'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import { cardTasksAction, createTaskFromCardAction } from '@/app/admin/planejamento/actions';
import { cardLinksAction, linkContentAction, linkTaskAction, type LinkContent } from '@/app/admin/vinculo/actions';

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

  // vínculos: conteúdos da aprovação e tarefas que já existem (mesmo cliente, mesmo formato)
  type Links = { formato: string | null; contents: LinkContent[]; contentOptions: LinkContent[]; taskOptions: { id: string; title: string; person: string; format: string | null; date: string | null; linked: boolean }[] };
  const [links, setLinks] = useState<Links | null>(null);
  const [pickTask, setPickTask] = useState('');
  const [pickContent, setPickContent] = useState('');
  const loadLinks = () => cardLinksAction(planId, clientId).then((r) => setLinks(r.ok ? r : { formato: null, contents: [], contentOptions: [], taskOptions: [] }));
  const load = () => Promise.all([cardTasksAction(planId).then((r) => setTasks(r.ok ? r.tasks : [])), loadLinks()]);
  const link = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (!r.ok) return setErr(r.error);
      setPickTask('');
      setPickContent('');
      await load();
    });
  useEffect(() => {
    setTasks(null);
    setLinks(null);
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
    <section className="card-tasks" aria-label="Vínculos do card">
      <div className="card-tasks-head">
        <span className="label">Vínculos{links?.formato ? ` · só ${links.formato}` : ''}</span>
      </div>
      <p className="hint" style={{ margin: 0 }}>Liga só com o mesmo cliente e o mesmo formato{links?.formato ? ` (${links.formato} com ${links.formato})` : ''}.</p>

      <div className="card-tasks-head">
        <span className="label">Na aprovação</span>
      </div>
      {links === null && <span className="hint">Lendo…</span>}
      {links && links.contents.length === 0 && <span className="hint">Nenhum conteúdo da aprovação ligado.</span>}
      {links && links.contents.length > 0 && (
        <ul>
          {links.contents.map((c) => (
            <li key={c.id}>
              <span className="ct-t"><Link href={`/admin/conteudo/${c.id}`}>{c.type} · {c.title}</Link></span>
              <span className="ct-d">{c.status}</span>
              <button type="button" className="link-btn" disabled={pending} onClick={() => link(() => linkContentAction(c.id, null))}>Desvincular</button>
            </li>
          ))}
        </ul>
      )}
      {links && links.contentOptions.length > 0 && (
        <div className="ct-link">
          <select className="ninput" value={pickContent} onChange={(e) => setPickContent(e.target.value)} aria-label="Vincular conteúdo da aprovação">
            <option value="">Vincular um conteúdo da aprovação…</option>
            {links.contentOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.type} · {c.title}{c.day ? ` · ${br(c.day)}` : ''}{c.planningId ? ' (já ligado a outro card)' : ''}</option>
            ))}
          </select>
          <button type="button" className="btn small outline" disabled={!pickContent || pending} onClick={() => link(() => linkContentAction(pickContent, planId))}>Vincular</button>
        </div>
      )}

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
              <button type="button" className="link-btn" disabled={pending} onClick={() => link(() => linkTaskAction(t.id, null))}>Desvincular</button>
            </li>
          ))}
        </ul>
      )}
      {links && links.taskOptions.length > 0 && !adding && (
        <div className="ct-link">
          <select className="ninput" value={pickTask} onChange={(e) => setPickTask(e.target.value)} aria-label="Vincular tarefa da Produção">
            <option value="">Vincular uma tarefa que já existe…</option>
            {links.taskOptions.map((t) => (
              <option key={t.id} value={t.id}>{t.format} · {t.person} · {t.title}{t.date ? ` · ${br(t.date)}` : ''}{t.linked ? ' (ligada a outro card)' : ''}</option>
            ))}
          </select>
          <button type="button" className="btn small outline" disabled={!pickTask || pending} onClick={() => link(() => linkTaskAction(pickTask, planId))}>Vincular</button>
        </div>
      )}
      {err && !adding && <p className="error" role="alert" style={{ margin: 0 }}>{err}</p>}
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

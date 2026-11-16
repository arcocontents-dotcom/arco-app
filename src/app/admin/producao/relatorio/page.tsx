import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { listClients } from '@/lib/notion';
import { MONTHS, addDays, addMonths, dayNum, monthGrid, parseDay, todayIn, yearNum } from '@/lib/domain';
import { TEAM, productionWeek, type ProdTask } from '@/lib/producao';
import AdminShell from '@/components/AdminShell';
import Icon from '@/components/Icon';
import ProdTabs from '@/components/ProdTabs';

export const dynamic = 'force-dynamic';

// Relatório da Produção: tudo vem só do que está na aba Produção (tarefas lançadas e marcadas).

const CATS = [
  { k: 'reels', label: 'Reels', cls: 'f-reels' },
  { k: 'post', label: 'Post', cls: 'f-post' },
  { k: 'story', label: 'Story', cls: 'f-story' },
  { k: 'foto', label: 'Foto', cls: 'f-foto' },
  { k: 'postar', label: 'Postar', cls: 'f-postar' },
  { k: 'roteiro', label: 'Roteiro', cls: 'f-roteiro' },
  { k: 'captacao', label: 'Captação', cls: 'f-capt' },
  { k: 'outro', label: 'Outros', cls: 'f-outro' }
] as const;
type Cat = (typeof CATS)[number]['k'];

function catOf(t: ProdTask): Cat {
  if (t.source === 'captacao') return 'captacao';
  const f = (t.source === 'rotina' ? t.fmt ?? '' : t.kind ?? '').toLowerCase();
  if (f.includes('reels') || f.startsWith('víd')) return 'reels';
  if (f.startsWith('postar')) return 'postar';
  if (f.includes('post')) return 'post';
  if (f.includes('stor')) return 'story';
  if (f.includes('foto')) return 'foto';
  if (f.includes('roteiro')) return 'roteiro';
  return 'outro';
}

type Stat = { total: number; done: number; late: number; cats: Record<Cat, number> };
const empty = (): Stat => ({ total: 0, done: 0, late: 0, cats: Object.fromEntries(CATS.map((c) => [c.k, 0])) as Record<Cat, number> });
const pct = (s: Stat) => (s.total ? Math.round((s.done / s.total) * 100) : 0);

export default async function RelatorioProducao({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayIn(env.timeZone);
  const first = `${(parseDay(sp.m) ?? parseDay(`${sp.m}-01`) ?? today).slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);
  const grid = monthGrid(first);
  const clients = (await listClients()).filter((c) => !c.cancelled);
  const data = await productionWeek(grid[0].day, today, clients.map((c) => ({ id: c.id, name: c.name, calName: c.calName })), grid[grid.length - 1].day);

  // Só o que é do mês; tarefas fixas ficam à parte (são diárias)
  const inMonth = data.tasks.filter((t) => t.day && t.day >= first && t.day <= last && t.person !== 'Equipe');
  const tasks = inMonth.filter((t) => t.type !== 'Tarefa fixa');
  const fixed = inMonth.filter((t) => t.type === 'Tarefa fixa' && t.day! <= today);

  const add = (s: Stat, t: ProdTask) => {
    s.total++;
    if (t.done) {
      s.done++;
      s.cats[catOf(t)]++;
    } else if (t.day! < today) s.late++;
  };
  const total = empty();
  const people = TEAM.map((name) => ({ name, s: empty(), fixedDone: 0, fixedTotal: 0 }));
  for (const t of tasks) {
    add(total, t);
    const p = people.find((x) => x.name === t.person);
    if (p) add(p.s, t);
  }
  for (const t of fixed) {
    const p = people.find((x) => x.name === t.person);
    if (!p) continue;
    p.fixedTotal++;
    if (t.done) p.fixedDone++;
  }
  const weeks: { start: string; s: Stat }[] = [];
  for (let d = grid[0].day; d <= last; d = addDays(d, 7)) {
    const s = empty();
    for (const t of tasks) if (t.day! >= d && t.day! <= addDays(d, 6)) add(s, t);
    weeks.push({ start: d, s });
  }
  const best = [...people].filter((p) => p.s.done).sort((a, b) => b.s.done - a.s.done)[0];
  const q = (d: string) => `/admin/producao/relatorio?m=${d.slice(0, 7)}`;

  return (
    <AdminShell section="producao">
      <div className="toolbar">
        <div className="page-title">
          <p className="label rise ic-inline"><Icon name="chart" size={14} />Tudo o que foi lançado e entregue na Produção</p>
          <h1 className="display rise" style={{ fontSize: 'clamp(40px, 6vw, 80px)', ['--d' as string]: '60ms' }}>Relatório</h1>
        </div>
        <div className="actions rise" style={{ ['--d' as string]: '100ms', alignItems: 'center' }}>
          <Link className="icon-btn" href={q(addMonths(first, -1))} aria-label="Mês anterior"><Icon name="left" /></Link>
          <span className="label" style={{ minWidth: 130, textAlign: 'center' }}>{MONTHS[Number(first.slice(5, 7)) - 1]} {yearNum(first)}</span>
          <Link className="icon-btn" href={q(addMonths(first, 1))} aria-label="Próximo mês"><Icon name="right" /></Link>
        </div>
      </div>
      <ProdTabs active="relatorio" />

      <div className="rp">
        <section className="rp-kpis four rise" aria-label="Totais do mês">
          <div className="rp-kpi main"><strong>{pct(total)}%</strong><span>Efetividade da equipe</span></div>
          <div className="rp-kpi"><strong>{total.done}</strong><span>Entregues</span></div>
          <div className="rp-kpi"><strong>{total.total}</strong><span>Lançadas</span></div>
          <div className="rp-kpi late"><strong>{total.late}</strong><span>Atrasadas</span></div>
        </section>

        <section className="rp-card rise" aria-label="Por pessoa" style={{ ['--d' as string]: '80ms' }}>
          <h2 className="label">Por pessoa{best ? ` · quem mais entregou: ${best.name}` : ''}</h2>
          <div className="rp-people">
            {people.map((p) => (
              <div key={p.name} className="rp-person">
                <span className="pav">{p.name.charAt(0)}</span>
                <div className="rp-person-main">
                  <div className="rp-person-top">
                    <strong>{p.name}</strong>
                    <span className="rp-nums">
                      {CATS.filter((c) => p.s.cats[c.k]).map((c) => (
                        <span key={c.k} className={`rp-num ${c.cls}`}><i />{p.s.cats[c.k]} <small>{c.label}</small></span>
                      ))}
                    </span>
                    <span className="rp-rec">
                      {p.s.done} de {p.s.total} entregues{p.s.late ? ` · ${p.s.late} atrasada${p.s.late > 1 ? 's' : ''}` : ''}
                      {p.fixedTotal ? ` · fixas ${p.fixedDone}/${p.fixedTotal}` : ''}
                    </span>
                    <b>{pct(p.s)}%</b>
                  </div>
                  <div className="rp-bar" aria-hidden="true"><span style={{ width: `${pct(p.s)}%` }} /></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="rp-grid">
          <section className="rp-card rise" aria-label="Por semana" style={{ ['--d' as string]: '120ms' }}>
            <h2 className="label">Por semana · entregues de lançadas</h2>
            <div className="rp-weeks">
              {weeks.map((w) => (
                <div key={w.start} className="rp-week">
                  <span className="rp-week-l">{dayNum(w.start)}–{dayNum(addDays(w.start, 6))}</span>
                  <div className="rp-bar" aria-hidden="true"><span style={{ width: `${pct(w.s)}%` }} /></div>
                  <b>{w.s.done}/{w.s.total}</b>
                </div>
              ))}
            </div>
          </section>
          <section className="rp-card rise" aria-label="Por formato" style={{ ['--d' as string]: '160ms' }}>
            <h2 className="label">Entregues por formato</h2>
            <ul className="rp-clients">
              {CATS.map((c) => (
                <li key={c.k}>
                  <span className={`rp-num ${c.cls}`}><i />{c.label}</span>
                  <b>{total.cats[c.k]}</b>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <p className="hint rp-note">
          Conta as tarefas da aba <b>Produção</b> com entrega no mês: conteúdos com a pessoa, tasks lançadas e captações. <b>Entregue</b> = marcada como feita. Tarefas fixas aparecem à parte (são diárias).
        </p>
      </div>
    </AdminShell>
  );
}

import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { listAllContentsInRange, listClients } from '@/lib/notion';
import { MONTHS, addDays, addMonths, monthGrid, parseDay, todayIn, yearNum } from '@/lib/domain';
import { METRICS, TEAM, productionWeek, teamDashboard, type Metric } from '@/lib/producao';
import AdminShell from '@/components/AdminShell';
import Icon from '@/components/Icon';
import ProdTabs from '@/components/ProdTabs';

export const dynamic = 'force-dynamic';

// Dashboard da produção da equipe: o que cada um captou, editou e postou no mês.

export default async function RelatorioProducao({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayIn(env.timeZone);
  const first = `${(parseDay(sp.m) ?? parseDay(`${sp.m}-01`) ?? today).slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);
  const grid = monthGrid(first);
  const clients = (await listClients()).filter((c) => !c.cancelled);
  const [dash, contents, week] = await Promise.all([
    teamDashboard(first, today),
    listAllContentsInRange(first, last).catch(() => []),
    productionWeek(grid[0].day, today, clients.map((c) => ({ id: c.id, name: c.name, calName: c.calName })), grid[grid.length - 1].day).catch(() => null)
  ]);

  // Aprovação: conteúdos do mês que o cliente aprovou ou que já foram postados
  const made = contents.filter((c) => c.status === 'Aprovado' || c.status === 'Postado');
  const count = (types: string[]) => {
    const xs = made.filter((c) => types.includes(c.type));
    return { n: xs.length, posted: xs.filter((c) => c.status === 'Postado').length };
  };
  const posts = count(['Post', 'Carrossel']);
  const videos = count(['Reels']);
  const stories = count(['Story']);
  const d = typeof dash === 'string' ? null : dash;

  // Efetividade: tarefas lançadas na aba Produção com entrega no mês
  const eff = new Map<string, { done: number; total: number }>();
  for (const t of week?.tasks ?? []) {
    if (!t.day || t.day < first || t.day > last || t.type === 'Tarefa fixa' || t.person === 'Equipe') continue;
    const e = eff.get(t.person) ?? { done: 0, total: 0 };
    e.total++;
    if (t.done) e.done++;
    eff.set(t.person, e);
  }

  const max = (k: Metric) => Math.max(1, ...(d?.people ?? []).map((p) => p.m[k]));
  const sum = (m: Record<Metric, number>) => METRICS.reduce((a, x) => a + m[x.k], 0);
  const q = (x: string) => `/admin/producao/relatorio?m=${x.slice(0, 7)}`;
  const kpis = [
    { label: 'Posts feitos', n: posts.n, sub: `${posts.posted} postados · aprovação`, cls: 'f-post' },
    { label: 'Vídeos feitos', n: videos.n, sub: `${videos.posted} postados · aprovação`, cls: 'f-reels' },
    { label: 'Stories feitos', n: stories.n, sub: `${stories.posted} postados · aprovação`, cls: 'f-story' },
    { label: 'Captações feitas', n: d?.team.captacoes ?? 0, sub: 'Notion · 📸 Captações', cls: 'f-capt' }
  ];

  return (
    <AdminShell section="producao">
      <div className="toolbar">
        <div className="page-title">
          <p className="label rise ic-inline"><Icon name="chart" size={14} />Produção geral da equipe</p>
          <h1 className="display rise" style={{ fontSize: 'clamp(40px, 6vw, 80px)', ['--d' as string]: '60ms' }}>Dashboard</h1>
        </div>
        <div className="actions rise" style={{ ['--d' as string]: '100ms', alignItems: 'center' }}>
          <Link className="icon-btn" href={q(addMonths(first, -1))} aria-label="Mês anterior"><Icon name="left" /></Link>
          <span className="label" style={{ minWidth: 130, textAlign: 'center' }}>{MONTHS[Number(first.slice(5, 7)) - 1]} {yearNum(first)}</span>
          <Link className="icon-btn" href={q(addMonths(first, 1))} aria-label="Próximo mês"><Icon name="right" /></Link>
        </div>
      </div>
      <ProdTabs active="relatorio" />

      <div className="rp">
        <section className="db-kpis rise" aria-label="Totais do mês">
          {kpis.map((k) => (
            <div key={k.label} className={`db-kpi ${k.cls}`}>
              <span className="db-kpi-l"><i />{k.label}</span>
              <strong>{k.n}</strong>
              <small>{k.sub}</small>
            </div>
          ))}
        </section>

        {!d && <p className="hint">Não deu para ler o Calendário mensal agora. Tente atualizar a página.</p>}

        <section className="db-people" aria-label="Por pessoa">
          {TEAM.map((name, i) => {
            const p = d?.people.find((x) => x.name === name);
            const m = p?.m;
            const e = eff.get(name);
            const rows = METRICS.filter((x) => (m?.[x.k] ?? 0) > 0);
            const zeros = METRICS.filter((x) => !(m?.[x.k] ?? 0));
            return (
              <article key={name} className="db-person rise" style={{ ['--d' as string]: `${80 + i * 40}ms` }}>
                <header>
                  <span className="pav">{name.charAt(0)}</span>
                  <div>
                    <strong>{name}</strong>
                    <small>{m ? sum(m) : 0} entregas no mês</small>
                  </div>
                  {e && e.total > 0 && (
                    <span className="db-eff" title="Tarefas da aba Produção entregues">
                      <b>{Math.round((e.done / e.total) * 100)}%</b>
                      <small>{e.done}/{e.total} tasks</small>
                    </span>
                  )}
                </header>
                <ul>
                  {rows.map((x) => (
                    <li key={x.k} className={x.cls}>
                      <span className="db-l"><i />{x.label}</span>
                      <span className="db-bar" aria-hidden="true"><span style={{ width: `${Math.round((m![x.k] / max(x.k)) * 100)}%` }} /></span>
                      <b>{m![x.k]}</b>
                    </li>
                  ))}
                  {!rows.length && <li className="db-empty">Nada registrado neste mês.</li>}
                </ul>
                {rows.length > 0 && zeros.length > 0 && (
                  <p className="db-zeros">Sem registro: {zeros.map((x) => x.label.toLowerCase()).join(', ')}</p>
                )}
              </article>
            );
          })}
        </section>

        <section className="rp-card rise" aria-label="Equipe no mês" style={{ ['--d' as string]: '260ms' }}>
          <h2 className="label">Equipe no mês</h2>
          <div className="db-team">
            {METRICS.map((x) => (
              <div key={x.k} className={`db-team-i ${x.cls}`}>
                <strong>{d?.team[x.k] ?? 0}</strong>
                <span><i />{x.label}</span>
              </div>
            ))}
          </div>
        </section>

        <p className="hint rp-note">
          Posts, vídeos e stories feitos vêm da <b>Aprovação</b> (aprovados ou postados no mês). Captações vêm do <b>📸 Captações</b> no Notion.
          Por pessoa: <b>captou</b> = “Gravado/Briefing por”, <b>editou</b> = “Editado/Design por”, <b>postou</b> = “Postado por” no Calendário mensal,
          somados às tasks da aba Produção marcadas como feitas (Editar…, Postar, Fazer roteiro).
        </p>
      </div>
    </AdminShell>
  );
}

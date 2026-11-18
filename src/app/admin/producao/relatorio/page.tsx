import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { listClients } from '@/lib/notion';
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
  const [dash, week] = await Promise.all([
    teamDashboard(first, today),
    productionWeek(grid[0].day, today, clients.map((c) => ({ id: c.id, name: c.name, calName: c.calName })), grid[grid.length - 1].day).catch(() => null)
  ]);

  const d = typeof dash === 'string' ? null : dash;
  const ps = d?.posted;

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
    { label: 'Postado no Instagram', n: ps?.total ?? 0, sub: `${ps?.equipe ?? 0} pela equipe · ${ps?.cliente ?? 0} pelo cliente`, cls: 'f-postar main' },
    { label: 'Reels postados', n: ps?.reels ?? 0, sub: 'vídeos no feed', cls: 'f-reels' },
    { label: 'Posts estáticos', n: ps?.post ?? 0, sub: 'post, carrossel e fotos', cls: 'f-post' },
    { label: 'Stories postados', n: ps?.story ?? 0, sub: 'stories', cls: 'f-story' },
    { label: 'Captações feitas', n: d?.team.captacoes ?? 0, sub: `${d?.team.captou ?? 0} vídeos captados · ${d?.agendamentos.total ?? 0} agendadas`, cls: 'f-capt' }
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
              <details key={name} className="db-person rise" style={{ ['--d' as string]: `${80 + i * 40}ms` }}>
                <summary aria-label={`Ver tudo o que ${name} produziu`}>
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
                      {x.k === 'captou' && p && p.dupla > 0 && (
                        <small className="db-split">{m!.captou - p.dupla} sozinho · {p.dupla} em dupla (no total da equipe cada vídeo conta 1 vez)</small>
                      )}
                      {x.k === 'postou' && p && (
                        <small className="db-split">
                          {[['reels', 'reels'], ['post', 'posts estáticos'], ['story', 'stories'], ['outro', 'outros']]
                            .filter(([k]) => p.posted[k as 'reels'])
                            .map(([k, l]) => `${p.posted[k as 'reels']} ${l}`)
                            .join(' · ')}
                        </small>
                      )}
                    </li>
                  ))}
                  {!rows.length && <li className="db-empty">Nada registrado neste mês.</li>}
                </ul>
                {rows.length > 0 && zeros.length > 0 && (
                  <p className="db-zeros">Sem registro: {zeros.map((x) => x.label.toLowerCase()).join(', ')}</p>
                )}
                {rows.length > 0 && <span className="db-more">Ver tudo o que {name} produziu <Icon name="right" size={12} /></span>}
                </summary>
                {p && p.items.length > 0 && (
                  <div className="db-items" aria-label={`Tudo o que ${name} produziu`}>
                    {rows.map((x) => (
                      <section key={x.k} className={x.cls}>
                        <h3><i />{x.label} <b>{m![x.k]}</b></h3>
                        <ul>
                          {p.items.filter((it) => it.k === x.k).map((it, j) => (
                            <li key={`${it.url}-${j}`}>
                              <span className="db-day">{it.day ? `${it.day.slice(8, 10)}/${it.day.slice(5, 7)}` : '—'}</span>
                              {it.url ? <a href={it.url.replace(/^https:\/\/www\.notion\.so\//, 'notion://www.notion.so/')} className="db-it">{it.title}</a> : <span className="db-it">{it.title}</span>}
                              {it.client && <span className="db-cl">{it.client}</span>}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </details>
            );
          })}
        </section>

        {d && (
          <section className="rp-card rise" aria-label="Captações agendadas" style={{ ['--d' as string]: '220ms' }}>
            <h2 className="label">Captações agendadas no mês · {d.agendamentos.total} no total</h2>
            <div className="ag-bases" role="list" aria-label="Agendamentos por base">
              <div role="listitem"><strong>{d.agendamentos.porBase.Marcos}</strong><span className="label">Base Marcos</span></div>
              <div role="listitem"><strong>{d.agendamentos.porBase.Lemuel}</strong><span className="label">Base Lemuel</span></div>
              {d.agendamentos.porBase.Outros > 0 && <div role="listitem"><strong>{d.agendamentos.porBase.Outros}</strong><span className="label">Avulsos / sem base</span></div>}
              <div role="listitem" className="ag-total"><strong>{d.agendamentos.total}</strong><span className="label">Total da Arco</span></div>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              Contados pela data agendada, cada agendamento uma vez: captações da aba Captação{d.agendamentos.agenda === 'ok' ? ' + eventos da agenda' : ''}. Cada captação marcada no app conta como produção de quem agendou.
              {d.agendamentos.agenda === 'erro' && ' A agenda não respondeu agora: o total mostra só as captações do app.'}
            </p>
            <ul className="ag-rank">
              {d.agendamentos.porPessoa.map((x) => (
                <li key={x.name}>
                  <span className="pav sm">{x.name.charAt(0)}</span>
                  <span className="ag-name">{x.name}</span>
                  <span className="db-bar" aria-hidden="true" style={{ ['--fc' as string]: '#e03e3e' }}><span style={{ width: `${Math.round((x.n / Math.max(1, d.agendamentos.porPessoa[0]?.n ?? 1)) * 100)}%` }} /></span>
                  <b>{x.n}</b>
                </li>
              ))}
              {!d.agendamentos.porPessoa.length && <li className="hint">Nenhuma captação agendada pelo app neste mês.</li>}
            </ul>
            {d.agendamentos.lista.length > 0 && (
              <details className="ag-hist" open={d.agendamentos.lista.length <= 12}>
                <summary className="label">Histórico de agendamentos da agência · {d.agendamentos.lista.length}</summary>
                <table className="ag-table">
                  <thead>
                    <tr><th>Dia agendado</th><th>Base</th><th>Quem agendou</th><th>Cliente</th><th>Captação</th><th>Agendou em</th><th>Situação</th></tr>
                  </thead>
                  <tbody>
                    {d.agendamentos.lista.map((x) => (
                      <tr key={x.id} className={x.status === 'Cancelada' ? 'cancel' : ''}>
                        <td>{x.day ? `${x.day.slice(8, 10)}/${x.day.slice(5, 7)}` : '—'}</td>
                        <td>{x.base ? `Base ${x.base}` : 'Avulso / sem base'}</td>
                        <td>{x.by}</td>
                        <td>{x.client ?? '—'}</td>
                        <td>{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.title}</a> : x.title}</td>
                        <td>{x.fonte === 'app' ? `${x.createdAt.slice(8, 10)}/${x.createdAt.slice(5, 7)}` : 'agenda'}</td>
                        <td>{x.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </section>
        )}

        {ps && (
          <section className="rp-card rise" aria-label="Postado no Instagram" style={{ ['--d' as string]: '240ms' }}>
            <h2 className="label">Postado no Instagram · quem postou</h2>
            <div className="db-team">
              <div className="db-team-i f-postar"><strong>{ps.equipe}</strong><span><i />Pela equipe</span></div>
              <div className="db-team-i f-outro"><strong>{ps.cliente}</strong><span><i />Pelo cliente</span></div>
              <div className="db-team-i f-outro"><strong>{ps.semQuem}</strong><span><i />Sem “Postado por”</span></div>
              <div className="db-team-i f-postar"><strong>{ps.total}</strong><span><i />Total postado</span></div>
            </div>
          </section>
        )}

        <section className="rp-card rise" aria-label="Equipe no mês" style={{ ['--d' as string]: '260ms' }}>
          <h2 className="label">Equipe no mês</h2>
          <div className="db-team">
            {METRICS.map((x) => (
              <div key={x.k} className={`db-team-i ${x.cls}`}>
                <strong>{d?.team[x.k] ?? 0}</strong>
                <span><i />{x.label}{x.k === 'captou' || x.k === 'captacoes' ? ' (sem repetir)' : ''}</span>
              </div>
            ))}
          </div>
        </section>

        <p className="hint rp-note">
          Postado no Instagram: cards do Calendário mensal com <b>data de postagem no mês</b> e marcados como Finalizado/Postado, separados pelo “Tipo de demanda” e pelo “Postado por” (equipe ou Cliente). <b>Captações</b>: cada cliente gravado no mês conta como uma captação de quem foi (“Gravado/Briefing por” + “Gravado quando” no Calendário mensal), somando as agendadas na aba Captação. <b>Vídeos captados</b>: reels e stories com quem gravou.
          Por pessoa: <b>captou</b> = “Gravado/Briefing por”, <b>editou</b> = “Editado/Design por”, <b>postou</b> = “Postado por” no Calendário mensal,
          somados às tasks da aba Produção marcadas como feitas (Editar…, Postar, Fazer roteiro).
        </p>
      </div>
    </AdminShell>
  );
}

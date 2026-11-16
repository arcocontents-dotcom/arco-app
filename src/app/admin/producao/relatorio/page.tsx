import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { MONTHS, addDays, addMonths, dayNum, parseDay, todayIn, yearNum } from '@/lib/domain';
import { productionReport, type Counts, type Fmt } from '@/lib/producao';
import AdminShell from '@/components/AdminShell';
import Icon from '@/components/Icon';
import ProdTabs from '@/components/ProdTabs';

export const dynamic = 'force-dynamic';

const FMTS: { k: Fmt; label: string; plural: string }[] = [
  { k: 'reels', label: 'Reels', plural: 'Vídeos (Reels)' },
  { k: 'post', label: 'Post', plural: 'Posts' },
  { k: 'story', label: 'Story', plural: 'Stories' },
  { k: 'foto', label: 'Fotos', plural: 'Fotos' }
];

/** Barra empilhada por formato, nas cores do Notion. */
function Stack({ c, max }: { c: Counts; max: number }) {
  return (
    <div className="rp-stack" aria-hidden="true">
      {FMTS.map((f) =>
        c[f.k] ? <span key={f.k} className={`rp-seg f-${f.k}`} style={{ width: `${(c[f.k] / Math.max(max, 1)) * 100}%` }} /> : null
      )}
    </div>
  );
}

export default async function RelatorioProducao({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayIn(env.timeZone);
  const first = `${(parseDay(sp.m) ?? parseDay(`${sp.m}-01`) ?? today).slice(0, 7)}-01`;
  const rep = await productionReport(first);
  const q = (d: string) => `/admin/producao/relatorio?m=${d.slice(0, 7)}`;
  const maxPerson = typeof rep === 'string' ? 1 : Math.max(1, ...rep.people.map((p) => p.counts.total));
  const maxWeek = typeof rep === 'string' ? 1 : Math.max(1, ...rep.weeks.map((w) => w.counts.total));

  return (
    <AdminShell section="producao">
      <div className="toolbar">
        <div className="page-title">
          <p className="label rise ic-inline"><Icon name="chart" size={14} />Relatório geral: quem editou e quem gravou no mês</p>
          <h1 className="display rise" style={{ fontSize: 'clamp(40px, 6vw, 80px)', ['--d' as string]: '60ms' }}>Produção</h1>
        </div>
        <div className="actions rise" style={{ ['--d' as string]: '100ms', alignItems: 'center' }}>
          <Link className="icon-btn" href={q(addMonths(first, -1))} aria-label="Mês anterior"><Icon name="left" /></Link>
          <span className="label" style={{ minWidth: 130, textAlign: 'center' }}>{MONTHS[Number(first.slice(5, 7)) - 1]} {yearNum(first)}</span>
          <Link className="icon-btn" href={q(addMonths(first, 1))} aria-label="Próximo mês"><Icon name="right" /></Link>
        </div>
      </div>
      <ProdTabs active="relatorio" />

      {typeof rep === 'string' ? (
        <p className="error">Não foi possível ler o Calendário mensal agora.</p>
      ) : (
        <div className="rp">
          {(() => {
            const topEdit = [...rep.people].sort((a, b) => b.counts.total - a.counts.total)[0];
            const topRec = [...rep.people].sort((a, b) => b.shoots + b.recorded - (a.shoots + a.recorded))[0];
            return (
              <section className="rp-top rise" aria-label="Destaques do mês">
                <div><span className="label">Quem mais editou</span><strong>{topEdit && topEdit.counts.total ? topEdit.name : '—'}</strong><small>{topEdit?.counts.total ?? 0} conteúdos</small></div>
                <div><span className="label">Quem mais gravou</span><strong>{topRec && topRec.shoots + topRec.recorded ? topRec.name : '—'}</strong><small>{topRec ? `${topRec.shoots} captações · ${topRec.recorded} conteúdos` : ''}</small></div>
                <div><span className="label">Captações realizadas</span><strong>{rep.shoots}</strong><small>no mês</small></div>
                <div><span className="label">Conteúdos gravados</span><strong>{rep.recorded}</strong><small>Gravado/Briefing por</small></div>
              </section>
            );
          })()}
          <section className="rp-kpis rise" aria-label="Totais do mês">
            <div className="rp-kpi main"><strong>{rep.total.total}</strong><span>Conteúdos editados</span></div>
            {FMTS.map((f) => (
              <div key={f.k} className={`rp-kpi f-${f.k}`}><strong>{rep.total[f.k]}</strong><span>{f.plural}</span></div>
            ))}
          </section>

          <section className="rp-card rise" aria-label="Por pessoa" style={{ ['--d' as string]: '80ms' }}>
            <h2 className="label">Por pessoa · editou e gravou</h2>
            <div className="rp-people">
              {rep.people.map((p) => (
                <div key={p.name} className="rp-person">
                  <span className="pav">{p.name.charAt(0)}</span>
                  <div className="rp-person-main">
                    <div className="rp-person-top">
                      <strong>{p.name}</strong>
                      <span className="rp-nums">
                        {FMTS.map((f) => (
                          <span key={f.k} className={`rp-num f-${f.k}`} title={f.plural}><i />{p.counts[f.k]} <small>{f.label}</small></span>
                        ))}
                      </span>
                      <span className="rp-rec" title="Gravações">
                        <Icon name="video" size={12} />{p.shoots} captaç{p.shoots === 1 ? 'ão' : 'ões'} · {p.recorded} gravado{p.recorded === 1 ? '' : 's'}
                      </span>
                      <b title="Editados">{p.counts.total}</b>
                    </div>
                    <Stack c={p.counts} max={maxPerson} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="rp-grid">
            <section className="rp-card rise" aria-label="Por semana" style={{ ['--d' as string]: '120ms' }}>
              <h2 className="label">Por semana</h2>
              <div className="rp-weeks">
                {rep.weeks.map((w) => (
                  <div key={w.start} className="rp-week">
                    <span className="rp-week-l">{dayNum(w.start)}–{dayNum(addDays(w.start, 6))}</span>
                    <Stack c={w.counts} max={maxWeek} />
                    <b>{w.counts.total}</b>
                  </div>
                ))}
              </div>
            </section>
            <section className="rp-card rise" aria-label="Por cliente" style={{ ['--d' as string]: '160ms' }}>
              <h2 className="label">Por cliente</h2>
              {rep.clients.length ? (
                <ul className="rp-clients">
                  {rep.clients.map((c) => (
                    <li key={c.name}>
                      <span>{c.name}</span>
                      <span className="rp-nums">
                        {FMTS.map((f) => (c.counts[f.k] ? <span key={f.k} className={`rp-num f-${f.k}`}><i />{c.counts[f.k]}</span> : null))}
                      </span>
                      <b>{c.counts.total}</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">Nada editado neste mês ainda.</p>
              )}
            </section>
          </div>

          <p className="hint rp-note">
            Editou: <b>Editado/Design por</b> + <b>Editado quando</b> do Calendário mensal (preenchido ao <b>Transferir</b> na Produção) e tasks com formato marcadas como feitas. Gravou: captações <b>Realizadas</b> em 📸 Captações (quem foi) e <b>Gravado/Briefing por</b> + <b>Gravado quando</b>.
            {rep.noEditor > 0 && <> {rep.noEditor} conteúdo{rep.noEditor > 1 ? 's' : ''} entregue{rep.noEditor > 1 ? 's' : ''} no mês sem editor marcado.</>}
          </p>
        </div>
      )}
    </AdminShell>
  );
}

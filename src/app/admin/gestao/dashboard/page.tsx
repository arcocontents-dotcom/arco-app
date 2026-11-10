import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { listAllContentsInRange, listAllOpenContents, listClients, sameId } from '@/lib/notion';
import {
  MONTHS,
  PROD_GROUPS,
  addDays,
  addMonths,
  dayLabel,
  localParts,
  monthIdx,
  parseDay,
  production,
  todayIn,
  yearNum,
  type ProdNumbers
} from '@/lib/domain';
import AdminShell from '@/components/AdminShell';
import GestaoTabs from '@/components/GestaoTabs';
import { ArrowLeft, ArrowRight } from '@/components/icons';

export const dynamic = 'force-dynamic';

const ROWS: { key: keyof ProdNumbers; label: string; hint: string; cls?: string }[] = [
  { key: 'planned', label: 'Planejados', hint: 'Tudo que está no calendário do mês (sem rascunhos).' },
  { key: 'posted', label: 'Postados', hint: 'Marcados como postados.', cls: 's-Aprovado' },
  { key: 'late', label: 'Atrasados', hint: 'A data já passou e ainda não foi marcado como postado.', cls: 's-Reprovado' },
  { key: 'approvedClean', label: 'Aprovados sem ajuste', hint: 'O cliente aprovou de primeira.', cls: 's-Aprovado' },
  { key: 'approvedAdjusted', label: 'Aprovados com ajuste', hint: 'Aprovados depois de pedir ajuste ou reprovar.', cls: 's-Ajustes' },
  { key: 'waiting', label: 'Aguardando o cliente', hint: 'Enviados e ainda sem resposta.', cls: 's-Aguardando' }
];

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ m?: string; c?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayIn(env.timeZone);
  const nowTime = localParts(new Date().toISOString(), env.timeZone).time ?? '00:00';
  const base = parseDay(sp.m) ?? today;
  const first = `${base.slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);

  const [all, contents, open] = await Promise.all([
    listClients(),
    listAllContentsInRange(first, last).catch(() => []),
    listAllOpenContents().catch(() => [])
  ]);
  const active = all.filter((c) => !c.cancelled);
  const isActive = (id: string | null) => active.some((c) => sameId(c.id, id));
  const client = sp.c ? active.find((c) => sameId(c.id, sp.c!)) ?? null : null;
  const scoped = contents.filter((x) => isActive(x.clientId) && (!client || sameId(x.clientId, client.id)));
  const nums = production(scoped, today, nowTime);

  const perClient = active
    .map((c) => ({ c, n: production(contents.filter((x) => sameId(x.clientId, c.id)), today, nowTime).Total }))
    .filter((r) => r.n.planned > 0)
    .sort((a, b) => b.n.late - a.n.late || b.n.planned - a.n.planned);

  const attention = open
    .filter((x) => (x.status === 'Ajustes' || x.status === 'Reprovado') && isActive(x.clientId) && (!client || sameId(x.clientId, client.id)))
    .slice(0, 30);
  const lateList = scoped
    .filter((x) => x.status !== 'Postado' && x.day && (x.day < today || (x.day === today && !!x.time && x.time < nowTime)))
    .slice(0, 30);
  const nameOf = (id: string | null) => all.find((c) => sameId(c.id, id))?.name ?? '';
  const q = (m: string, c?: string | null) => `/admin/gestao/dashboard?m=${m}${c ? `&c=${c}` : ''}`;
  const rate = nums.Total.approvedClean + nums.Total.approvedAdjusted
    ? Math.round((nums.Total.approvedClean / (nums.Total.approvedClean + nums.Total.approvedAdjusted)) * 100)
    : null;

  return (
    <AdminShell section="gestao">
      <div className="toolbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="label rise">Arco Contents · administração</p>
          <h1 className="display rise" style={{ fontSize: 'clamp(44px, 7vw, 88px)', ['--d' as string]: '60ms' }}>Gestão</h1>
        </div>
        <div className="actions rise" style={{ ['--d' as string]: '120ms' }}>
          <a className="btn small" href="/admin/clientes/novo">+ Novo cliente</a>
        </div>
      </div>

      <GestaoTabs tab="dashboard" />

      <div className="toolbar rise" style={{ ['--d' as string]: '140ms' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <a className="icon-btn" href={q(addMonths(first, -1), client?.id)} aria-label="Mês anterior"><ArrowLeft /></a>
          <h2 className="display" style={{ fontSize: 'clamp(28px, 4vw, 44px)' }}>{MONTHS[monthIdx(first)]} {yearNum(first)}</h2>
          <a className="icon-btn" href={q(addMonths(first, 1), client?.id)} aria-label="Próximo mês"><ArrowRight /></a>
        </div>
        <form method="get" action="/admin/gestao/dashboard" style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <input type="hidden" name="m" value={first} />
          <div className="field" style={{ minWidth: 220 }}>
            <label htmlFor="c" className="label">Cliente</label>
            <select id="c" name="c" className="select" defaultValue={client?.id ?? ''}>
              <option value="">Todos os clientes</option>
              {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button className="btn small" type="submit">Ver</button>
        </form>
      </div>

      <section className="rise" style={{ ['--d' as string]: '180ms' }}>
        <div className="tiles">
          <div className="tile-stat"><span className="label">Postados no mês</span><strong className="s-Aprovado">{nums.Total.posted}</strong><span className="hint">de {nums.Total.planned} planejados</span></div>
          <div className="tile-stat"><span className="label">Atrasados</span><strong className="s-Reprovado">{nums.Total.late}</strong><span className="hint">data passou e não foi postado</span></div>
          <div className="tile-stat"><span className="label">Aprovados sem ajuste</span><strong className="s-Aprovado">{nums.Total.approvedClean}</strong><span className="hint">{rate === null ? '—' : `${rate}% aprovados de primeira`}</span></div>
          <div className="tile-stat"><span className="label">Aprovados com ajuste</span><strong className="s-Ajustes">{nums.Total.approvedAdjusted}</strong><span className="hint">precisaram de correção</span></div>
        </div>
      </section>

      <section className="rise" style={{ ['--d' as string]: '220ms' }}>
        <h2 className="label" style={{ marginBottom: 10 }}>Por formato{client ? ` · ${client.name}` : ''}</h2>
        <div className="cal-wrap">
          <table className="gtable" style={{ minWidth: 620 }}>
            <thead>
              <tr>
                <th className="label">Indicador</th>
                {PROD_GROUPS.map((g) => <th key={g} className="label" style={{ textAlign: 'right' }}>{g === 'Post' ? 'Post / Carrossel' : g}</th>)}
                <th className="label" style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.key}>
                  <td>
                    <strong>{r.label}</strong>
                    <div className="hint">{r.hint}</div>
                  </td>
                  {PROD_GROUPS.map((g) => (
                    <td key={g} style={{ textAlign: 'right', fontFamily: 'var(--display)', fontSize: 22 }} className={nums[g][r.key] ? r.cls : undefined}>
                      {nums[g][r.key]}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontFamily: 'var(--display)', fontSize: 22, fontWeight: 600 }} className={nums.Total[r.key] ? r.cls : undefined}>
                    {nums.Total[r.key]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {lateList.length > 0 && (
        <section className="panel rise" style={{ ['--d' as string]: '260ms' }}>
          <h2 className="label">Atrasados · ainda não postados</h2>
          <ul className="people">
            {lateList.map((x) => (
              <li key={x.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{x.title}</div>
                  <span className="label">{nameOf(x.clientId)} · {x.type} · {x.day ? dayLabel(x.day) : ''}{x.time ? ` · ${x.time}` : ''}</span>
                </div>
                <span className={`status s-${x.status}`}>{x.status}</span>
                <a className="btn small outline" href={`/c/${x.clientId}/${x.id}`}>Abrir</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {attention.length > 0 && (
        <section className="panel rise" style={{ ['--d' as string]: '280ms' }}>
          <h2 className="label">Precisa de você · ajustes e reprovados</h2>
          <ul className="people">
            {attention.map((x) => (
              <li key={x.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{x.title}</div>
                  <span className="label">{nameOf(x.clientId)} · {x.type} · {x.day ? dayLabel(x.day) : 'sem data'}</span>
                </div>
                <span className={`status s-${x.status}`}>{x.status}</span>
                <a className="btn small outline" href={`/c/${x.clientId}/${x.id}`}>Ver</a>
                <a className="btn small" href={`/admin/conteudo/${x.id}`}>Corrigir</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!client && perClient.length > 0 && (
        <section className="rise" style={{ ['--d' as string]: '300ms' }}>
          <h2 className="label" style={{ marginBottom: 10 }}>Por cliente</h2>
          <div className="cal-wrap">
            <table className="gtable">
              <thead>
                <tr>
                  <th className="label">Cliente</th>
                  <th className="label" style={{ textAlign: 'right' }}>Planejados</th>
                  <th className="label" style={{ textAlign: 'right' }}>Postados</th>
                  <th className="label" style={{ textAlign: 'right' }}>Atrasados</th>
                  <th className="label" style={{ textAlign: 'right' }}>Sem ajuste</th>
                  <th className="label" style={{ textAlign: 'right' }}>Com ajuste</th>
                </tr>
              </thead>
              <tbody>
                {perClient.map(({ c, n }) => (
                  <tr key={c.id}>
                    <td>
                      <a className="who" href={q(first, c.id)} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <span className="mini-logo" aria-hidden="true">
                          {c.logoUrl ? <img src={c.logoUrl} alt="" loading="lazy" /> : <span>{c.name.charAt(0)}</span>}
                        </span>
                        <strong>{c.name}</strong>
                      </a>
                    </td>
                    <td style={{ textAlign: 'right' }}>{n.planned}</td>
                    <td style={{ textAlign: 'right' }} className={n.posted ? 's-Aprovado' : undefined}>{n.posted}</td>
                    <td style={{ textAlign: 'right' }} className={n.late ? 's-Reprovado' : undefined}>{n.late}</td>
                    <td style={{ textAlign: 'right' }}>{n.approvedClean}</td>
                    <td style={{ textAlign: 'right' }}>{n.approvedAdjusted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="hint">“Com ajuste” começa a contar a partir de hoje: conteúdos respondidos antes desta versão contam como “sem ajuste” se estiverem aprovados.</p>
    </AdminShell>
  );
}

import Link from 'next/link';
import { requireClientAccess } from '@/lib/access';
import { env } from '@/lib/env';
import { MONTHS, addDays, addMonths, dayLabel, dayNum, monthIdx, parseDay, startOfWeek, todayIn, yearNum } from '@/lib/domain';
import { planningReport, type ReportItem } from '@/lib/planning';
import { splitLinks } from '@/lib/embed';
import { FORMAT_ORDER, planKind, planOrder } from '@/lib/report-pdf';
import ClientTop from '@/components/ClientTop';
import Icon from '@/components/Icon';
import RefPreview from '@/components/RefPreview';
import ImageStrip from '@/components/ImageStrip';

export const dynamic = 'force-dynamic';

const FORMAT_NAME: Record<string, string> = { story: 'Story', post: 'Post', reels: 'Reels', fotos: 'Fotos', outro: 'Conteúdo' };
const fmtList = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}` : l[0] ?? '');

const kindOf = (k: string | null) => {
  const s = (k ?? '').toLowerCase();
  if (s.includes('reel')) return 'reels';
  if (s.includes('story') || s.includes('storys')) return 'story';
  if (s.includes('foto')) return 'foto';
  return 'post';
};

export default async function PlanejamentoCliente({
  params,
  searchParams
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const { viewer, client } = await requireClientAccess(clientId);
  const today = todayIn(env.timeZone);
  const first = `${(parseDay(sp.m) ?? parseDay(`${sp.m}-01`) ?? today).slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);
  const monthName = MONTHS[monthIdx(first)];
  const nav = (d: string) => `/c/${client.id}/planejamento?m=${d.slice(0, 7)}`;

  const items: ReportItem[] | null = client.calName
    ? await planningReport(client.calName, first, last).then((r) => (typeof r === 'string' ? null : r)).catch(() => null)
    : [];

  const weeks: { start: string; list: (ReportItem & { n: number })[] }[] = [];
  planOrder(items ?? []).forEach((it, i) => {
    const ws = startOfWeek(it.day!);
    let w = weeks.find((x) => x.start === ws);
    if (!w) weeks.push((w = { start: ws, list: [] }));
    w.list.push({ ...it, n: i + 1 });
  });
  const count = (k: string) => (items ?? []).filter((i) => kindOf(i.kind) === k).length;

  return (
    <main className="shell">
      <ClientTop name={client.name} isAdmin={viewer.role === 'admin'} />
      <div className="rise" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '14px 20px 0 8px' }}>
        <Link href={`/c/${client.id}`} className="icon-btn" aria-label="Voltar"><Icon name="left" /></Link>
        <span className="label" style={{ flex: 1 }}>Planejamento de conteúdo</span>
        <Link href={nav(addMonths(first, -1))} className="icon-btn" aria-label="Mês anterior"><Icon name="left" /></Link>
        <Link href={nav(addMonths(first, 1))} className="icon-btn" aria-label="Próximo mês"><Icon name="right" /></Link>
      </div>
      <h1 className="display lg rise" style={{ padding: '14px 20px 6px', ['--d' as string]: '60ms' }}>{monthName}</h1>
      <p className="label rise" style={{ padding: '0 20px 20px', ['--d' as string]: '80ms' }}>{yearNum(first)}</p>

      {items === null ? (
        <p className="error" style={{ margin: '0 20px' }}>Não foi possível carregar o planejamento agora. Tente de novo em instantes.</p>
      ) : !items.length ? (
        <p className="empty" style={{ margin: '0 20px' }}>O planejamento de {monthName.toLowerCase()} ainda não foi publicado.</p>
      ) : (
        <>
          <div className="pc-stats rise" style={{ ['--d' as string]: '100ms' }}>
            <span><strong>{items.length}</strong>conteúdos</span>
            <span><strong>{count('reels')}</strong>reels</span>
            <span><strong>{count('post')}</strong>posts</span>
            <span><strong>{count('story')}</strong>stories</span>
          </div>
          <p className="hint pc-how rise" style={{ ['--d' as string]: '120ms' }}>
            Revise cada conteúdo e as referências. Está tudo certo? Responda <b>APROVADO</b> no WhatsApp. Quer mudar algo? Mande o número (ex.: Nº 03) e o ajuste.
          </p>
          {weeks.map((w, wi) => (
            <section key={w.start} className="pc-week rise" style={{ ['--d' as string]: `${140 + wi * 40}ms` }} aria-label={`Semana ${wi + 1}`}>
              <h2 className="label pc-week-h">
                <span>Semana {wi + 1}</span>
                <small>{fmtList(FORMAT_ORDER.filter((k) => w.list.some((i) => planKind(i.kind) === k)).map((k) => FORMAT_NAME[k]))}</small>
                <em>{dayNum(w.start)}–{dayNum(addDays(w.start, 6))}</em>
              </h2>
              {w.list.map((it, ii) => {
                const k = planKind(it.kind);
                const head = ii === 0 || planKind(w.list[ii - 1].kind) !== k;
                const refs = splitLinks(it.referencia);
                const imgs = splitLinks(it.imagens);
                return (
                  <div key={it.id} style={{ display: 'contents' }}>
                  {head && <span className={`pc-group g-${k}`}>{FORMAT_NAME[k]}</span>}
                  <article className="pc-card" id={`post-${it.n}`}>
                    <header>
                      <span className="pc-day"><strong>{String(dayNum(it.day!)).padStart(2, '0')}</strong><small>{dayLabel(it.day!).split(' ')[0]}</small></span>
                      <div style={{ minWidth: 0 }}>
                        <span className={`pc-kind k-${kindOf(it.kind)}`}>{it.kind ?? 'Post'}</span>
                        <span className="label pc-n">Nº {String(it.n).padStart(2, '0')}{it.time ? ` · ${it.time}` : ''}</span>
                        <h3>{it.title}</h3>
                      </div>
                    </header>
                    {it.objetivo && <div className="pc-field"><span className="label">Objetivo</span><p>{it.objetivo}</p></div>}
                    {it.legenda && <div className="pc-field pc-legenda"><span className="label">Legenda</span><p>{it.legenda}</p></div>}
                    {!it.objetivo && !it.legenda && it.roteiro && <div className="pc-field"><span className="label">Roteiro</span><p>{it.roteiro}</p></div>}
                    {imgs.length > 0 && (
                      <div className="pc-field"><span className="label">Imagens</span><ImageStrip urls={imgs} /></div>
                    )}
                    {refs.length > 0 && (
                      <div className="pc-field">
                        <span className="label">Referência{refs.length > 1 ? 's' : ''}</span>
                        <div className="pc-refs">{refs.map((u) => <RefPreview key={u} url={u} />)}</div>
                      </div>
                    )}
                  </article>
                  </div>
                );
              })}
            </section>
          ))}
        </>
      )}
    </main>
  );
}

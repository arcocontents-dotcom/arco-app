import { requireClientAccess } from '@/lib/access';
import { env } from '@/lib/env';
import {
  MONTHS,
  WEEKDAYS_SHORT,
  addDays,
  addMonths,
  dayLabel,
  dayNum,
  monthGrid,
  monthIdx,
  parseDay,
  startOfWeek,
  todayIn,
  yearNum
} from '@/lib/domain';
import { listContentsInRange, listOpenContents, listPostedContents, type ContentRecord } from '@/lib/notion';
import { getPublishedMedia } from '@/lib/instagram';
import { contentThumb, cssUrl, dayStatus } from '@/lib/view';
import ClientTop from '@/components/ClientTop';
import ContentRow from '@/components/ContentRow';
import { ArrowLeft, ArrowRight, PlayIcon, StackIcon } from '@/components/icons';

export const dynamic = 'force-dynamic';

type View = 'semana' | 'mes' | 'feed';

export default async function ClientPage({
  params,
  searchParams
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ v?: string; d?: string }>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const { viewer, client, canApprove } = await requireClientAccess(clientId);
  const view: View = sp.v === 'mes' || sp.v === 'feed' ? sp.v : 'semana';
  const today = todayIn(env.timeZone);
  const day = parseDay(sp.d) ?? today;
  const base = `/c/${client.id}`;
  const href = (v: View, d?: string) => `${base}?v=${v}${d ? `&d=${d}` : ''}`;

  const open = await listOpenContents(client.id).catch(() => []);
  const waiting = open.filter((c) => c.status === 'Aguardando');

  return (
    <main className="shell">
      <ClientTop name={client.name} isAdmin={viewer.role === 'admin'} />
      {view === 'semana' && <Week {...{ client: client.id, day, today, href, waiting, canApprove, base }} />}
      {view === 'mes' && <Month {...{ client: client.id, day, today, href, base }} />}
      {view === 'feed' && <Feed {...{ client: client.id, href, base, open, igUser: client.instagram, igOn: client.igConnected }} />}
    </main>
  );
}

function Tabs({ view, href, day }: { view: View; href: (v: View, d?: string) => string; day: string }) {
  return (
    <nav className="tabs rise" aria-label="Visualização" style={{ ['--d' as string]: '120ms' }}>
      <a href={href('semana', day)} aria-current={view === 'semana' ? 'page' : undefined}>Semana</a>
      <a href={href('mes', day)} aria-current={view === 'mes' ? 'page' : undefined}>Mês</a>
      <a href={href('feed')} aria-current={view === 'feed' ? 'page' : undefined}>Feed</a>
    </nav>
  );
}

async function Week({
  client, day, today, href, waiting, canApprove, base
}: {
  client: string; day: string; today: string; href: (v: View, d?: string) => string;
  waiting: ContentRecord[]; canApprove: boolean; base: string;
}) {
  const start = startOfWeek(day);
  const end = addDays(start, 6);
  const items = await listContentsInRange(client, start, end).catch(() => []);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const rangeLabel = `${dayNum(start)} ${MONTHS[monthIdx(start)].slice(0, 3).toLowerCase()} — ${dayNum(end)} ${MONTHS[monthIdx(end)].slice(0, 3).toLowerCase()} ${yearNum(end)}`;

  return (
    <>
      <div className="page-head row">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="label rise">{rangeLabel}</p>
          <h1 className="display xl rise" style={{ ['--d' as string]: '60ms' }}>Semana</h1>
        </div>
        <div style={{ display: 'flex' }}>
          <a className="icon-btn" href={href('semana', addDays(start, -7))} aria-label="Semana anterior"><ArrowLeft /></a>
          <a className="icon-btn" href={href('semana', addDays(start, 7))} aria-label="Próxima semana"><ArrowRight /></a>
        </div>
      </div>
      <Tabs view="semana" href={href} day={day} />
      <div className="week-rings">
        {days.map((d, i) => {
          const st = dayStatus(items.filter((c) => c.day === d));
          return (
            <a key={d} href={`#dia-${d}`} className="ring-day rise" style={{ ['--d' as string]: `${160 + i * 40}ms` }} aria-label={dayLabel(d)}>
              <span className={`ring${st ? ` c-${st}` : ''}${d === today ? ' today' : ''}`}><span>{dayNum(d)}</span></span>
              <span className="label" style={{ letterSpacing: '0.14em' }}>{WEEKDAYS_SHORT[i]}</span>
            </a>
          );
        })}
      </div>
      {canApprove && waiting.length > 0 && (
        <a className="banner rise" href={`${base}/${waiting[0].id}`} style={{ ['--d' as string]: '260ms' }}>
          <span>{waiting.length} aguardando você</span><span>Revisar →</span>
        </a>
      )}
      <div className="list">
        {items.length === 0 && <p className="empty rise">Nada programado nesta semana.</p>}
        {days.map((d) =>
          items.filter((c) => c.day === d).length ? (
            <section key={d} id={`dia-${d}`}>
              {items.filter((c) => c.day === d).map((c, i) => (
                <ContentRow key={c.id} c={c} href={`${base}/${c.id}`} delay={300 + i * 70} />
              ))}
            </section>
          ) : null
        )}
      </div>
    </>
  );
}

async function Month({
  client, day, today, href, base
}: { client: string; day: string; today: string; href: (v: View, d?: string) => string; base: string }) {
  const cells = monthGrid(day);
  const items = await listContentsInRange(client, cells[0].day, cells[cells.length - 1].day).catch(() => []);
  const sel = items.filter((c) => c.day === day);
  return (
    <>
      <div className="page-head row">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="label rise">{yearNum(day)}</p>
          <h1 className="display xl rise" style={{ ['--d' as string]: '60ms' }}>{MONTHS[monthIdx(day)]}</h1>
        </div>
        <div style={{ display: 'flex' }}>
          <a className="icon-btn" href={href('mes', addMonths(day, -1))} aria-label="Mês anterior"><ArrowLeft /></a>
          <a className="icon-btn" href={href('mes', addMonths(day, 1))} aria-label="Próximo mês"><ArrowRight /></a>
        </div>
      </div>
      <Tabs view="mes" href={href} day={day} />
      <div className="month rise" style={{ ['--d' as string]: '180ms' }}>
        <div className="month-grid">
          {WEEKDAYS_SHORT.map((w) => <span key={w} className="wd">{w.toUpperCase()}</span>)}
          {cells.map((c) => {
            const list = items.filter((x) => x.day === c.day);
            const cls = ['mcell', c.inMonth ? '' : 'out', c.day === today ? 'today' : '', c.day === day ? 'sel' : ''].join(' ');
            return (
              <a key={c.day} href={href('mes', c.day)} className={cls} aria-label={`${dayLabel(c.day)}${list.length ? `, ${list.length} conteúdo(s)` : ''}`} aria-current={c.day === day ? 'date' : undefined}>
                <span className="n">{dayNum(c.day)}</span>
                <span className="dots">{list.slice(0, 3).map((x) => <i key={x.id} className={`c-${x.status}`} />)}</span>
              </a>
            );
          })}
        </div>
      </div>
      <div className="legend">
        {['Aguardando', 'Aprovado', 'Ajustes', 'Reprovado', 'Postado'].map((s) => <span key={s} className={`status s-${s}`}>{s}</span>)}
      </div>
      <div className="list">
        <p className="label" style={{ paddingTop: 16 }}>{dayLabel(day)}</p>
        {sel.length === 0 && <p className="empty">Nada programado para este dia.</p>}
        {sel.map((c, i) => <ContentRow key={c.id} c={c} href={`${base}/${c.id}`} delay={i * 70} />)}
      </div>
    </>
  );
}

async function Feed({
  client, href, base, open, igUser, igOn
}: { client: string; href: (v: View, d?: string) => string; base: string; open: ContentRecord[]; igUser: string; igOn: boolean }) {
  const scheduled = open
    .filter((c) => c.type !== 'Story')
    .sort((a, b) => (b.dateIso ?? '').localeCompare(a.dateIso ?? ''));
  const ig = igOn ? await getPublishedMedia(client).catch(() => []) : [];
  const posted = ig.length ? [] : await listPostedContents(client).catch(() => []);
  return (
    <>
      <div className="page-head">
        <p className="label rise">Como vai ficar</p>
        <h1 className="display xl rise" style={{ ['--d' as string]: '60ms' }}>Feed</h1>
      </div>
      <Tabs view="feed" href={href} day="" />
      <div className="profile rise" style={{ ['--d' as string]: '160ms' }}>
        <div className="avatar"><span><img src="/icon-white.png" alt="" width={30} style={{ width: 30, height: 'auto' }} /></span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontWeight: 600 }}>{igUser ? `@${igUser}` : 'Perfil do Instagram'}</span>
          {igOn ? (
            <span className="status s-Aprovado">Instagram conectado</span>
          ) : (
            <span className="hint">Instagram ainda não conectado</span>
          )}
        </div>
      </div>
      <div className="grid3">
        {scheduled.map((c, i) => (
          <a key={c.id} href={`${base}/${c.id}`} className="tile rise" style={{ ['--d' as string]: `${200 + i * 40}ms` }} aria-label={`${c.title}, ${c.type}, ${c.status}`}>
            {contentThumb(c) ? <img src={contentThumb(c)!} alt="" loading="lazy" decoding="async" /> : null}
            {c.type === 'Reels' && <span className="kind"><PlayIcon size={14} /></span>}
            {c.type === 'Carrossel' && <span className="kind"><StackIcon /></span>}
            <span className={`badge s-${c.status}`}>{c.status}</span>
          </a>
        ))}
        {ig.map((m, i) => (
          <a key={m.id} href={m.permalink} target="_blank" rel="noopener noreferrer" className="tile rise" style={{ ['--d' as string]: `${240 + (scheduled.length + i) * 30}ms` }} aria-label="Post publicado no Instagram (abre em nova aba)">
            <img src={m.thumb} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
            {m.type === 'VIDEO' && <span className="kind"><PlayIcon size={14} /></span>}
            {m.type === 'CAROUSEL_ALBUM' && <span className="kind"><StackIcon /></span>}
          </a>
        ))}
        {posted.filter((c) => c.type !== 'Story').map((c, i) => (
          <a key={c.id} href={`${base}/${c.id}`} className="tile rise" style={{ ...cssUrl(null), ['--d' as string]: `${240 + (scheduled.length + i) * 30}ms` }} aria-label={`${c.title}, postado`}>
            {contentThumb(c) ? <img src={contentThumb(c)!} alt="" loading="lazy" decoding="async" /> : null}
            {c.type === 'Reels' && <span className="kind"><PlayIcon size={14} /></span>}
            {c.type === 'Carrossel' && <span className="kind"><StackIcon /></span>}
          </a>
        ))}
      </div>
      {!scheduled.length && !ig.length && !posted.length && <p className="empty" style={{ padding: '28px 24px' }}>Ainda não há posts por aqui.</p>}
    </>
  );
}

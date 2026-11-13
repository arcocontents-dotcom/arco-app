import NotifyButton from '@/components/NotifyButton';
import Icon from '@/components/Icon';
import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { listClients, listContentsInRangeAdmin, sameId } from '@/lib/notion';
import { MONTHS, WEEKDAYS_SHORT, addMonths, dayLabel, dayNum, monthGrid, monthIdx, parseDay, todayIn, yearNum } from '@/lib/domain';
import { contentThumb, cssUrl } from '@/lib/view';
import AdminShell from '@/components/AdminShell';
import { ArrowLeft, ArrowRight } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ c?: string; m?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const clients = (await listClients()).filter((c) => !c.cancelled);
  const client = clients.find((c) => sameId(c.id, sp.c ?? '')) ?? clients[0] ?? null;
  const today = todayIn(env.timeZone);
  const day = parseDay(sp.m) ?? today;

  if (!client) {
    return (
      <AdminShell>
        <h1 className="display xl">Bem-vindo</h1>
        <p>Nenhum cliente ainda.</p>
        <Link className="btn" href="/admin/clientes/novo" style={{ alignSelf: 'flex-start' }}>+ Novo cliente</Link>
      </AdminShell>
    );
  }

  const cells = monthGrid(day);
  const items = await listContentsInRangeAdmin(client.id, cells[0].day, cells[cells.length - 1].day).catch(() => []);
  const nav = (m: string) => `/admin?c=${client.id}&m=${m}`;

  return (
    <AdminShell current={client.id}>
      <div className="toolbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="label rise ic-inline"><Icon name="calendar" size={14} />Aprovação · calendário editorial · {client.name}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <h1 className="display rise" style={{ fontSize: 'clamp(40px, 6vw, 80px)', ['--d' as string]: '60ms' }}>{MONTHS[monthIdx(day)]}</h1>
            <Link className="icon-btn" href={nav(addMonths(day, -1))} aria-label="Mês anterior"><ArrowLeft /></Link>
            <Link className="icon-btn" href={nav(addMonths(day, 1))} aria-label="Próximo mês"><ArrowRight /></Link>
          </div>
        </div>
        <div className="actions rise" style={{ ['--d' as string]: '120ms' }}>
          <Link className="btn outline small" href={`/c/${client.id}`}><Icon name="eye" size={16} />Ver como cliente</Link>
          <Link className="btn small" href={`/admin/conteudo/novo?c=${client.id}`}><Icon name="plus" size={16} />Novo conteúdo</Link>
        </div>
      </div>

      <div className="cal-wrap rise" style={{ ['--d' as string]: '180ms' }}>
        <div className="cal">
          {WEEKDAYS_SHORT.map((w) => <span key={w} className="wd">{w.toUpperCase()}</span>)}
          {cells.map((c) => {
            const list = items.filter((x) => x.day === c.day);
            return (
              <div key={c.day} className={`cell${c.inMonth ? '' : ' out'}${c.day === today ? ' today' : ''}${list.length ? ' has' : ''}`}>
                <div className="n">
                  <span>{dayNum(c.day)} <small className="wd-m">{dayLabel(c.day).split(' ')[0]}</small></span>
                  <Link className="add" href={`/admin/conteudo/novo?c=${client.id}&d=${c.day}`} aria-label={`Novo conteúdo em ${c.day}`}><Icon name="plus" size={16} /></Link>
                </div>
                {list.map((x) => (
                  <div key={x.id} className="card-wrap">
                    <Link href={`/c/${client.id}/${x.id}`} className="card">
                      <span className="ph" style={cssUrl(contentThumb(x))} />
                      <span className="label">{x.type}{x.time ? ` · ${x.time}` : ''}</span>
                      <span style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.2 }}>{x.title}</span>
                      <span className={`status s-${x.status}`}>{x.status}</span>
                    </Link>
                    <Link href={`/admin/conteudo/${x.id}`} className="card-edit" aria-label={`Editar ${x.title}`} title="Editar">
                      <Icon name="pencil" size={14} />
                    </Link>
                    {x.status === 'Aguardando' && <NotifyButton contentId={x.id} title={x.title} compact />}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </AdminShell>
  );
}

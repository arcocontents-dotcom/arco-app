import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { listClients, sameId, type ContentRecord } from '@/lib/notion';
import { dayLabel } from '@/lib/domain';
import { contentThumb, cssUrl } from '@/lib/view';
import AdminShell, { alerts } from '@/components/AdminShell';
import Icon from '@/components/Icon';
import { markPostedAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function Pendencias({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [all, a] = await Promise.all([listClients(), alerts()]);
  const active = all.filter((c) => !c.cancelled);
  const mine = (x: ContentRecord) => active.some((c) => sameId(c.id, x.clientId));
  const client = (x: ContentRecord) => active.find((c) => sameId(c.id, x.clientId));
  const fix = a.fix.filter(mine);
  const fixIds = new Set(fix.map((x) => x.id));
  const late = a.late.filter(mine).filter((x) => !fixIds.has(x.id));
  const total = fix.length + late.length;

  const Row = ({ x, i, kind }: { x: ContentRecord; i: number; kind: 'fix' | 'late' }) => {
    const c = client(x);
    return (
      <li className="todo rise" style={{ ['--d' as string]: `${120 + i * 40}ms` }}>
        <Link href={`/c/${x.clientId}/${x.id}`} className="todo-main">
          <span className="todo-thumb" style={cssUrl(contentThumb(x))}>
            {!contentThumb(x) && <Icon name={x.type === 'Reels' ? 'video' : 'image'} size={18} />}
          </span>
          <span className="todo-text">
            <span className="label">{c?.name} · {x.type}{x.day ? ` · ${dayLabel(x.day)}` : ''}{x.time ? ` · ${x.time}` : ''}</span>
            <strong>{x.title}</strong>
            <span className={`status s-${x.status}`}>{kind === 'late' ? `${x.status} · atrasado` : x.status}</span>
          </span>
        </Link>
        <div className="todo-actions">
          <Link className="icon-act" href={`/admin/conteudo/${x.id}`} title="Corrigir" aria-label={`Corrigir ${x.title}`}>
            <Icon name="pencil" /> <span>Corrigir</span>
          </Link>
          {kind === 'late' && (
            <form action={markPostedAction}>
              <input type="hidden" name="id" value={x.id} />
              <button className="icon-act dark" type="submit" title="Marcar como postado" aria-label={`Marcar ${x.title} como postado`}>
                <Icon name="send" /> <span>Postado</span>
              </button>
            </form>
          )}
        </div>
      </li>
    );
  };

  return (
    <AdminShell section="pendencias">
      <div className="page-title">
        <p className="label rise">Avisos de hoje</p>
        <h1 className="display rise" style={{ fontSize: 'clamp(44px, 7vw, 88px)', ['--d' as string]: '60ms' }}>Pendências</h1>
      </div>

      {sp.ok === 'postado' && <p className="toast ic-inline" role="status"><Icon name="check" className="ic-play" size={15} />Marcado como postado</p>}

      {total === 0 ? (
        <div className="all-clear rise" style={{ ['--d' as string]: '120ms' }}>
          <Icon name="check" size={44} className="ic-play" />
          <h2 className="display" style={{ fontSize: 28 }}>Tudo em dia</h2>
          <p className="hint">Nenhum atraso e nenhum ajuste esperando você.</p>
        </div>
      ) : (
        <>
          {fix.length > 0 && (
            <section className="todo-group">
              <h2 className="label todo-h"><Icon name="pencil" size={14} /> Ajustes e reprovados · {fix.length}</h2>
              <ul className="todo-list">{fix.map((x, i) => <Row key={x.id} x={x} i={i} kind="fix" />)}</ul>
            </section>
          )}
          {late.length > 0 && (
            <section className="todo-group">
              <h2 className="label todo-h"><Icon name="clock" size={14} /> Atrasados · {late.length}</h2>
              <ul className="todo-list">{late.map((x, i) => <Row key={x.id} x={x} i={i + fix.length} kind="late" />)}</ul>
            </section>
          )}
        </>
      )}
    </AdminShell>
  );
}

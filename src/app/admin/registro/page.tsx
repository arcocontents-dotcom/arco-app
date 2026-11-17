import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { AREAS, listActivity, type Area } from '@/lib/registro';
import AdminShell from '@/components/AdminShell';
import Icon from '@/components/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Registro · Arco Contents', robots: { index: false, follow: false } };

// Registro: tudo o que foi feito no app, por quem e quando. O Financeiro só aparece para quem tem acesso a ele.
export default async function Registro({ searchParams }: { searchParams: Promise<{ a?: string; q?: string }> }) {
  const viewer = await requireAdmin();
  const sp = await searchParams;
  const areas = AREAS.filter((a) => a !== 'Financeiro' || viewer.finance);
  const area = (areas as readonly string[]).includes(sp.a ?? '') ? (sp.a as Area) : null;
  const q = String(sp.q ?? '').trim().toLowerCase();
  const all = await listActivity({ area, limit: 100 }).catch(() => []);
  const list = all.filter((x) => (viewer.finance || x.area !== 'Financeiro') && (!q || `${x.who} ${x.action} ${x.item} ${x.detail}`.toLowerCase().includes(q)));
  const day = new Intl.DateTimeFormat('pt-BR', { timeZone: env.timeZone, weekday: 'long', day: '2-digit', month: 'long' });
  const hour = new Intl.DateTimeFormat('pt-BR', { timeZone: env.timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
  const groups = new Map<string, typeof list>();
  for (const x of list) {
    const k = day.format(new Date(x.when));
    groups.set(k, [...(groups.get(k) ?? []), x]);
  }
  const href = (a: string | null) => `/admin/registro${a ? `?a=${encodeURIComponent(a)}` : ''}`;
  return (
    <AdminShell section="registro">
      <div className="toolbar">
        <div className="page-title">
          <p className="label rise ic-inline"><Icon name="clock" size={14} />Quem fez o quê, e quando</p>
          <h1 className="display rise" style={{ fontSize: 'clamp(40px, 6vw, 80px)', ['--d' as string]: '60ms' }}>Registro</h1>
        </div>
        <form className="actions rise" style={{ ['--d' as string]: '100ms' }} action="/admin/registro">
          {area && <input type="hidden" name="a" value={area} />}
          <input className="ninput" name="q" defaultValue={sp.q ?? ''} placeholder="Buscar pessoa, cliente, tarefa…" aria-label="Buscar no registro" />
        </form>
      </div>
      <nav className="fin-tabs" aria-label="Áreas">
        <Link href={href(null)} aria-current={!area ? 'page' : undefined}>Tudo</Link>
        {areas.map((a) => <Link key={a} href={href(a)} aria-current={area === a ? 'page' : undefined}>{a}</Link>)}
      </nav>
      <div className="reg">
        {[...groups.entries()].map(([d, xs]) => (
          <section key={d} className="reg-day" aria-label={d}>
            <h2 className="label">{d}</h2>
            <ol>
              {xs.map((x) => (
                <li key={x.id}>
                  <time>{hour.format(new Date(x.when))}</time>
                  <span className={`reg-area a-${(x.area ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}`}>{x.area}</span>
                  <div>
                    <strong>{x.action}</strong>
                    {(x.item || x.detail) && <small>{[x.item, x.detail].filter(Boolean).join(' · ')}</small>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
        {!list.length && <p className="hint">Nada registrado ainda{area ? ` em ${area}` : ''}.</p>}
        <p className="hint">Mostra as últimas 100 ações. O registro completo fica na tabela <b>📜 Registro do app</b> no Notion.</p>
      </div>
    </AdminShell>
  );
}

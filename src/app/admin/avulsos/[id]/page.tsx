import Link from 'next/link';
import { notFound } from 'next/navigation';
import Icon from '@/components/Icon';
import AdminShell from '@/components/AdminShell';
import HistoryList from '@/components/HistoryList';
import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { TIPOS_AVULSO, listAvulsos } from '@/lib/avulsos';
import { addDays, todayIn } from '@/lib/domain';
import { listRoutines } from '@/lib/producao';
import { listShoots } from '@/lib/captacao';
import { loadFin, finConfigured } from '@/lib/financeiro';
import { sameId } from '@/lib/notion';
import { updateAvulsoAction } from '../actions';

export const dynamic = 'force-dynamic';

const OK: Record<string, string> = { criado: 'Cliente avulso cadastrado.', salvo: 'Cadastro salvo.', existe: 'Esse cliente já tinha cadastro: é este aqui (reaproveitado).' };
const br = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default async function AvulsoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; e?: string }> }) {
  const viewer = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const a = (await listAvulsos()).find((x) => sameId(x.id, id));
  if (!a) notFound();
  const today = todayIn(env.timeZone);
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const mine = (client: string | null | undefined) => {
    const c = n(client ?? '');
    return c === n(a.name) || c.endsWith(`· ${n(a.name)}`) || c.endsWith(` ${n(a.name)}`) && c.includes('·');
  };
  const [routines, shoots, fin] = await Promise.all([
    listRoutines().catch(() => []),
    listShoots(addDays(today, -365), addDays(today, 180)).catch(() => []),
    viewer.finance && finConfigured() ? loadFin().catch(() => null) : Promise.resolve(null)
  ]);
  const jobs = routines.filter((r) => mine(r.client)).sort((x, y) => (y.date ?? y.created).localeCompare(x.date ?? x.created));
  const caps = shoots.filter((s) => mine(s.client)).sort((x, y) => y.day.localeCompare(x.day));
  const lancs = fin ? fin.lancs.filter((l) => mine(l.cliente)).sort((x, y) => (y.venc ?? '').localeCompare(x.venc ?? '')) : [];

  return (
    <AdminShell section="avulsos" current={a.id}>
      <div className="toolbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link href="/admin/avulsos" className="label rise ic-inline" style={{ textDecoration: 'none' }}><Icon name="left" size={14} />Avulsos / freelancers</Link>
          <h1 className="display rise" style={{ fontSize: 'clamp(36px, 5.5vw, 68px)', ['--d' as string]: '60ms' }}>{a.name}</h1>
          <p className="label">{a.tipo}{a.ativo ? '' : ' · inativo'} · cadastro desde {br(a.created)}</p>
        </div>
      </div>
      {sp.ok && OK[sp.ok] && <p className="toast" role="status">{OK[sp.ok]}</p>}
      {sp.e === 'nome' && <p className="error" role="alert">Escreva o nome do cliente.</p>}

      <section className="panel rise" aria-label="Cadastro">
        <h2 className="label">Cadastro</h2>
        <form action={updateAvulsoAction} className="av-form">
          <input type="hidden" name="id" value={a.id} />
          <label><span className="rf-l">Nome</span><input className="ninput" name="nome" required maxLength={120} defaultValue={a.name} /></label>
          <label><span className="rf-l">Tipo</span>
            <select className="ninput" name="tipo" defaultValue={a.tipo}>{TIPOS_AVULSO.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label><span className="rf-l">Contato</span><input className="ninput" name="contato" maxLength={200} defaultValue={a.contato} /></label>
          <label><span className="rf-l">Instagram</span><input className="ninput" name="instagram" maxLength={80} defaultValue={a.instagram ? `@${a.instagram}` : ''} /></label>
          <label className="av-wide"><span className="rf-l">Observação</span><textarea className="ninput" name="obs" rows={3} maxLength={1500} defaultValue={a.obs} /></label>
          <label className="ic-inline"><input type="checkbox" name="ativo" defaultChecked={a.ativo} /> Ativo (aparece na barra lateral)</label>
          <button type="submit" className="btn small"><Icon name="check" size={15} />Salvar</button>
        </form>
        {a.history && <HistoryList history={a.history} />}
      </section>

      <section className="panel rise" aria-label="Trabalhos">
        <h2 className="label">Trabalhos na Produção · {jobs.length}</h2>
        <ul className="av-jobs">
          {jobs.map((r) => (
            <li key={r.id}><span>{r.format ?? r.type}</span><b>{r.title}</b><span className="muted">{r.person} · {br(r.date ?? r.created)}</span></li>
          ))}
          {!jobs.length && <li className="hint">Nenhuma tarefa ainda. Na Produção, escolha Cliente → Freelancer e digite “{a.name}”.</li>}
        </ul>
        {caps.length > 0 && (
          <>
            <h2 className="label">Captações · {caps.length}</h2>
            <ul className="av-jobs">
              {caps.map((s) => <li key={s.id}><span>{s.status}</span><b>{s.title}</b><span className="muted">{br(s.day)}</span></li>)}
            </ul>
          </>
        )}
        {fin && (
          <>
            <h2 className="label">Financeiro · {lancs.length}</h2>
            <ul className="av-jobs">
              {lancs.map((l) => <li key={l.id}><span>{l.cat}</span><b>{l.desc}</b><span className="muted">{brl(l.valor)} · {l.pago ? `pago ${br(l.pago)}` : `vence ${br(l.venc)}`}</span></li>)}
              {!lancs.length && <li className="hint">Nenhum lançamento com este cliente.</li>}
            </ul>
          </>
        )}
      </section>
    </AdminShell>
  );
}

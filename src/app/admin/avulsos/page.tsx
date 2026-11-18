import Link from 'next/link';
import Icon from '@/components/Icon';
import AdminShell from '@/components/AdminShell';
import { requireAdmin } from '@/lib/access';
import { TIPOS_AVULSO, avulsosConfigured, listAvulsos } from '@/lib/avulsos';
import { createAvulsoAction } from './actions';

export const dynamic = 'force-dynamic';

// Clientes avulsos / freelancers: cadastro guardado e reaproveitado quando voltam a contratar.
export default async function Avulsos({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const list = await listAvulsos();
  const ativos = list.filter((x) => x.ativo);
  const antigos = list.filter((x) => !x.ativo);
  return (
    <AdminShell section="avulsos">
      <div className="toolbar">
        <div className="page-title">
          <p className="label rise ic-inline"><Icon name="users" size={14} />Clientes avulsos e freelancers</p>
          <h1 className="display rise" style={{ fontSize: 'clamp(40px, 6vw, 80px)', ['--d' as string]: '60ms' }}>Avulsos</h1>
        </div>
      </div>
      {!avulsosConfigured() && <p className="hint">A tabela de clientes avulsos ainda não está ligada.</p>}
      {sp.e === 'nome' && <p className="error" role="alert">Escreva o nome do cliente.</p>}

      <section className="panel rise av-new" aria-label="Cadastrar cliente avulso">
        <h2 className="label">Cadastrar</h2>
        <form action={createAvulsoAction} className="av-form">
          <label><span className="rf-l">Nome</span><input className="ninput" name="nome" required maxLength={120} placeholder="Ex.: Instituto BA" list="av-nomes" /></label>
          <datalist id="av-nomes">{list.map((x) => <option key={x.id} value={x.name} />)}</datalist>
          <label><span className="rf-l">Tipo</span>
            <select className="ninput" name="tipo" defaultValue="Freelancer">{TIPOS_AVULSO.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label><span className="rf-l">Contato</span><input className="ninput" name="contato" maxLength={200} placeholder="WhatsApp ou e-mail" /></label>
          <label><span className="rf-l">Instagram</span><input className="ninput" name="instagram" maxLength={80} placeholder="@perfil" /></label>
          <label className="av-wide"><span className="rf-l">Observação</span><textarea className="ninput" name="obs" rows={2} maxLength={1500} /></label>
          <button type="submit" className="btn small"><Icon name="plus" size={15} />Cadastrar</button>
        </form>
        <p className="hint" style={{ margin: 0 }}>Se o nome já tiver cadastro, o app abre o cadastro que já existe (não duplica).</p>
      </section>

      <section className="rise" aria-label="Cadastrados">
        <h2 className="label" style={{ marginBottom: 10 }}>Cadastrados · {ativos.length}</h2>
        <ul className="av-list">
          {ativos.map((x) => (
            <li key={x.id}><Link href={`/admin/avulsos/${x.id}`}><b>{x.name}</b><span>{x.tipo}</span>{x.contato && <span className="muted">{x.contato}</span>}</Link></li>
          ))}
          {!ativos.length && <li className="hint">Nenhum cliente avulso cadastrado ainda.</li>}
        </ul>
        {antigos.length > 0 && (
          <details style={{ marginTop: 14 }}>
            <summary className="label">Inativos · {antigos.length}</summary>
            <ul className="av-list">
              {antigos.map((x) => <li key={x.id}><Link href={`/admin/avulsos/${x.id}`}><b>{x.name}</b><span>{x.tipo}</span></Link></li>)}
            </ul>
          </details>
        )}
      </section>
    </AdminShell>
  );
}

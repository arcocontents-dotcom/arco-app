import { requireAdmin } from '@/lib/access';
import AdminShell from '@/components/AdminShell';
import { createClientAction } from '../../actions';

export default async function NovoCliente({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  await requireAdmin();
  const { e } = await searchParams;
  return (
    <AdminShell>
      <p className="label rise">Clientes</p>
      <h1 className="display rise" style={{ fontSize: 'clamp(40px, 6vw, 72px)', ['--d' as string]: '60ms' }}>Novo cliente</h1>
      <form action={createClientAction} className="panel rise" style={{ maxWidth: 560, ['--d' as string]: '140ms' }}>
        <div className="field">
          <label htmlFor="name" className="label">Nome</label>
          <input id="name" name="name" className="input" required maxLength={120} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="instagram" className="label">Instagram (opcional)</label>
          <input id="instagram" name="instagram" className="input" placeholder="@perfil" maxLength={60} />
        </div>
        {e && <p className="error" role="alert">Dê um nome ao cliente.</p>}
        <p className="hint">O cliente também aparece na base Clientes do Notion.</p>
        <button className="btn" type="submit">Criar cliente</button>
      </form>
    </AdminShell>
  );
}

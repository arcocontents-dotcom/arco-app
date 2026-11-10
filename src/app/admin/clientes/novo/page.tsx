import { requireAdmin } from '@/lib/access';
import AdminShell from '@/components/AdminShell';
import NewClientForm from '@/components/NewClientForm';

export default async function NovoCliente() {
  await requireAdmin();
  return (
    <AdminShell section="gestao">
      <a href="/admin/gestao" className="label rise" style={{ textDecoration: 'none' }}>← Gestão</a>
      <h1 className="display rise" style={{ fontSize: 'clamp(40px, 6vw, 72px)', ['--d' as string]: '60ms' }}>Novo cliente</h1>
      <NewClientForm />
    </AdminShell>
  );
}

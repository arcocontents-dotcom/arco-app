import { requireAdmin } from '@/lib/access';
import AdminShell from '@/components/AdminShell';
import NewClientForm from '@/components/NewClientForm';

export default async function NovoCliente() {
  await requireAdmin();
  return (
    <AdminShell>
      <p className="label rise">Clientes</p>
      <h1 className="display rise" style={{ fontSize: 'clamp(40px, 6vw, 72px)', ['--d' as string]: '60ms' }}>Novo cliente</h1>
      <NewClientForm />
    </AdminShell>
  );
}

import Icon from '@/components/Icon';
import Link from 'next/link';
export default function GestaoTabs({ tab }: { tab: 'clientes' | 'dashboard' }) {
  return (
    <nav className="tabs rise" aria-label="Gestão" style={{ padding: 0, ['--d' as string]: '100ms' }}>
      <Link href="/admin/gestao" aria-current={tab === 'clientes' ? 'page' : undefined}><Icon name="users" size={15} />Clientes</Link>
      <Link href="/admin/gestao/dashboard" aria-current={tab === 'dashboard' ? 'page' : undefined}><Icon name="chart" size={15} />Dashboard</Link>
    </nav>
  );
}

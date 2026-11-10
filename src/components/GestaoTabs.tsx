export default function GestaoTabs({ tab }: { tab: 'clientes' | 'dashboard' }) {
  return (
    <nav className="tabs rise" aria-label="Gestão" style={{ padding: 0, ['--d' as string]: '100ms' }}>
      <a href="/admin/gestao" aria-current={tab === 'clientes' ? 'page' : undefined}>Clientes</a>
      <a href="/admin/gestao/dashboard" aria-current={tab === 'dashboard' ? 'page' : undefined}>Dashboard</a>
    </nav>
  );
}

import Link from 'next/link';
import Icon from './Icon';

/** Abas da Produção: o quadro da semana e o relatório do mês. */
export default function ProdTabs({ active }: { active: 'quadro' | 'relatorio' }) {
  return (
    <nav className="plan-views prod-tabs rise" aria-label="Produção">
      <Link href="/admin/producao" aria-current={active === 'quadro' ? 'page' : undefined}><Icon name="users" size={15} />Quadro da semana</Link>
      <Link href="/admin/producao/relatorio" aria-current={active === 'relatorio' ? 'page' : undefined}><Icon name="chart" size={15} />Relatório</Link>
    </nav>
  );
}

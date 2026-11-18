import { redirect } from 'next/navigation';

// O dashboard saiu da Gestão: os números da produção ficam no relatório da Produção.
export default function GestaoDashboard() {
  redirect('/admin/producao/relatorio');
}

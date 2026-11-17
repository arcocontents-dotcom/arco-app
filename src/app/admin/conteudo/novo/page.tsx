import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/access';

// Conteúdo novo nasce no Planejamento (ou numa tarefa); a Aprovação é só para revisar e aprovar.
export default async function NovoConteudo({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  await requireAdmin();
  const { c } = await searchParams;
  redirect(c ? `/admin/planejamento?c=${encodeURIComponent(c)}` : '/admin/planejamento');
}

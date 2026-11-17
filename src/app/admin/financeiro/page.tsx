import { financeUnlocked, requireFinanceAccess } from '@/lib/access';
import FinanceLock from '@/components/FinanceLock';
import { lockFinanceAction } from './actions';
import { env } from '@/lib/env';
import { listClients } from '@/lib/notion';
import { todayIn } from '@/lib/domain';
import { finConfigured, loadFin, painel } from '@/lib/financeiro';
import AdminShell from '@/components/AdminShell';
import FinanceBoard from '@/components/FinanceBoard';
import Icon from '@/components/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Financeiro · Arco Contents', robots: { index: false, follow: false } };

const VIEWS = ['visao', 'calendario', 'receitas', 'despesas', 'contas', 'plataformas'] as const;
type View = (typeof VIEWS)[number];

// Financeiro: só para quem tem acesso (o administrador principal e quem tem "Financeiro" nos Acessos).
export default async function Financeiro({ searchParams }: { searchParams: Promise<{ m?: string; v?: string; d?: string }> }) {
  const viewer = await requireFinanceAccess();
  if (!(await financeUnlocked(viewer.email))) {
    return (
      <AdminShell section="financeiro">
        <FinanceLock />
      </AdminShell>
    );
  }
  const sp = await searchParams;
  const today = todayIn(env.timeZone);
  const m = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? sp.m! : today.slice(0, 7);
  const view: View = (VIEWS as readonly string[]).includes(sp.v ?? '') ? (sp.v as View) : 'visao';
  if (!finConfigured()) {
    return (
      <AdminShell section="financeiro">
        <p className="hint">O Financeiro ainda não está ligado às tabelas do Notion.</p>
      </AdminShell>
    );
  }
  const [data, clients] = await Promise.all([loadFin(), listClients().catch(() => [])]);
  const p = painel(m, data, today);
  const templates = data.lancs.filter((l) => l.recorrente && l.cat !== 'Fatura');
  // histórico de recebimentos/pagamentos de cada recorrente (ocorrências gravadas)
  const occ = data.lancs.filter((l) => l.origem && l.cat !== 'Fatura').map((l) => ({ origem: l.origem, comp: l.comp, valor: l.valor, pago: l.pago, skip: l.situacao === 'Suspenso' }));

  return (
    <AdminShell section="financeiro">
      {env.financePassword && (
        <form action={lockFinanceAction} className="fin-lock-out">
          <button type="submit" className="link-btn ic-inline"><Icon name="x" size={12} />Bloquear o Financeiro</button>
        </form>
      )}
      <FinanceBoard
        month={m}
        today={today}
        view={view}
        focusDay={/^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? '') ? sp.d! : null}
        items={p.items}
        templates={templates}
        occurrences={occ}
        contas={data.contas}
        clients={clients.filter((c) => !c.cancelled).map((c) => c.name)}
        kpi={{
          saldo: p.saldo, recebido: p.recebido, aReceber: p.aReceber, pagas: p.pagas, aPagar: p.aPagar, resultado: p.resultado,
          previsto: p.previsto, entradasMes: p.entradasMes, saidasMes: p.saidasMes
        }}
        porBanco={p.porBanco.map((b) => ({ id: b.conta.id, saldo: b.saldo }))}
        atrasados={p.atrasados}
        proximos={p.proximos}
        cartoes={p.cartoes}
        plataformas={p.plataformas}
      />
    </AdminShell>
  );
}

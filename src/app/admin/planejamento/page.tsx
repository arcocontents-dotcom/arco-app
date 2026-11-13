import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { listClients, sameId, updateClient } from '@/lib/notion';
import { MONTHS, addDays, addMonths, monthIdx, parseDay, todayIn, yearNum } from '@/lib/domain';
import { linkedContents, listPlanning, matchCalName, planOptions, pullPostedFromPlan } from '@/lib/planning';
import AdminShell from '@/components/AdminShell';
import Icon from '@/components/Icon';
import PlanBoard from '@/components/PlanBoard';
import CalNamePicker from '@/components/CalNamePicker';
import PlanReport from '@/components/PlanReport';

export const dynamic = 'force-dynamic';

export default async function Planejamento({ searchParams }: { searchParams: Promise<{ c?: string; m?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayIn(env.timeZone);
  const first = `${(parseDay(sp.m) ?? today).slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);
  const all = await listClients();
  const clients = all.filter((c) => !c.cancelled);
  const client = clients.find((c) => sameId(c.id, sp.c)) ?? clients[0] ?? null;
  const q = (m: string) => `/admin/planejamento?c=${client?.id ?? ''}&m=${m}`;

  const head = (
    <div className="toolbar">
      <div className="page-title">
        <p className="label rise ic-inline"><Icon name="bulb" size={14} />Ideias e produção{client ? ` · ${client.name}` : ''}</p>
        <h1 className="display rise" style={{ fontSize: 'clamp(40px, 6vw, 80px)', ['--d' as string]: '60ms' }}>Planejamento</h1>
      </div>
      {client && (
        <div className="actions rise" style={{ ['--d' as string]: '100ms', alignItems: 'center' }}>
          <Link className="icon-btn" href={q(addMonths(first, -1))} aria-label="Mês anterior"><Icon name="left" /></Link>
          <span className="label" style={{ minWidth: 120, textAlign: 'center' }}>{MONTHS[monthIdx(first)]} {yearNum(first)}</span>
          <Link className="icon-btn" href={q(addMonths(first, 1))} aria-label="Próximo mês"><Icon name="right" /></Link>
        </div>
      )}
    </div>
  );

  if (!client) {
    return <AdminShell section="planejamento">{head}<p className="empty">Cadastre um cliente para começar.</p></AdminShell>;
  }

  const options = await planOptions();
  if (typeof options === 'string') {
    return (
      <AdminShell section="planejamento" current={client.id}>
        {head}
        <section className="panel setup rise">
          <Icon name="link" size={28} />
          <h2 className="display" style={{ fontSize: 26, margin: 0 }}>Ligar o Calendário mensal</h2>
          {options === 'sem-acesso' ? (
            <>
              <p>O app ainda não tem permissão para ver o <strong>🗓️ Calendário mensal</strong> do seu Notion.</p>
              <ol>
                <li>No Notion, abra <strong>Gestão → Bastidores → Demandas individuais</strong>.</li>
                <li>Clique em <strong>•••</strong> (canto superior direito) → <strong>Conexões</strong>.</li>
                <li>Adicione a mesma conexão do app (a integração que você criou para o Arco app).</li>
              </ol>
              <p className="hint">Isso só dá acesso. Nada no Notion é apagado ou reorganizado.</p>
            </>
          ) : options === 'nao-configurado' ? (
            <p>Falta a variável NOTION_PLANNING_DB no servidor.</p>
          ) : (
            <p>O Notion não respondeu agora. Tente de novo em instantes.</p>
          )}
          <Link className="btn small" href={q(first)}><Icon name="undo" size={15} />Tentar de novo</Link>
        </section>
      </AdminShell>
    );
  }

  let cal = client.calName;
  if (!cal) {
    const guess = matchCalName(client.name, options.clients);
    if (guess) {
      cal = guess;
      await updateClient(client.id, { calName: guess }).catch(() => undefined);
    }
  }
  if (!cal) {
    return (
      <AdminShell section="planejamento" current={client.id}>
        {head}
        <section className="panel setup rise">
          <h2 className="display" style={{ fontSize: 26, margin: 0 }}>Qual é {client.name} no Calendário mensal?</h2>
          <p className="hint">Escolha o nome que aparece na coluna Cliente do Notion. É só uma vez.</p>
          <CalNamePicker clientId={client.id} options={options.clients} />
        </section>
      </AdminShell>
    );
  }

  const [items, linked] = await Promise.all([listPlanning(cal, first, last), linkedContents(client.id).catch(() => [])]);
  if (typeof items === 'string') {
    return <AdminShell section="planejamento" current={client.id}>{head}<p className="error">Não foi possível ler o Calendário mensal agora.</p></AdminShell>;
  }
  await pullPostedFromPlan(items, linked);
  const links = Object.fromEntries(
    linked.filter((c) => c.planningId).map((c) => [c.planningId!.replace(/-/g, ''), { id: c.id, status: c.status }])
  );

  return (
    <AdminShell section="planejamento" current={client.id}>
      {head}
      <div className="plan-actions rise" style={{ ['--d' as string]: '110ms' }}>
        <p className="hint" style={{ margin: 0 }}>Antes do mês começar, mande o planejamento para o cliente aprovar no WhatsApp. Depois, cada conteúdo é aprovado na semana dele.</p>
        <PlanReport clientId={client.id} clientName={client.name} month={first} appUrl={env.appUrl} />
      </div>
      <PlanBoard
        key={`${client.id}-${first}`}
        clientId={client.id}
        cal={cal}
        month={first}
        items={items}
        links={links}
        options={options}
      />
    </AdminShell>
  );
}

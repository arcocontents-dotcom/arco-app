'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import HistoryList from './HistoryList';
import {
  deleteContaAction, deleteLancAction, payAction, saveContaAction, saveLancAction, situacaoAction, skipMonthAction
} from '@/app/admin/financeiro/actions';

// Financeiro: painel, calendário com contagem regressiva, receitas, despesas, bancos e cartões e plataformas.

type Tipo = 'Entrada' | 'Saída';
type Cat = 'Mensalidade' | 'Freelancer' | 'Adicional' | 'Despesa fixa' | 'Despesa avulsa' | 'Plataforma' | 'Fatura';
type Status = 'pago' | 'pendente' | 'atrasado';
export interface FItem {
  key: string; id: string | null; templateId: string | null; desc: string; tipo: Tipo; cat: Cat; grupo: string; valor: number;
  due: string; paid: string | null; cliente: string; conta: string; cartao: string | null; comp: string; status: Status; virtual: boolean;
  obs: string; history: string; charges?: FItem[];
}
export interface FLanc {
  id: string; desc: string; tipo: Tipo; cat: Cat; grupo: string; valor: number; venc: string | null; pago: string | null; recorrente: boolean;
  dia: number | null; inicio: string | null; fim: string | null; situacao: 'Ativo' | 'Suspenso' | 'Encerrado'; cliente: string; conta: string; obs: string; history: string;
}
export interface FConta {
  id: string; nome: string; tipo: 'Banco' | 'Cartão'; saldo: number; saldoEm: string | null; fech: number | null; venc: number | null; pagoPor: string; cor: string; final: string; history: string;
}
type View = 'visao' | 'calendario' | 'receitas' | 'despesas' | 'contas' | 'plataformas';

const CORES: Record<string, string> = { Preto: '#111111', Roxo: '#6940a5', Laranja: '#d9730d', Azul: '#0b6e99', Verde: '#0f7b6c', Vermelho: '#c23b3b', Amarelo: '#dfab01', Cinza: '#787774' };
const ENTRADA_CATS: Cat[] = ['Mensalidade', 'Freelancer', 'Adicional'];
const SAIDA_CATS: Cat[] = ['Despesa fixa', 'Despesa avulsa', 'Plataforma'];
const RECORR: Cat[] = ['Mensalidade', 'Despesa fixa', 'Plataforma'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WD = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlShort = (v: number) => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brl(v));
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const toUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const diffDays = (a: string, b: string) => Math.round((toUTC(a) - toUTC(b)) / 864e5);
const addDays = (d: string, n: number) => new Date(toUTC(d) + n * 864e5).toISOString().slice(0, 10);
const shiftMonth = (m: string, n: number) => {
  const t = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
};
const weekdayMon = (d: string) => (new Date(toUTC(d)).getUTCDay() + 6) % 7;
const monthLabel = (m: string) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;

/** "vence em 3 dias", "recebe amanhã", "atrasada há 2 dias"… */
export function countdown(it: Pick<FItem, 'tipo' | 'due' | 'paid'>, today: string): { text: string; cls: string } {
  const entra = it.tipo === 'Entrada';
  if (it.paid) return { text: `${entra ? 'recebido' : 'pago'} ${br(it.paid)}`, cls: 'ok' };
  const n = diffDays(it.due, today);
  if (n < 0) return { text: `atrasad${entra ? 'o' : 'a'} há ${-n} dia${n < -1 ? 's' : ''}`, cls: 'late' };
  const verb = entra ? 'recebe' : 'vence';
  if (n === 0) return { text: `${verb} hoje`, cls: 'today' };
  if (n === 1) return { text: `${verb} amanhã`, cls: 'soon' };
  return { text: `${verb} em ${n} dias`, cls: n <= 5 ? 'soon' : '' };
}

type FormState =
  | { kind: 'new'; day: string | null; cat?: Cat }
  | { kind: 'item'; item: FItem }
  | { kind: 'template'; lanc: FLanc }
  | null;

export default function FinanceBoard(props: {
  month: string; today: string; view: View; focusDay: string | null;
  items: FItem[]; templates: FLanc[]; occurrences: { origem: string; comp: string; valor: number; pago: string | null; skip: boolean }[];
  contas: FConta[]; clients: string[];
  kpi: { saldo: number; recebido: number; aReceber: number; pagas: number; aPagar: number; resultado: number; previsto: number; entradasMes: number; saidasMes: number };
  porBanco: { id: string; saldo: number }[];
  atrasados: FItem[]; proximos: FItem[];
  cartoes: { conta: FConta; fatura: FItem | null; proxima: FItem | null }[];
  plataformas: { total: number; porCartao: { nome: string; total: number }[] };
}) {
  const { month, today, view, items, kpi } = props;
  const router = useRouter();
  const [form, setForm] = useState<FormState>(null);
  const [contaForm, setContaForm] = useState<FConta | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();
  const q = (o: { m?: string; v?: View; d?: string | null }) => {
    const p = new URLSearchParams();
    p.set('m', o.m ?? month);
    p.set('v', o.v ?? view);
    if (o.d) p.set('d', o.d);
    return `/admin/financeiro?${p.toString()}`;
  };
  const refresh = () => router.refresh();

  const pay = (it: FItem, paid: string | null) => {
    setBusy(it.key);
    setErr(null);
    start(async () => {
      const r = await payAction({ id: it.id, templateId: it.templateId, comp: it.comp, cat: it.cat, valor: it.valor, conta: it.conta, desc: it.desc }, paid);
      setBusy(null);
      if (!r.ok) setErr(r.error);
      refresh();
    });
  };

  const Row = ({ it, compact = false }: { it: FItem; compact?: boolean }) => {
    const cd = countdown(it, today);
    const entra = it.tipo === 'Entrada';
    return (
      <li className={`fin-row s-${it.status}${entra ? ' in' : ' out'}`}>
        <button
          type="button"
          className={`fin-check${it.paid ? ' on' : ''}`}
          aria-label={it.paid ? `Desfazer pagamento: ${it.desc}` : `${entra ? 'Marcar como recebido' : 'Marcar como pago'}: ${it.desc}`}
          disabled={busy === it.key}
          onClick={() => pay(it, it.paid ? null : today)}
        >
          {it.paid && <Icon name="check" size={13} />}
        </button>
        <button type="button" className="fin-main" onClick={() => setForm({ kind: 'item', item: it })} aria-label={`Abrir ${it.desc}`}>
          <span className="fin-desc">
            <strong>{it.desc}</strong>
            <small>
              {[it.cat === 'Fatura' ? `${it.charges?.length ?? 0} gasto${(it.charges?.length ?? 0) === 1 ? '' : 's'} no cartão` : it.cat, it.cliente, it.cartao && it.cat !== 'Fatura' ? `cartão ${it.cartao}` : it.conta]
                .filter(Boolean).join(' · ')}
              {it.templateId && it.cat !== 'Fatura' && <span className="fin-rec" title="Recorrente"> ↻</span>}
            </small>
          </span>
          {!compact && <span className={`fin-cd ${cd.cls}`}>{cd.text}</span>}
          <span className="fin-val">{entra ? '+' : '−'} {brl(it.valor)}</span>
        </button>
      </li>
    );
  };

  const tabs: [View, string, Parameters<typeof Icon>[0]['name']][] = [
    ['visao', 'Visão geral', 'chart'], ['calendario', 'Calendário', 'calendar'], ['receitas', 'Receitas', 'download'],
    ['despesas', 'Despesas', 'send'], ['contas', 'Bancos e cartões', 'wallet'], ['plataformas', 'Plataformas', 'grid']
  ];
  const late = props.atrasados;
  const soon = props.proximos.filter((i) => diffDays(i.due, today) <= 3);

  return (
    <div className="fin">
      <div className="toolbar">
        <div className="page-title">
          <p className="label rise ic-inline"><Icon name="wallet" size={14} />Entradas, saídas e vencimentos</p>
          <h1 className="display rise" style={{ fontSize: 'clamp(40px, 6vw, 80px)', ['--d' as string]: '60ms' }}>Financeiro</h1>
        </div>
        <div className="actions rise" style={{ ['--d' as string]: '100ms', alignItems: 'center' }}>
          <Link className="icon-btn" href={q({ m: shiftMonth(month, -1) })} aria-label="Mês anterior"><Icon name="left" /></Link>
          <span className="label" style={{ minWidth: 130, textAlign: 'center' }}>{monthLabel(month)}</span>
          <Link className="icon-btn" href={q({ m: shiftMonth(month, 1) })} aria-label="Próximo mês"><Icon name="right" /></Link>
          {month !== today.slice(0, 7) && <Link className="link-btn" href={q({ m: today.slice(0, 7) })}>Hoje</Link>}
        </div>
      </div>

      <nav className="fin-tabs" aria-label="Áreas do financeiro">
        {tabs.map(([v, l, ic]) => (
          <Link key={v} href={q({ v })} aria-current={view === v ? 'page' : undefined}><Icon name={ic} size={15} />{l}</Link>
        ))}
      </nav>

      {(late.length > 0 || soon.length > 0) && (
        <div className="fin-alerts" role="status">
          {late.length > 0 && (
            <button type="button" className="fin-alert late" onClick={() => setForm({ kind: 'item', item: late[0] })}>
              <Icon name="bell" size={15} className="ic-play" />
              <b>{late.length} atrasad{late.length > 1 ? 'os' : 'o'}</b> · {late.slice(0, 2).map((i) => `${i.desc} (${countdown(i, today).text})`).join(' · ')}
            </button>
          )}
          {soon.length > 0 && (
            <span className="fin-alert soon">
              <Icon name="clock" size={15} />
              {soon.slice(0, 3).map((i) => `${i.desc} — ${countdown(i, today).text}`).join(' · ')}
            </span>
          )}
        </div>
      )}
      {err && <p className="error" role="alert">{err}</p>}

      {view === 'visao' && (
        <>
          <section className="fin-kpis" aria-label="Resumo do mês">
            <div className="fk main"><span>Saldo disponível</span><strong>{brl(kpi.saldo)}</strong><small>Previsto no fim do mês: {brl(kpi.previsto)}</small></div>
            <div className="fk in"><span>Recebido no mês</span><strong>{brl(kpi.recebido)}</strong><small>a receber {brl(kpi.aReceber)}</small></div>
            <div className="fk out"><span>Despesas pagas</span><strong>{brl(kpi.pagas)}</strong><small>a pagar {brl(kpi.aPagar)}</small></div>
            <div className={`fk ${kpi.resultado >= 0 ? 'pos' : 'neg'}`}><span>{kpi.resultado >= 0 ? 'Lucro do mês' : 'Prejuízo do mês'}</span><strong>{brl(kpi.resultado)}</strong><small>{brlShort(kpi.entradasMes)} entram · {brlShort(kpi.saidasMes)} saem</small></div>
          </section>

          <div className="fin-grid">
            <section className="fin-card" aria-label="Fluxo do mês">
              <h2 className="label">Fluxo do mês · por dia</h2>
              <FlowChart items={items} month={month} today={today} />
            </section>
            <section className="fin-card" aria-label="Bancos">
              <h2 className="label">Onde está o dinheiro</h2>
              <ul className="fin-banks">
                {props.contas.filter((c) => c.tipo === 'Banco').map((c) => (
                  <li key={c.id}><i style={{ background: CORES[c.cor] ?? '#111' }} /><span>{c.nome}</span><b>{brl(props.porBanco.find((b) => b.id === c.id)?.saldo ?? c.saldo)}</b></li>
                ))}
                {props.cartoes.map((c) => (
                  <li key={c.conta.id} className="card"><i style={{ background: CORES[c.conta.cor] ?? '#111' }} /><span>{c.conta.nome} · fatura {c.fatura ? br(c.fatura.due) : '—'}</span><b>{c.fatura ? brl(c.fatura.valor) : brl(0)}</b></li>
                ))}
                {!props.contas.length && <li className="empty"><Link href={q({ v: 'contas' })}>Cadastre seus bancos e cartões</Link></li>}
              </ul>
            </section>
          </div>

          <div className="fin-grid">
            <section className="fin-card" aria-label="Próximos vencimentos">
              <h2 className="label">Próximos vencimentos</h2>
              <ul className="fin-list">{props.proximos.map((it) => <Row key={it.key} it={it} />)}</ul>
              {!props.proximos.length && <p className="hint">Nada vencendo nos próximos dias.</p>}
            </section>
            <section className="fin-card" aria-label="Atrasados">
              <h2 className="label">Atrasados</h2>
              <ul className="fin-list">{late.map((it) => <Row key={it.key} it={it} />)}</ul>
              {!late.length && <p className="hint">Nenhuma conta atrasada. 👏</p>}
            </section>
          </div>
        </>
      )}

      {view === 'calendario' && <FinCalendar month={month} today={today} items={items} focusDay={props.focusDay} Row={Row} onAdd={(d) => setForm({ kind: 'new', day: d })} hrefDay={(d) => q({ d })} />}

      {view === 'receitas' && (
        <div className="fin-cols">
          <TemplateList title="Clientes mensais" cat="Mensalidade" templates={props.templates} occurrences={props.occurrences} today={today} onOpen={(l) => setForm({ kind: 'template', lanc: l })} onNew={() => setForm({ kind: 'new', day: null, cat: 'Mensalidade' })} />
          <ItemSection title={`Freelancers e avulsos · ${monthLabel(month)}`} items={items.filter((i) => i.cat === 'Freelancer')} Row={Row} onNew={() => setForm({ kind: 'new', day: null, cat: 'Freelancer' })} empty="Nenhum serviço avulso neste mês." />
          <ItemSection title={`Adicionais dos clientes · ${monthLabel(month)}`} items={items.filter((i) => i.cat === 'Adicional')} Row={Row} onNew={() => setForm({ kind: 'new', day: null, cat: 'Adicional' })} empty="Nenhum adicional neste mês." />
          <ItemSection title={`Mensalidades de ${monthLabel(month)}`} items={items.filter((i) => i.cat === 'Mensalidade')} Row={Row} empty="Nenhuma mensalidade neste mês." />
        </div>
      )}

      {view === 'despesas' && (
        <div className="fin-cols">
          <TemplateList title="Despesas fixas" cat="Despesa fixa" templates={props.templates} occurrences={props.occurrences} today={today} onOpen={(l) => setForm({ kind: 'template', lanc: l })} onNew={() => setForm({ kind: 'new', day: null, cat: 'Despesa fixa' })} />
          <ItemSection title={`Contas de ${monthLabel(month)}`} items={items.filter((i) => i.tipo === 'Saída')} Row={Row} onNew={() => setForm({ kind: 'new', day: null, cat: 'Despesa avulsa' })} empty="Nenhuma despesa neste mês." />
        </div>
      )}

      {view === 'plataformas' && (
        <div className="fin-cols">
          <section className="fin-card plat-sum" aria-label="Gasto com plataformas">
            <span className="label">Assinaturas por mês</span>
            <strong>{brl(props.plataformas.total)}</strong>
            <ul>
              {props.plataformas.porCartao.map((c) => (
                <li key={c.nome}><span>{c.nome}</span><div className="fin-bar"><span style={{ width: `${props.plataformas.total ? (c.total / props.plataformas.total) * 100 : 0}%` }} /></div><b>{brl(c.total)}</b></li>
              ))}
            </ul>
          </section>
          <TemplateList title="Plataformas e assinaturas" cat="Plataforma" templates={props.templates} occurrences={props.occurrences} today={today} onOpen={(l) => setForm({ kind: 'template', lanc: l })} onNew={() => setForm({ kind: 'new', day: null, cat: 'Plataforma' })} />
        </div>
      )}

      {view === 'contas' && (
        <section className="fin-accounts" aria-label="Bancos e cartões">
          {props.contas.map((c) => {
            const card = props.cartoes.find((x) => x.conta.id === c.id);
            const moves = items.filter((i) => i.conta.trim().toLowerCase() === c.nome.toLowerCase() || i.cartao === c.nome);
            return (
              <article key={c.id} className={`acc ${c.tipo === 'Cartão' ? 'is-card' : ''}`} style={{ ['--ac' as string]: CORES[c.cor] ?? '#111' }}>
                <button type="button" className="acc-face" onClick={() => setContaForm(c)} aria-label={`Editar ${c.nome}`}>
                  <span className="acc-type">{c.tipo}{c.final ? ` · •••• ${c.final}` : ''}</span>
                  <strong>{c.nome}</strong>
                  {c.tipo === 'Banco' ? (
                    <span className="acc-big">{brl(props.porBanco.find((b) => b.id === c.id)?.saldo ?? c.saldo)}<small>saldo atual</small></span>
                  ) : (
                    <span className="acc-big">{brl(card?.fatura?.valor ?? 0)}<small>fatura {card?.fatura ? `vence ${br(card.fatura.due)}` : `fecha dia ${c.fech}`}{c.pagoPor ? ` · paga pelo ${c.pagoPor}` : ''}</small></span>
                  )}
                </button>
                {c.tipo === 'Cartão' && card?.fatura && (
                  <ul className="fin-list">
                    <Row it={card.fatura} />
                    {card.fatura.charges?.map((ch) => (
                      <li key={ch.key} className="acc-charge"><span>{br(ch.due)}</span><span>{ch.desc}</span><b>{brl(ch.valor)}</b></li>
                    ))}
                  </ul>
                )}
                {c.tipo === 'Cartão' && card?.proxima && <p className="hint" style={{ margin: 0 }}>Próxima fatura (vence {br(card.proxima.due)}): {brl(card.proxima.valor)}</p>}
                {c.tipo === 'Banco' && (
                  <ul className="fin-list">{moves.slice(0, 6).map((it) => <Row key={it.key} it={it} compact />)}</ul>
                )}
                {c.tipo === 'Banco' && !moves.length && <p className="hint" style={{ margin: 0 }}>Sem movimentações neste mês.</p>}
              </article>
            );
          })}
          <button type="button" className="acc acc-new" onClick={() => setContaForm('new')}><Icon name="plus" />Banco ou cartão</button>
        </section>
      )}

      <button type="button" className="fin-fab" onClick={() => setForm({ kind: 'new', day: props.focusDay })} aria-label="Lançar entrada ou saída">
        <Icon name="plus" size={22} /><span>Lançar</span>
      </button>

      {form && (
        <LancForm
          state={form}
          today={today}
          month={month}
          templates={props.templates}
          contas={props.contas}
          clients={props.clients}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); refresh(); }}
          onPay={(it, d) => { setForm(null); pay(it, d); }}
        />
      )}
      {contaForm && <ContaForm conta={contaForm === 'new' ? null : contaForm} contas={props.contas} onClose={() => setContaForm(null)} onSaved={() => { setContaForm(null); refresh(); }} />}
    </div>
  );
}

function ItemSection({ title, items, Row, onNew, empty }: { title: string; items: FItem[]; Row: (p: { it: FItem }) => React.ReactNode; onNew?: () => void; empty: string }) {
  const total = items.reduce((s, i) => s + i.valor, 0);
  const paid = items.filter((i) => i.paid).reduce((s, i) => s + i.valor, 0);
  return (
    <section className="fin-card" aria-label={title}>
      <div className="fin-card-head">
        <h2 className="label">{title}</h2>
        {onNew && <button type="button" className="link-btn ic-inline" onClick={onNew}><Icon name="plus" size={13} />Novo</button>}
      </div>
      {items.length > 0 && <p className="fin-sub">{brl(paid)} de {brl(total)} {items[0]?.tipo === 'Entrada' ? 'recebidos' : 'pagos'}</p>}
      <ul className="fin-list">{items.map((it) => <Row key={it.key} it={it} />)}</ul>
      {!items.length && <p className="hint">{empty}</p>}
    </section>
  );
}

function TemplateList({ title, cat, templates, occurrences, today, onOpen, onNew }: {
  title: string; cat: Cat; templates: FLanc[]; occurrences: { origem: string; comp: string; valor: number; pago: string | null; skip: boolean }[]; today: string;
  onOpen: (l: FLanc) => void; onNew: () => void;
}) {
  const list = templates.filter((t) => t.cat === cat).sort((a, b) => (a.situacao === 'Ativo' ? 0 : 1) - (b.situacao === 'Ativo' ? 0 : 1) || a.desc.localeCompare(b.desc, 'pt-BR'));
  const total = list.filter((t) => t.situacao === 'Ativo' && (!t.fim || t.fim >= today)).reduce((s, t) => s + t.valor, 0);
  const next = (t: FLanc) => {
    const m = today.slice(0, 7);
    const dayOf = (mm: string) => `${mm}-${String(Math.min(t.dia ?? 1, 28 + (t.dia && t.dia > 28 ? 3 : 0))).padStart(2, '0')}`;
    const d = dayOf(m) >= today ? dayOf(m) : dayOf(shiftMonth(m, 1));
    return d;
  };
  return (
    <section className="fin-card" aria-label={title}>
      <div className="fin-card-head">
        <h2 className="label">{title}</h2>
        <button type="button" className="link-btn ic-inline" onClick={onNew}><Icon name="plus" size={13} />Novo</button>
      </div>
      <p className="fin-sub">{brl(total)} por mês · {list.filter((t) => t.situacao === 'Ativo').length} ativo{list.length === 1 ? '' : 's'}</p>
      <ul className="fin-list">
        {list.map((t) => {
          const key = t.id.replace(/-/g, '');
          const paidCount = occurrences.filter((o) => o.origem === key && o.pago).length;
          const ended = t.situacao === 'Encerrado' || (t.fim && t.fim < today);
          const nd = next(t);
          const cd = countdown({ tipo: t.tipo, due: nd, paid: null }, today);
          return (
            <li key={t.id} className={`fin-row tpl${ended ? ' ended' : ''}${t.situacao === 'Suspenso' ? ' paused' : ''}`}>
              <button type="button" className="fin-main" onClick={() => onOpen(t)} aria-label={`Abrir ${t.desc}`}>
                <span className="fin-desc">
                  <strong>{t.desc}</strong>
                  <small>todo dia {t.dia}{t.conta ? ` · ${t.conta}` : ''}{paidCount ? ` · ${paidCount} ${t.tipo === 'Entrada' ? 'recebido' : 'pago'}${paidCount > 1 ? 's' : ''}` : ''}</small>
                </span>
                <span className={`fin-cd ${ended || t.situacao !== 'Ativo' ? '' : cd.cls}`}>{ended ? 'encerrado' : t.situacao === 'Suspenso' ? 'suspenso' : `próxima ${br(nd)}`}</span>
                <span className="fin-val">{brl(t.valor)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {!list.length && <p className="hint">Nada cadastrado ainda.</p>}
    </section>
  );
}

function FlowChart({ items, month, today }: { items: FItem[]; month: string; today: string }) {
  const days = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const byDay = Array.from({ length: days }, (_, i) => {
    const d = `${month}-${String(i + 1).padStart(2, '0')}`;
    const xs = items.filter((it) => it.due === d);
    return { d, entra: xs.filter((x) => x.tipo === 'Entrada').reduce((s, x) => s + x.valor, 0), sai: xs.filter((x) => x.tipo === 'Saída').reduce((s, x) => s + x.valor, 0) };
  });
  const max = Math.max(1, ...byDay.map((x) => Math.max(x.entra, x.sai)));
  const W = 620, H = 150, bw = W / days;
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? byDay[hover] : null;
  return (
    <div className="flow">
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="Entradas e saídas por dia" onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#e4e1db" />
        {byDay.map((x, i) => (
          <g key={x.d} onMouseEnter={() => setHover(i)}>
            <rect x={i * bw} y="0" width={bw} height={H} fill="transparent" />
            {x.entra > 0 && <rect x={i * bw + bw * 0.2} y={H / 2 - (x.entra / max) * (H / 2 - 4)} width={bw * 0.6} height={(x.entra / max) * (H / 2 - 4)} rx="2" fill="#0f7b6c" />}
            {x.sai > 0 && <rect x={i * bw + bw * 0.2} y={H / 2} width={bw * 0.6} height={(x.sai / max) * (H / 2 - 4)} rx="2" fill="#c9533f" opacity="0.85" />}
            {x.d === today && <rect x={i * bw} y="0" width={bw} height={H} fill="#111" opacity="0.05" />}
            {(i === 0 || (i + 1) % 5 === 0) && <text x={i * bw + bw / 2} y={H + 14} fontSize="10" textAnchor="middle" fill="#8a867f">{i + 1}</text>}
          </g>
        ))}
      </svg>
      <p className="flow-legend">
        {h ? <><b>{br(h.d)}</b> · <span className="in">+ {brl(h.entra)}</span> · <span className="out">− {brl(h.sai)}</span></> : <><span className="in">■ entradas</span> <span className="out">■ saídas</span> · passe o mouse num dia</>}
      </p>
    </div>
  );
}

function FinCalendar({ month, today, items, focusDay, Row, onAdd, hrefDay }: {
  month: string; today: string; items: FItem[]; focusDay: string | null; Row: (p: { it: FItem; compact?: boolean }) => React.ReactNode; onAdd: (d: string) => void; hrefDay: (d: string) => string;
}) {
  const [mode, setMode] = useState<'mes' | 'semana' | 'dia'>('mes');
  const [sel, setSel] = useState<string>(focusDay ?? (today.slice(0, 7) === month ? today : `${month}-01`));
  useEffect(() => { if (focusDay) setSel(focusDay); }, [focusDay]);
  const first = `${month}-01`;
  const start = addDays(first, -weekdayMon(first));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i)).filter((d, i) => i < 35 || d.slice(0, 7) === month);
  const of = (d: string) => items.filter((i) => i.due === d);
  const weekStart = addDays(sel, -weekdayMon(sel));
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const daySum = (d: string) => of(d).reduce((s, i) => s + (i.tipo === 'Entrada' ? i.valor : -i.valor), 0);
  return (
    <div className="fin-cal-wrap">
      <div className="fin-cal-head">
        <div className="seg" role="tablist" aria-label="Visão do calendário">
          {(['mes', 'semana', 'dia'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={mode === v} onClick={() => setMode(v)}>{v === 'mes' ? 'Mês' : v === 'semana' ? 'Semana' : 'Dia'}</button>
          ))}
        </div>
        <span className="fin-legend"><i className="in" />Entrada <i className="out" />Saída <i className="late" />Atrasado <i className="ok" />Pago</span>
      </div>

      {mode === 'mes' && (
        <div className="fin-cal" role="grid" aria-label="Calendário financeiro">
          {WD.map((w) => <span key={w} className="wd">{w}</span>)}
          {cells.map((d) => {
            const xs = of(d);
            return (
              <button key={d} type="button" className={`fcell${d.slice(0, 7) !== month ? ' out' : ''}${d === today ? ' today' : ''}${d === sel ? ' sel' : ''}`} onClick={() => { setSel(d); setMode('dia'); }} aria-label={`${br(d)}: ${xs.length} lançamento${xs.length === 1 ? '' : 's'}`}>
                <span className="n">{+d.slice(8, 10)}</span>
                {xs.slice(0, 3).map((it) => (
                  <span key={it.key} className={`fchip ${it.tipo === 'Entrada' ? 'in' : 'out'} s-${it.status}`}>{it.desc}<b>{brlShort(it.valor)}</b></span>
                ))}
                {xs.length > 3 && <span className="fmore">+{xs.length - 3}</span>}
              </button>
            );
          })}
        </div>
      )}

      {mode === 'semana' && (
        <div className="fin-week">
          {week.map((d) => (
            <section key={d} className={`fwday${d === today ? ' today' : ''}`} aria-label={br(d)}>
              <button type="button" className="fwday-head" onClick={() => { setSel(d); setMode('dia'); }}>
                <span>{WD[weekdayMon(d)]} {br(d)}</span>
                <b className={daySum(d) >= 0 ? 'in' : 'out'}>{of(d).length ? brlShort(daySum(d)) : ''}</b>
              </button>
              <ul className="fin-list">{of(d).map((it) => <Row key={it.key} it={it} compact />)}</ul>
            </section>
          ))}
        </div>
      )}

      {mode === 'dia' && (
        <section className="fin-card fin-day" aria-label={`Dia ${br(sel)}`}>
          <div className="fin-card-head">
            <div className="fin-day-nav">
              <button type="button" className="icon-btn" aria-label="Dia anterior" onClick={() => setSel(addDays(sel, -1))}><Icon name="left" size={16} /></button>
              <h2>{WD[weekdayMon(sel)]}, {br(sel)}{sel === today ? ' · hoje' : ''}</h2>
              <button type="button" className="icon-btn" aria-label="Próximo dia" onClick={() => setSel(addDays(sel, 1))}><Icon name="right" size={16} /></button>
            </div>
            <button type="button" className="btn small" onClick={() => onAdd(sel)}><Icon name="plus" size={14} />Lançar neste dia</button>
          </div>
          {sel.slice(0, 7) !== month ? (
            <p className="hint">Este dia é de outro mês. <Link href={hrefDay(sel).replace(/m=\d{4}-\d{2}/, `m=${sel.slice(0, 7)}`)}>Abrir {monthLabel(sel.slice(0, 7))}</Link></p>
          ) : (
            <>
              <ul className="fin-list">{of(sel).map((it) => <Row key={it.key} it={it} />)}</ul>
              {!of(sel).length && <p className="hint">Nada neste dia.</p>}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function LancForm({ state, today, month, templates, contas, clients, onClose, onSaved, onPay }: {
  state: Exclude<FormState, null>; today: string; month: string; templates: FLanc[]; contas: FConta[]; clients: string[];
  onClose: () => void; onSaved: () => void; onPay: (it: FItem, d: string | null) => void;
}) {
  const item = state.kind === 'item' ? state.item : null;
  const tpl = state.kind === 'template' ? state.lanc : item?.templateId && item.cat !== 'Fatura' ? templates.find((t) => t.id === item.templateId) ?? null : null;
  const isFatura = item?.cat === 'Fatura';
  const occurrence = !!(item && item.templateId && !isFatura); // ocorrência de um recorrente
  const base: Partial<FLanc> = state.kind === 'template' ? state.lanc : item ? { desc: item.desc, tipo: item.tipo, cat: item.cat, grupo: item.grupo, valor: item.valor, venc: item.due, pago: item.paid, cliente: item.cliente, conta: item.conta, obs: item.obs, recorrente: false, dia: tpl?.dia ?? null } : {};
  const initialCat: Cat = state.kind === 'new' ? state.cat ?? 'Despesa avulsa' : (base.cat as Cat) ?? 'Despesa avulsa';
  const [tipo, setTipo] = useState<Tipo>(ENTRADA_CATS.includes(initialCat) ? 'Entrada' : 'Saída');
  const [cat, setCat] = useState<Cat>(initialCat);
  const [desc, setDesc] = useState(base.desc ?? '');
  const [valor, setValor] = useState(base.valor ? String(base.valor).replace('.', ',') : '');
  const [rec, setRec] = useState(state.kind === 'template' ? true : state.kind === 'new' ? RECORR.includes(initialCat) : false);
  const [dia, setDia] = useState(String(base.dia ?? (state.kind === 'new' && state.day ? +state.day.slice(8, 10) : '')));
  const [venc, setVenc] = useState(base.venc ?? (state.kind === 'new' ? state.day ?? today : today));
  const [inicio, setInicio] = useState(state.kind === 'template' ? state.lanc.inicio ?? today : state.kind === 'new' && state.day ? state.day : today);
  const [cliente, setCliente] = useState(base.cliente ?? '');
  const [grupo, setGrupo] = useState(base.grupo ?? '');
  const [conta, setConta] = useState(base.conta ?? '');
  const [obs, setObs] = useState(base.obs ?? '');
  const [jaPago, setJaPago] = useState(!!base.pago);
  const [pagoEm, setPagoEm] = useState(base.pago ?? today);
  const [scope, setScope] = useState<'one' | 'future'>('one');
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirmDel, setConfirmDel] = useState(false);
  const entra = tipo === 'Entrada';
  const cats = entra ? ENTRADA_CATS : SAIDA_CATS;
  const canRec = RECORR.includes(cat);
  const isTemplateEdit = state.kind === 'template';
  const banks = contas.filter((c) => c.tipo === 'Banco');
  const cards = contas.filter((c) => c.tipo === 'Cartão');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const changeTipo = (t: Tipo) => {
    setTipo(t);
    const c = t === 'Entrada' ? 'Freelancer' : 'Despesa avulsa';
    setCat(c);
    setRec(false);
  };
  const save = () =>
    start(async () => {
      setErr(null);
      const x = {
        desc, cat, tipo, valor: valor.replace(/\./g, '').replace(',', '.') as unknown as number, recorrente: canRec && rec,
        dia: dia ? Number(dia) : null, venc: rec ? null : venc, inicio: rec ? inicio : null, cliente, grupo, conta, obs,
        pago: !rec && jaPago ? pagoEm : null, situacao: tpl?.situacao ?? 'Ativo', fim: tpl?.fim ?? null
      };
      const r = occurrence && item?.templateId
        ? await saveLancAction(null, { desc, valor: x.valor, venc: scope === 'one' ? venc : null, conta, obs, dia: x.dia }, { templateId: item.templateId, comp: item.comp, mode: scope })
        : await saveLancAction(isTemplateEdit ? state.lanc.id : item?.id ?? null, x as never);
      if (!r.ok) return setErr(r.error);
      if (occurrence && item && jaPago !== !!item.paid) onPay({ ...item, id: r.id }, jaPago ? pagoEm : null);
      else onSaved();
    });
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setErr(r.error ?? 'Erro');
      onSaved();
    });

  const title = state.kind === 'new' ? 'Novo lançamento' : isFatura ? item!.desc : isTemplateEdit ? (entra ? 'Recebimento mensal' : 'Despesa mensal') : 'Lançamento';
  if (!mounted) return null;
  return createPortal(
    <div className="leave-overlay" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="leave-box rform fin-form">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="label">{title}</span>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onClose}><Icon name="x" /></button>
        </div>

        {isFatura && item ? (
          <>
            <div className="fat-head">
              <strong>{brl(item.valor)}</strong>
              <span className={`fin-cd ${countdown(item, today).cls}`}>{countdown(item, today).text}</span>
              <small>vence {br(item.due)}{item.conta ? ` · paga pelo ${item.conta}` : ''}</small>
            </div>
            <ul className="fin-list">
              {item.charges?.map((ch) => <li key={ch.key} className="acc-charge"><span>{br(ch.due)}</span><span>{ch.desc}</span><b>{brl(ch.valor)}</b></li>)}
            </ul>
            <p className="hint" style={{ margin: 0 }}>Os gastos no cartão entram aqui e só saem do caixa quando a fatura é paga.</p>
            <button type="button" className="btn" disabled={pending} onClick={() => onPay(item, item.paid ? null : today)}>
              <Icon name="check" size={16} />{item.paid ? 'Desfazer pagamento da fatura' : 'Marcar fatura como paga hoje'}
            </button>
            <HistoryList history={item.history} />
          </>
        ) : (
          <>
            {state.kind === 'new' && (
              <div className="seg big" role="radiogroup" aria-label="Entrada ou saída">
                <button type="button" role="radio" aria-checked={entra} className="in" onClick={() => changeTipo('Entrada')}>+ Entrada</button>
                <button type="button" role="radio" aria-checked={!entra} className="out" onClick={() => changeTipo('Saída')}>− Saída</button>
              </div>
            )}
            {state.kind === 'new' && (
              <div className="rf-urg rf-ckind" role="radiogroup" aria-label="Categoria">
                {cats.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={cat === c} onClick={() => { setCat(c); setRec(RECORR.includes(c)); }}>{c}</button>
                ))}
              </div>
            )}
            <input className="drawer-title" placeholder={entra ? 'Ex.: Mensalidade Bronie' : 'Ex.: Plano de saúde'} aria-label="Descrição" value={desc} autoFocus={state.kind === 'new'} onChange={(e) => setDesc(e.target.value)} maxLength={200} />
            <label className="rf-row">
              <span className="rf-l">Valor</span>
              <span className="fin-money"><span>R$</span><input className="ninput" inputMode="decimal" aria-label="Valor" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ''))} /></span>
            </label>

            {occurrence && (
              <div className="rf-row">
                <span className="rf-l">Alterar</span>
                <div className="rf-urg rf-ckind" role="radiogroup" aria-label="Alterar quais meses">
                  <button type="button" role="radio" aria-checked={scope === 'one'} onClick={() => setScope('one')}>Só este mês</button>
                  <button type="button" role="radio" aria-checked={scope === 'future'} onClick={() => setScope('future')}>Este e os próximos</button>
                </div>
              </div>
            )}

            {canRec && (state.kind === 'new' || isTemplateEdit) && (
              <label className="rf-row fin-switch">
                <span className="rf-l">Repetir</span>
                <input type="checkbox" checked={rec} onChange={(e) => setRec(e.target.checked)} aria-label="Repetir todo mês" />
                <span>Todo mês, gerado sozinho</span>
              </label>
            )}
            {(rec || (occurrence && scope === 'future')) ? (
              <div className="rf-row">
                <span className="rf-l">Vence todo dia</span>
                <input className="ninput" style={{ width: 80 }} type="number" min={1} max={31} aria-label="Dia do vencimento" value={dia} onChange={(e) => setDia(e.target.value)} />
                {rec && <><span className="rf-l" style={{ minWidth: 0 }}>desde</span><input className="ninput" type="date" aria-label="Início" value={inicio} onChange={(e) => setInicio(e.target.value)} /></>}
              </div>
            ) : (
              <label className="rf-row">
                <span className="rf-l">{entra ? 'Recebe em' : 'Vence em'}</span>
                <input className="ninput" type="date" aria-label="Vencimento" value={venc} onChange={(e) => setVenc(e.target.value)} />
              </label>
            )}

            {entra ? (
              <label className="rf-row">
                <span className="rf-l">Cliente</span>
                <input className="ninput" list="fin-clients" aria-label="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" />
                <datalist id="fin-clients">{clients.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
            ) : (
              <label className="rf-row">
                <span className="rf-l">Grupo</span>
                <input className="ninput" aria-label="Grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)} placeholder="Ex.: plano de saúde, software, aluguel" list="fin-groups" />
                <datalist id="fin-groups">{['Plano de saúde', 'Aluguel', 'Internet', 'Software', 'Funcionários', 'Equipamentos', 'Impostos'].map((g) => <option key={g} value={g} />)}</datalist>
              </label>
            )}
            <label className="rf-row">
              <span className="rf-l">{entra ? 'Recebe no' : 'Sai do'}</span>
              <select className="ninput" aria-label="Banco ou cartão" value={conta} onChange={(e) => setConta(e.target.value)}>
                <option value="">— escolher —</option>
                {banks.length > 0 && <optgroup label="Bancos">{banks.map((b) => <option key={b.id} value={b.nome}>{b.nome}</option>)}</optgroup>}
                {!entra && cards.length > 0 && <optgroup label="Cartões (entra na fatura)">{cards.map((b) => <option key={b.id} value={b.nome}>{b.nome}{b.final ? ` •••• ${b.final}` : ''}</option>)}</optgroup>}
              </select>
            </label>
            {!rec && !isTemplateEdit && (
              <label className="rf-row fin-switch">
                <span className="rf-l">{entra ? 'Recebido' : 'Pago'}</span>
                <input type="checkbox" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)} aria-label={entra ? 'Já foi recebido' : 'Já foi pago'} />
                {jaPago && <input className="ninput" type="date" aria-label="Data do pagamento" value={pagoEm} onChange={(e) => setPagoEm(e.target.value)} />}
              </label>
            )}
            <label className="rf-row rf-desc">
              <span className="rf-l">Observação</span>
              <textarea className="ninput" rows={2} aria-label="Observação" value={obs} onChange={(e) => setObs(e.target.value)} />
            </label>

            {err && <p className="error" role="alert" style={{ margin: 0 }}>{err}</p>}
            <div className="fin-form-actions">
              <button type="button" className="btn" disabled={pending} onClick={save}><Icon name="check" size={16} />{pending ? 'Salvando…' : 'Salvar'}</button>
              {isTemplateEdit && tpl && (
                <div className="fin-more">
                  {tpl.situacao === 'Ativo' ? (
                    <>
                      <button type="button" className="link-btn" onClick={() => act(() => situacaoAction(tpl.id, 'Suspenso'))}>Suspender cobrança</button>
                      <button type="button" className="link-btn" onClick={() => act(() => situacaoAction(tpl.id, 'Encerrado'))}>Encerrar contrato</button>
                    </>
                  ) : (
                    <button type="button" className="link-btn" onClick={() => act(() => situacaoAction(tpl.id, 'Ativo'))}>Reativar</button>
                  )}
                </div>
              )}
              {occurrence && item && (
                <button type="button" className="link-btn" onClick={() => act(() => skipMonthAction(item.templateId!, item.comp))}>Tirar só este mês</button>
              )}
              {!occurrence && (item?.id || isTemplateEdit) && (
                confirmDel ? (
                  <span className="fin-del">Apagar mesmo? <button type="button" className="link-btn danger" onClick={() => act(() => deleteLancAction(isTemplateEdit ? state.lanc.id : item!.id!))}>Sim, apagar</button> <button type="button" className="link-btn" onClick={() => setConfirmDel(false)}>Não</button></span>
                ) : (
                  <button type="button" className="link-btn danger ic-inline" onClick={() => setConfirmDel(true)}><Icon name="trash" size={13} />Apagar</button>
                )
              )}
            </div>
            {tpl && <p className="hint" style={{ margin: 0 }}>{isTemplateEdit ? 'Mudanças aqui valem para os próximos meses. Os meses já pagos não mudam.' : `Recorrente: ${brl(tpl.valor)} todo dia ${tpl.dia}.`}</p>}
            <HistoryList history={isTemplateEdit ? state.lanc.history : [item?.history, tpl && !isTemplateEdit ? '' : ''].filter(Boolean).join('\n')} />
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function ContaForm({ conta, contas, onClose, onSaved }: { conta: FConta | null; contas: FConta[]; onClose: () => void; onSaved: () => void }) {
  const [tipo, setTipo] = useState<'Banco' | 'Cartão'>(conta?.tipo ?? 'Banco');
  const [nome, setNome] = useState(conta?.nome ?? '');
  const [saldo, setSaldo] = useState(conta ? String(conta.saldo).replace('.', ',') : '');
  const [saldoEm, setSaldoEm] = useState(conta?.saldoEm ?? '');
  const [fech, setFech] = useState(conta?.fech ? String(conta.fech) : '');
  const [venc, setVenc] = useState(conta?.venc ? String(conta.venc) : '');
  const [pagoPor, setPagoPor] = useState(conta?.pagoPor ?? '');
  const [cor, setCor] = useState(conta?.cor ?? 'Preto');
  const [final, setFinal] = useState(conta?.final ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const save = () =>
    start(async () => {
      const r = await saveContaAction(conta?.id ?? null, { nome, tipo, saldo: saldo.replace(/\./g, '').replace(',', '.') as unknown as number, saldoEm: saldoEm || null, fech: Number(fech) || null, venc: Number(venc) || null, pagoPor, cor, final });
      if (!r.ok) return setErr(r.error);
      onSaved();
    });
  const banks = useMemo(() => contas.filter((c) => c.tipo === 'Banco'), [contas]);
  if (!mounted) return null;
  return createPortal(
    <div className="leave-overlay" role="dialog" aria-modal="true" aria-label={conta ? `Editar ${conta.nome}` : 'Novo banco ou cartão'} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="leave-box rform fin-form">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="label">{conta ? 'Banco ou cartão' : 'Novo banco ou cartão'}</span>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="seg big" role="radiogroup" aria-label="Tipo">
          <button type="button" role="radio" aria-checked={tipo === 'Banco'} onClick={() => setTipo('Banco')}>Banco</button>
          <button type="button" role="radio" aria-checked={tipo === 'Cartão'} onClick={() => setTipo('Cartão')}>Cartão</button>
        </div>
        <input className="drawer-title" placeholder={tipo === 'Banco' ? 'Ex.: Nubank PJ' : 'Ex.: Cartão Inter'} aria-label="Nome" value={nome} autoFocus onChange={(e) => setNome(e.target.value)} />
        {tipo === 'Banco' ? (
          <div className="rf-row">
            <span className="rf-l">Saldo</span>
            <span className="fin-money"><span>R$</span><input className="ninput" inputMode="decimal" aria-label="Saldo informado" value={saldo} onChange={(e) => setSaldo(e.target.value.replace(/[^\d.,-]/g, ''))} /></span>
            <input className="ninput" type="date" aria-label="Saldo em" value={saldoEm} onChange={(e) => setSaldoEm(e.target.value)} />
          </div>
        ) : (
          <>
            <div className="rf-row">
              <span className="rf-l">Fatura</span>
              <span>fecha dia</span><input className="ninput" style={{ width: 70 }} type="number" min={1} max={31} aria-label="Dia de fechamento" value={fech} onChange={(e) => setFech(e.target.value)} />
              <span>vence dia</span><input className="ninput" style={{ width: 70 }} type="number" min={1} max={31} aria-label="Dia de vencimento" value={venc} onChange={(e) => setVenc(e.target.value)} />
            </div>
            <label className="rf-row">
              <span className="rf-l">Pago pelo</span>
              <select className="ninput" aria-label="Banco que paga a fatura" value={pagoPor} onChange={(e) => setPagoPor(e.target.value)}>
                <option value="">— banco —</option>
                {banks.map((b) => <option key={b.id} value={b.nome}>{b.nome}</option>)}
              </select>
            </label>
          </>
        )}
        <label className="rf-row"><span className="rf-l">Final</span><input className="ninput" style={{ width: 90 }} inputMode="numeric" aria-label="Últimos dígitos" value={final} maxLength={4} onChange={(e) => setFinal(e.target.value.replace(/\D/g, ''))} /></label>
        <div className="rf-row">
          <span className="rf-l">Cor</span>
          <div className="fin-colors" role="radiogroup" aria-label="Cor">
            {Object.entries(CORES).map(([n, c]) => <button key={n} type="button" role="radio" aria-checked={cor === n} aria-label={n} style={{ background: c }} onClick={() => setCor(n)} />)}
          </div>
        </div>
        {err && <p className="error" role="alert" style={{ margin: 0 }}>{err}</p>}
        <div className="fin-form-actions">
          <button type="button" className="btn" disabled={pending} onClick={save}><Icon name="check" size={16} />{pending ? 'Salvando…' : 'Salvar'}</button>
          {conta && (del ? (
            <span className="fin-del">Apagar? <button type="button" className="link-btn danger" onClick={() => start(async () => { const r = await deleteContaAction(conta.id); if (!r.ok) setErr(r.error); else onSaved(); })}>Sim</button> <button type="button" className="link-btn" onClick={() => setDel(false)}>Não</button></span>
          ) : <button type="button" className="link-btn danger" onClick={() => setDel(true)}>Apagar</button>)}
        </div>
        {conta && <HistoryList history={conta.history} />}
      </div>
    </div>,
    document.body
  );
}

import 'server-only';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { env } from './env';
import { invalidate, memo } from './cache';
import { addDays } from './domain';
import { checkbox, date, isPage, notion, queryAll, select, text, titleProp } from './notion';

// Financeiro: lançamentos (entradas e saídas) e contas (bancos e cartões), em duas tabelas do app no Notion.
// Recorrentes: a linha com "Recorrente" é o modelo; o app gera a ocorrência de cada mês sozinho.
// Uma ocorrência só vira linha própria quando é paga, editada ou pulada (Origem = modelo, Competência = AAAA-MM),
// então nunca duplica. Gastos no cartão entram na fatura do cartão (e não contam duas vezes nas saídas).

export const CATEGORIAS = ['Mensalidade', 'Freelancer', 'Adicional', 'Despesa fixa', 'Despesa avulsa', 'Plataforma', 'Fatura'] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export type Tipo = 'Entrada' | 'Saída';
export const ENTRADAS: Categoria[] = ['Mensalidade', 'Freelancer', 'Adicional'];
export const SAIDAS: Categoria[] = ['Despesa fixa', 'Despesa avulsa', 'Plataforma'];
export const RECORRENTES: Categoria[] = ['Mensalidade', 'Despesa fixa', 'Plataforma'];
export const CORES = ['Preto', 'Roxo', 'Laranja', 'Azul', 'Verde', 'Vermelho', 'Amarelo', 'Cinza'] as const;

export interface Lanc {
  id: string;
  desc: string;
  tipo: Tipo;
  cat: Categoria;
  grupo: string;
  valor: number;
  venc: string | null;
  pago: string | null;
  recorrente: boolean;
  dia: number | null;
  inicio: string | null;
  fim: string | null;
  situacao: 'Ativo' | 'Suspenso' | 'Encerrado';
  cliente: string;
  conta: string;
  origem: string;
  comp: string;
  obs: string;
  history: string;
}

export interface Conta {
  id: string;
  nome: string;
  tipo: 'Banco' | 'Cartão';
  saldo: number;
  saldoEm: string | null;
  fech: number | null;
  venc: number | null;
  pagoPor: string;
  cor: string;
  final: string;
  history: string;
}

export type Status = 'pago' | 'pendente' | 'atrasado';

/** Um lançamento no calendário: avulso, ocorrência de um recorrente (real ou gerada) ou fatura de cartão. */
export interface Item {
  key: string;
  id: string | null;
  templateId: string | null;
  desc: string;
  tipo: Tipo;
  cat: Categoria;
  grupo: string;
  valor: number;
  due: string;
  paid: string | null;
  cliente: string;
  conta: string;
  /** Saída paga no cartão: entra na fatura, não conta direto nas saídas. */
  cartao: string | null;
  comp: string;
  status: Status;
  virtual: boolean;
  obs: string;
  history: string;
  /** Fatura: os gastos que entram nela. */
  charges?: Item[];
}

const num = (p: unknown) => {
  const v = p as { type?: string; number?: number | null } | undefined;
  return v?.type === 'number' && typeof v.number === 'number' ? v.number : null;
};
const d10 = (s: string | null) => (s ? s.slice(0, 10) : null);

function toLanc(p: PageObjectResponse): Lanc {
  const pr = p.properties;
  const tipo = select(pr['Tipo']) === 'Saída' ? 'Saída' : 'Entrada';
  const cat = (CATEGORIAS as readonly string[]).includes(select(pr['Categoria']) ?? '') ? (select(pr['Categoria']) as Categoria) : tipo === 'Saída' ? 'Despesa avulsa' : 'Freelancer';
  const sit = select(pr['Situação']);
  return {
    id: p.id,
    desc: text(pr['Descrição']) || 'Sem nome',
    tipo,
    cat,
    grupo: text(pr['Grupo']),
    valor: num(pr['Valor']) ?? 0,
    venc: d10(date(pr['Vencimento'])),
    pago: d10(date(pr['Pago em'])),
    recorrente: checkbox(pr['Recorrente']),
    dia: num(pr['Dia']),
    inicio: d10(date(pr['Início'])),
    fim: d10(date(pr['Fim'])),
    situacao: sit === 'Suspenso' || sit === 'Encerrado' ? sit : 'Ativo',
    cliente: text(pr['Cliente']),
    conta: text(pr['Conta']),
    origem: text(pr['Origem']).replace(/-/g, ''),
    comp: text(pr['Competência']),
    obs: text(pr['Observação']),
    history: text(pr['Histórico'])
  };
}

function toConta(p: PageObjectResponse): Conta {
  const pr = p.properties;
  return {
    id: p.id,
    nome: text(pr['Nome']) || 'Sem nome',
    tipo: select(pr['Tipo']) === 'Cartão' ? 'Cartão' : 'Banco',
    saldo: num(pr['Saldo']) ?? 0,
    saldoEm: d10(date(pr['Saldo em'])),
    fech: num(pr['Fechamento']),
    venc: num(pr['Vencimento']),
    pagoPor: text(pr['Pago por']),
    cor: select(pr['Cor']) ?? 'Preto',
    final: text(pr['Final']),
    history: text(pr['Histórico'])
  };
}

export const finConfigured = () => !!env.finDb && !!env.finAccountsDb;

export function loadFin(): Promise<{ lancs: Lanc[]; contas: Conta[] }> {
  if (!finConfigured()) return Promise.resolve({ lancs: [], contas: [] });
  return memo('fin:all', 10_000, async () => {
    const [a, b] = await Promise.all([queryAll(env.finDb!, {}), queryAll(env.finAccountsDb!, {})]);
    return {
      lancs: a.filter((p) => isPage(p) && !p.archived).map((p) => toLanc(p as PageObjectResponse)),
      contas: b.filter((p) => isPage(p) && !p.archived).map((p) => toConta(p as PageObjectResponse)).sort((x, y) => x.tipo.localeCompare(y.tipo) || x.nome.localeCompare(y.nome, 'pt-BR'))
    };
  });
}

// ---------- datas ----------
export const monthOf = (d: string) => d.slice(0, 7);
export const shiftMonth = (m: string, n: number) => {
  const [y, mo] = m.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
};
const daysIn = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
};
export const dayIn = (m: string, d: number) => `${m}-${String(Math.min(Math.max(1, Math.round(d)), daysIn(m))).padStart(2, '0')}`;
export const lastDay = (m: string) => dayIn(m, 31);

const statusOf = (paid: string | null, due: string, today: string): Status => (paid ? 'pago' : due < today ? 'atrasado' : 'pendente');

/** Ocorrências do mês (sem faturas): avulsos, recorrentes gerados e ocorrências já gravadas. */
function rawMonth(m: string, lancs: Lanc[], today: string): Item[] {
  const out: Item[] = [];
  const occ = new Map<string, Lanc>();
  for (const l of lancs) if (l.origem && l.comp) occ.set(`${l.origem}|${l.comp}`, l);
  for (const l of lancs) {
    if (l.cat === 'Fatura' || l.origem) continue;
    if (!l.recorrente) {
      const due = l.venc ?? l.pago;
      if (!due || monthOf(due) !== m) continue;
      out.push(itemFrom(l, due, null, m, today, false));
      continue;
    }
    // modelo recorrente
    const start = l.inicio ? monthOf(l.inicio) : l.venc ? monthOf(l.venc) : null;
    if (start && m < start) continue;
    if (l.fim && m > monthOf(l.fim)) continue;
    const o = occ.get(`${l.id.replace(/-/g, '')}|${m}`);
    if (o) {
      if (o.situacao === 'Suspenso') continue; // pulado só neste mês
      out.push(itemFrom({ ...l, ...o, recorrente: false }, o.venc ?? dayIn(m, l.dia ?? 1), l.id, m, today, false, o.id));
      continue;
    }
    if (l.situacao !== 'Ativo') continue; // suspenso ou encerrado: não gera novas
    out.push(itemFrom(l, dayIn(m, l.dia ?? Number((l.venc ?? '01').slice(-2))), l.id, m, today, true));
  }
  return out;
}

function itemFrom(l: Lanc, due: string, templateId: string | null, comp: string, today: string, virtual: boolean, rowId?: string): Item {
  return {
    key: templateId ? `${templateId.replace(/-/g, '')}|${comp}` : l.id,
    id: virtual ? null : rowId ?? l.id,
    templateId,
    desc: l.desc,
    tipo: l.tipo,
    cat: l.cat,
    grupo: l.grupo,
    valor: l.valor,
    due,
    paid: virtual ? null : l.pago,
    cliente: l.cliente,
    conta: l.conta,
    cartao: null,
    comp,
    status: statusOf(virtual ? null : l.pago, due, today),
    virtual,
    obs: l.obs,
    history: virtual ? '' : l.history
  };
}

/** Em qual fatura (mês) entra um gasto do cartão. */
function faturaMonth(card: Conta, charge: string): string {
  const fech = card.fech ?? 31;
  const venc = card.venc ?? fech;
  let m = monthOf(charge);
  if (Number(charge.slice(8, 10)) > fech) m = shiftMonth(m, 1);
  if (venc <= fech) m = shiftMonth(m, 1); // vence no mês seguinte ao fechamento
  return m;
}

/** Itens do mês com as faturas dos cartões já montadas. */
export function monthItems(m: string, data: { lancs: Lanc[]; contas: Conta[] }, today: string): Item[] {
  const cards = data.contas.filter((c) => c.tipo === 'Cartão');
  const cardOf = (conta: string) => cards.find((c) => c.nome.toLowerCase() === conta.trim().toLowerCase()) ?? null;
  const own = rawMonth(m, data.lancs, today);
  const out: Item[] = [];
  for (const it of own) {
    const card = it.tipo === 'Saída' ? cardOf(it.conta) : null;
    if (card) continue; // vai para a fatura
    out.push(it);
  }
  // faturas que vencem neste mês: gastos de até 2 meses antes
  for (const card of cards) {
    const charges: Item[] = [];
    for (const mm of [shiftMonth(m, -2), shiftMonth(m, -1), m]) {
      for (const it of rawMonth(mm, data.lancs, today)) {
        if (it.tipo !== 'Saída' || cardOf(it.conta)?.id !== card.id) continue;
        if (faturaMonth(card, it.due) !== m) continue;
        charges.push({ ...it, cartao: card.nome });
      }
    }
    const row = data.lancs.find((l) => l.cat === 'Fatura' && l.origem === card.id.replace(/-/g, '') && l.comp === m);
    if (!charges.length && !row) continue;
    const due = dayIn(m, card.venc ?? 10);
    const total = charges.reduce((s, c) => s + c.valor, 0);
    out.push({
      key: `fatura|${card.id.replace(/-/g, '')}|${m}`,
      id: row?.id ?? null,
      templateId: card.id,
      desc: `Fatura ${card.nome}`,
      tipo: 'Saída',
      cat: 'Fatura',
      grupo: 'Cartão',
      valor: row?.pago ? row.valor : total,
      due,
      paid: row?.pago ?? null,
      cliente: '',
      conta: card.pagoPor || card.nome,
      cartao: card.nome,
      comp: m,
      status: statusOf(row?.pago ?? null, due, today),
      virtual: !row,
      obs: '',
      history: row?.history ?? '',
      charges: charges.sort((a, b) => a.due.localeCompare(b.due))
    });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.tipo.localeCompare(b.tipo));
}

export interface Painel {
  saldo: number;
  porBanco: { conta: Conta; saldo: number }[];
  recebido: number;
  aReceber: number;
  pagas: number;
  aPagar: number;
  resultado: number;
  previsto: number;
  atrasados: Item[];
  proximos: Item[];
  entradasMes: number;
  saidasMes: number;
  porDia: { day: string; entra: number; sai: number }[];
  cartoes: { conta: Conta; fatura: Item | null; proxima: Item | null }[];
  plataformas: { total: number; porCartao: { nome: string; total: number }[] };
}

/** Tudo que o painel precisa para um mês. */
export function painel(m: string, data: { lancs: Lanc[]; contas: Conta[] }, today: string): Painel & { items: Item[] } {
  const items = monthItems(m, data, today);
  const banks = data.contas.filter((c) => c.tipo === 'Banco');
  // saldo por banco: informado + o que entrou/saiu depois da data do saldo (até hoje)
  const past: Item[] = [];
  const firstSaldo = banks.map((b) => b.saldoEm ?? '0000').sort()[0] ?? '0000';
  for (let mm = monthOf(firstSaldo === '0000' ? shiftMonth(monthOf(today), -12) + '-01' : firstSaldo); mm <= monthOf(today); mm = shiftMonth(mm, 1)) {
    past.push(...monthItems(mm, data, today));
  }
  const porBanco = banks.map((b) => {
    let s = b.saldo;
    for (const it of past) {
      if (!it.paid || it.paid > today || (b.saldoEm && it.paid < b.saldoEm)) continue;
      if (it.conta.trim().toLowerCase() !== b.nome.toLowerCase()) continue;
      s += it.tipo === 'Entrada' ? it.valor : -it.valor;
    }
    return { conta: b, saldo: s };
  });
  const semBanco = past.filter((it) => it.paid && it.paid <= today && !banks.some((b) => b.nome.toLowerCase() === it.conta.trim().toLowerCase()) && (!banks.length || it.paid >= firstSaldo));
  const saldo = porBanco.reduce((s, b) => s + b.saldo, 0) + semBanco.reduce((s, it) => s + (it.tipo === 'Entrada' ? it.valor : -it.valor), 0);

  const ent = items.filter((i) => i.tipo === 'Entrada');
  const sai = items.filter((i) => i.tipo === 'Saída');
  const sum = (xs: Item[]) => xs.reduce((s, i) => s + i.valor, 0);
  // atrasados: até 6 meses para trás, mais o mês atual
  const atrasados: Item[] = [];
  const cur = monthOf(today);
  for (let k = 6; k >= 0; k--) atrasados.push(...monthItems(shiftMonth(cur, -k), data, today).filter((i) => i.status === 'atrasado'));
  const proximos = [...monthItems(cur, data, today), ...monthItems(shiftMonth(cur, 1), data, today)]
    .filter((i) => !i.paid && i.due >= today)
    .slice(0, 8);
  const pend = (xs: Item[]) => xs.filter((i) => !i.paid);
  const aReceber = sum(pend(ent));
  const aPagar = sum(pend(sai));
  // resultado do mês por competência: gastos do cartão contam pela data deles, não pela fatura
  const comp = rawMonth(m, data.lancs, today);
  const entradasMes = sum(comp.filter((i) => i.tipo === 'Entrada'));
  const saidasMes = sum(comp.filter((i) => i.tipo === 'Saída'));
  const porDia = new Map<string, { entra: number; sai: number }>();
  for (const it of items) {
    const e = porDia.get(it.due) ?? { entra: 0, sai: 0 };
    if (it.tipo === 'Entrada') e.entra += it.valor;
    else e.sai += it.valor;
    porDia.set(it.due, e);
  }
  const cards = data.contas.filter((c) => c.tipo === 'Cartão');
  const plat = comp.filter((i) => i.cat === 'Plataforma');
  const porCartao = new Map<string, number>();
  for (const p of plat) porCartao.set(p.conta || 'Sem cartão', (porCartao.get(p.conta || 'Sem cartão') ?? 0) + p.valor);
  const prevBase = m === cur ? saldo : saldo; // previsão parte do saldo de hoje
  const ateFim = m >= cur ? items.filter((i) => !i.paid) : [];
  return {
    items,
    saldo,
    porBanco,
    recebido: sum(ent.filter((i) => i.paid)),
    aReceber,
    pagas: sum(sai.filter((i) => i.paid)),
    aPagar,
    resultado: entradasMes - saidasMes,
    previsto: prevBase + sum(ateFim.filter((i) => i.tipo === 'Entrada')) - sum(ateFim.filter((i) => i.tipo === 'Saída')),
    atrasados,
    proximos,
    entradasMes,
    saidasMes,
    porDia: [...porDia.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
    cartoes: cards.map((c) => {
      const fatura = items.find((i) => i.cat === 'Fatura' && i.templateId === c.id) ?? null;
      const prox = monthItems(shiftMonth(m, 1), data, today).find((i) => i.cat === 'Fatura' && i.templateId === c.id) ?? null;
      return { conta: c, fatura, proxima: prox };
    }),
    plataformas: { total: sum(plat), porCartao: [...porCartao.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total) }
  };
}

// ---------- escrita ----------

export interface LancInput {
  desc: string;
  tipo: Tipo;
  cat: Categoria;
  grupo: string;
  valor: number;
  venc: string | null;
  pago: string | null;
  recorrente: boolean;
  dia: number | null;
  inicio: string | null;
  fim: string | null;
  situacao: 'Ativo' | 'Suspenso' | 'Encerrado';
  cliente: string;
  conta: string;
  obs: string;
}

const rich = (v: string) => ({ rich_text: v ? [{ text: { content: v.slice(0, 1900) } }] : [] });
const dt = (v: string | null) => ({ date: v ? { start: v } : null });

function lancProps(x: Partial<LancInput> & { origem?: string; comp?: string }) {
  const p: Record<string, unknown> = {};
  if (x.desc !== undefined) p['Descrição'] = titleProp(x.desc);
  if (x.tipo) p['Tipo'] = { select: { name: x.tipo } };
  if (x.cat) p['Categoria'] = { select: { name: x.cat } };
  if (x.grupo !== undefined) p['Grupo'] = rich(x.grupo);
  if (x.valor !== undefined) p['Valor'] = { number: x.valor };
  if (x.venc !== undefined) p['Vencimento'] = dt(x.venc);
  if (x.pago !== undefined) p['Pago em'] = dt(x.pago);
  if (x.recorrente !== undefined) p['Recorrente'] = { checkbox: x.recorrente };
  if (x.dia !== undefined) p['Dia'] = { number: x.dia };
  if (x.inicio !== undefined) p['Início'] = dt(x.inicio);
  if (x.fim !== undefined) p['Fim'] = dt(x.fim);
  if (x.situacao) p['Situação'] = { select: { name: x.situacao } };
  if (x.cliente !== undefined) p['Cliente'] = rich(x.cliente);
  if (x.conta !== undefined) p['Conta'] = rich(x.conta);
  if (x.obs !== undefined) p['Observação'] = rich(x.obs);
  if (x.origem !== undefined) p['Origem'] = rich(x.origem);
  if (x.comp !== undefined) p['Competência'] = rich(x.comp);
  return p;
}

export async function createLanc(x: Partial<LancInput> & { origem?: string; comp?: string }): Promise<string> {
  const p = await notion().pages.create({ parent: { database_id: env.finDb! }, properties: lancProps(x) as never });
  invalidate('fin:');
  return p.id;
}

export async function updateLanc(id: string, x: Partial<LancInput> & { origem?: string; comp?: string }) {
  await finRow(id, env.finDb!);
  await notion().pages.update({ page_id: id, properties: lancProps(x) as never });
  invalidate('fin:');
}

export async function trashRow(id: string, db: string) {
  await finRow(id, db);
  await notion().pages.update({ page_id: id, archived: true });
  invalidate('fin:');
}

/** Garante que a linha é da tabela do Financeiro (nada fora dela é alterado). */
async function finRow(id: string, db: string): Promise<PageObjectResponse> {
  const p = await notion().pages.retrieve({ page_id: id });
  const parent = isPage(p) && p.parent.type === 'database_id' ? p.parent.database_id.replace(/-/g, '') : '';
  if (!isPage(p) || parent !== db.replace(/-/g, '')) throw Object.assign(new Error('Lançamento não encontrado'), { code: 'object_not_found' });
  return p;
}

export async function getLanc(id: string): Promise<Lanc> {
  return toLanc(await finRow(id, env.finDb!));
}

/** Ocorrência gravada de um modelo num mês (cria se ainda não existe; nunca duplica). */
export async function ensureOccurrence(templateId: string, comp: string, extra: Partial<LancInput>): Promise<string> {
  const t = await getLanc(templateId);
  const key = t.id.replace(/-/g, '');
  const fresh = await queryAll(env.finDb!, {});
  const have = fresh.filter((p) => isPage(p) && !p.archived).map((p) => toLanc(p as PageObjectResponse)).find((l) => l.origem === key && l.comp === comp);
  if (have) {
    await updateLanc(have.id, extra);
    return have.id;
  }
  return createLanc({
    desc: t.desc, tipo: t.tipo, cat: t.cat, grupo: t.grupo, valor: t.valor, venc: dayIn(comp, t.dia ?? 1), pago: null,
    recorrente: false, cliente: t.cliente, conta: t.conta, obs: '', situacao: 'Ativo', ...extra, origem: key, comp
  });
}

/** Fatura do cartão paga (ou desmarcada) no mês. */
export async function payFatura(cardId: string, comp: string, valor: number, pago: string | null, conta: string, nome: string): Promise<string> {
  const key = cardId.replace(/-/g, '');
  const fresh = await queryAll(env.finDb!, {});
  const have = fresh.filter((p) => isPage(p) && !p.archived).map((p) => toLanc(p as PageObjectResponse)).find((l) => l.cat === 'Fatura' && l.origem === key && l.comp === comp);
  if (have) {
    await updateLanc(have.id, { pago, valor });
    return have.id;
  }
  return createLanc({ desc: `Fatura ${nome}`, tipo: 'Saída', cat: 'Fatura', valor, venc: null, pago, conta, origem: key, comp, situacao: 'Ativo', recorrente: false });
}

export interface ContaInput {
  nome: string;
  tipo: 'Banco' | 'Cartão';
  saldo: number;
  saldoEm: string | null;
  fech: number | null;
  venc: number | null;
  pagoPor: string;
  cor: string;
  final: string;
}

function contaProps(x: ContaInput) {
  return {
    Nome: titleProp(x.nome),
    Tipo: { select: { name: x.tipo } },
    Saldo: { number: x.saldo },
    'Saldo em': dt(x.saldoEm),
    Fechamento: { number: x.fech },
    Vencimento: { number: x.venc },
    'Pago por': rich(x.pagoPor),
    Cor: { select: { name: x.cor } },
    Final: rich(x.final)
  };
}

export async function saveConta(id: string | null, x: ContaInput): Promise<string> {
  if (id) {
    await finRow(id, env.finAccountsDb!);
    await notion().pages.update({ page_id: id, properties: contaProps(x) as never });
    invalidate('fin:');
    return id;
  }
  const p = await notion().pages.create({ parent: { database_id: env.finAccountsDb! }, properties: contaProps(x) as never });
  invalidate('fin:');
  return p.id;
}

export const addDaysISO = addDays;

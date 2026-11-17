'use server';

import { requireFinance } from '@/lib/access';
import { parseDay, todayIn } from '@/lib/domain';
import { env } from '@/lib/env';
import { diffLine, logHistory } from '@/lib/historico';
import {
  CATEGORIAS, CORES, createLanc, dayIn, ensureOccurrence, getLanc, lastDay, payFatura, saveConta, shiftMonth, trashRow, updateLanc,
  type Categoria, type ContaInput, type LancInput
} from '@/lib/financeiro';

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
const fail = (e: unknown, what: string): { ok: false; error: string } => {
  console.error(`[financeiro] ${what}`, e);
  return { ok: false, error: 'Não foi possível salvar no Notion. Tente de novo.' };
};

function clean(x: Partial<LancInput>): LancInput | string {
  const desc = String(x.desc ?? '').trim().slice(0, 200);
  if (!desc) return 'Dê um nome ao lançamento.';
  const cat = (CATEGORIAS as readonly string[]).includes(String(x.cat)) ? (x.cat as Categoria) : null;
  if (!cat || cat === 'Fatura') return 'Escolha a categoria.';
  const tipo = ['Mensalidade', 'Freelancer', 'Adicional'].includes(cat) ? 'Entrada' : 'Saída';
  const valor = Math.round(Number(String(x.valor ?? '').toString().replace(',', '.')) * 100) / 100;
  if (!Number.isFinite(valor) || valor <= 0) return 'Informe o valor.';
  const recorrente = ['Mensalidade', 'Despesa fixa', 'Plataforma'].includes(cat) ? !!x.recorrente : false;
  const venc = x.venc ? parseDay(String(x.venc)) : null;
  const inicio = x.inicio ? parseDay(String(x.inicio)) : null;
  const dia = x.dia ? Math.min(31, Math.max(1, Math.round(Number(x.dia)))) : null;
  if (recorrente && !dia) return 'Informe o dia do vencimento.';
  if (!recorrente && !venc) return 'Informe a data de vencimento.';
  const pago = x.pago ? parseDay(String(x.pago)) : null;
  return {
    desc, tipo, cat, valor, recorrente, venc: recorrente ? null : venc, dia: recorrente ? dia : null,
    inicio: recorrente ? inicio ?? todayIn(env.timeZone) : null,
    fim: x.fim ? parseDay(String(x.fim)) : null,
    pago: recorrente ? null : pago,
    situacao: x.situacao === 'Suspenso' || x.situacao === 'Encerrado' ? x.situacao : 'Ativo',
    grupo: String(x.grupo ?? '').trim().slice(0, 80),
    cliente: String(x.cliente ?? '').trim().slice(0, 120),
    conta: String(x.conta ?? '').trim().slice(0, 80),
    obs: String(x.obs ?? '').trim().slice(0, 1500)
  };
}

/** Novo lançamento ou edição. Em recorrente: "one" muda só aquele mês; "future" vale daquele mês em diante. */
export async function saveLancAction(
  id: string | null,
  x: Partial<LancInput>,
  scope?: { templateId: string; comp: string; mode: 'one' | 'future' } | null
): Promise<R<{ id: string }>> {
  const who = await requireFinance();
  try {
    if (scope) {
      const t = await getLanc(scope.templateId);
      const valor = Math.round(Number(String(x.valor ?? t.valor).replace(',', '.')) * 100) / 100;
      if (!Number.isFinite(valor) || valor <= 0) return { ok: false, error: 'Informe o valor.' };
      if (scope.mode === 'one') {
        const venc = x.venc ? parseDay(String(x.venc)) : dayIn(scope.comp, t.dia ?? 1);
        const occ = await ensureOccurrence(t.id, scope.comp, {
          desc: String(x.desc ?? t.desc).trim() || t.desc, valor, venc, conta: String(x.conta ?? t.conta), obs: String(x.obs ?? '')
        });
        await logHistory(occ, `${who.name} editou só ${br(venc)}: ${money(valor)}`);
        return { ok: true, id: occ };
      }
      const v = clean({ ...t, ...x, recorrente: true, cat: t.cat });
      if (typeof v === 'string') return { ok: false, error: v };
      const startComp = t.inicio ? t.inicio.slice(0, 7) : scope.comp;
      if (scope.comp <= startComp) {
        await updateLanc(t.id, v);
        const line = diffLine([['valor', money(t.valor), money(v.valor)], ['dia', String(t.dia ?? ''), String(v.dia ?? '')], ['conta', t.conta, v.conta], ['nome', t.desc, v.desc]]);
        if (line) await logHistory(t.id, `${who.name} editou: ${line}`);
        return { ok: true, id: t.id };
      }
      // daqui em diante: encerra o modelo antigo no mês anterior e cria um novo a partir deste (o passado fica como estava)
      await updateLanc(t.id, { fim: lastDay(shiftMonth(scope.comp, -1)) });
      await logHistory(t.id, `${who.name} encerrou em ${br(lastDay(shiftMonth(scope.comp, -1)))} (novo valor a partir de ${scope.comp.slice(5)}/${scope.comp.slice(0, 4)})`);
      const nid = await createLanc({ ...v, inicio: `${scope.comp}-01`, fim: null });
      await logHistory(nid, `${who.name} criou a partir de ${scope.comp.slice(5)}/${scope.comp.slice(0, 4)}: ${money(v.valor)} todo dia ${v.dia}`);
      return { ok: true, id: nid };
    }
    const v = clean(x);
    if (typeof v === 'string') return { ok: false, error: v };
    if (id) {
      const before = await getLanc(id);
      await updateLanc(id, v);
      const line = diffLine([
        ['nome', before.desc, v.desc], ['valor', money(before.valor), money(v.valor)], ['vencimento', br(before.venc), br(v.venc)],
        ['dia', before.dia ? String(before.dia) : '', v.dia ? String(v.dia) : ''], ['conta', before.conta, v.conta], ['cliente', before.cliente, v.cliente],
        ['situação', before.situacao, v.situacao]
      ]);
      if (line) await logHistory(id, `${who.name} editou: ${line}`);
      return { ok: true, id };
    }
    const nid = await createLanc(v);
    await logHistory(nid, `${who.name} criou: ${money(v.valor)}${v.recorrente ? ` todo dia ${v.dia}` : ` · vence ${br(v.venc)}`}`);
    return { ok: true, id: nid };
  } catch (e) {
    return fail(e, 'salvar');
  }
}

/** Marca como pago/recebido (ou desfaz). Funciona para avulso, ocorrência gerada e fatura. */
export async function payAction(item: { id: string | null; templateId: string | null; comp: string; cat: string; valor: number; conta: string; desc: string }, paid: string | null): Promise<R> {
  const who = await requireFinance();
  const day = paid ? parseDay(paid) : null;
  if (paid && !day) return { ok: false, error: 'Data inválida.' };
  try {
    let rowId: string;
    if (item.cat === 'Fatura' && item.templateId) {
      rowId = await payFatura(item.templateId, item.comp, item.valor, day, item.conta, item.desc.replace(/^Fatura /, ''));
    } else if (item.templateId && !item.id) {
      rowId = await ensureOccurrence(item.templateId, item.comp, { pago: day });
    } else if (item.id) {
      await updateLanc(item.id, { pago: day });
      rowId = item.id;
    } else return { ok: false, error: 'Lançamento não encontrado.' };
    await logHistory(rowId, day ? `${who.name} marcou como ${item.cat === 'Mensalidade' || item.cat === 'Freelancer' || item.cat === 'Adicional' ? 'recebido' : 'pago'} em ${br(day)}` : `${who.name} desfez o pagamento`);
    return { ok: true };
  } catch (e) {
    return fail(e, 'pagar');
  }
}

/** Pula só este mês de um recorrente (sem apagar o modelo). */
export async function skipMonthAction(templateId: string, comp: string): Promise<R> {
  const who = await requireFinance();
  try {
    const id = await ensureOccurrence(templateId, comp, { situacao: 'Suspenso' });
    await logHistory(id, `${who.name} tirou só ${comp.slice(5)}/${comp.slice(0, 4)}`);
    return { ok: true };
  } catch (e) {
    return fail(e, 'pular');
  }
}

/** Suspender, reativar ou encerrar um contrato/despesa recorrente. */
export async function situacaoAction(templateId: string, situacao: 'Ativo' | 'Suspenso' | 'Encerrado'): Promise<R> {
  const who = await requireFinance();
  try {
    const today = todayIn(env.timeZone);
    await updateLanc(templateId, situacao === 'Encerrado' ? { situacao, fim: today } : { situacao });
    await logHistory(templateId, `${who.name} ${situacao === 'Ativo' ? 'reativou' : situacao === 'Suspenso' ? 'suspendeu' : `encerrou em ${br(today)}`}`);
    return { ok: true };
  } catch (e) {
    return fail(e, 'situação');
  }
}

/** Apagar vai para a lixeira do Notion (dá para restaurar por 30 dias). */
export async function deleteLancAction(id: string): Promise<R> {
  await requireFinance();
  try {
    await trashRow(id, env.finDb!);
    return { ok: true };
  } catch (e) {
    return fail(e, 'apagar');
  }
}

export async function saveContaAction(id: string | null, x: Partial<ContaInput>): Promise<R<{ id: string }>> {
  const who = await requireFinance();
  const nome = String(x.nome ?? '').trim().slice(0, 60);
  if (!nome) return { ok: false, error: 'Dê um nome ao banco ou cartão.' };
  const tipo = x.tipo === 'Cartão' ? 'Cartão' : 'Banco';
  const n = (v: unknown) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  const v: ContaInput = {
    nome, tipo,
    saldo: Math.round((n(String(x.saldo ?? '').replace(',', '.')) ?? 0) * 100) / 100,
    saldoEm: x.saldoEm ? parseDay(String(x.saldoEm)) : tipo === 'Banco' ? todayIn(env.timeZone) : null,
    fech: tipo === 'Cartão' ? n(x.fech) : null,
    venc: tipo === 'Cartão' ? n(x.venc) : null,
    pagoPor: tipo === 'Cartão' ? String(x.pagoPor ?? '').trim().slice(0, 60) : '',
    cor: (CORES as readonly string[]).includes(String(x.cor)) ? String(x.cor) : 'Preto',
    final: String(x.final ?? '').replace(/\D/g, '').slice(-4)
  };
  if (tipo === 'Cartão' && (!v.fech || !v.venc)) return { ok: false, error: 'Informe o dia de fechamento e de vencimento da fatura.' };
  try {
    const rid = await saveConta(id ?? null, v);
    await logHistory(rid, `${who.name} ${id ? 'editou' : 'cadastrou'}${tipo === 'Banco' ? ` · saldo ${money(v.saldo)}` : ''}`);
    return { ok: true, id: rid };
  } catch (e) {
    return fail(e, 'conta');
  }
}

export async function deleteContaAction(id: string): Promise<R> {
  await requireFinance();
  try {
    await trashRow(id, env.finAccountsDb!);
    return { ok: true };
  } catch (e) {
    return fail(e, 'apagar conta');
  }
}

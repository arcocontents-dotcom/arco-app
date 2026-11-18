import 'server-only';
import { env } from './env';
import { invalidate, memo } from './cache';
import { checkbox, isPage, notion, queryAll, select, text, titleProp } from './notion';
import { logHistory } from './historico';

// "🧾 Clientes avulsos": freelancers, avulsos e casamentos. O cadastro fica guardado e é
// reaproveitado quando o cliente volta a contratar (a Produção e o Financeiro sugerem o nome).

export const TIPOS_AVULSO = ['Freelancer', 'Avulso', 'Casamento'] as const;
export type TipoAvulso = (typeof TIPOS_AVULSO)[number];

export interface Avulso {
  id: string;
  name: string;
  tipo: TipoAvulso;
  contato: string;
  instagram: string;
  obs: string;
  ativo: boolean;
  history: string;
  created: string;
}

const rt = (v: string) => ({ rich_text: v ? [{ text: { content: v.slice(0, 1900) } }] : [] });
export const avulsosConfigured = () => !!env.avulsosDb;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function listAvulsos(): Promise<Avulso[]> {
  if (!env.avulsosDb) return Promise.resolve([]);
  return memo('avulsos', 30_000, async () => {
    const pages = await queryAll(env.avulsosDb!, { sorts: [{ property: 'Nome', direction: 'ascending' }] });
    return pages
      .filter((p) => isPage(p) && !p.archived)
      .map((p) => {
        const pr = p.properties;
        const t = select(pr['Tipo']);
        return {
          id: p.id,
          name: text(pr['Nome']) || 'Sem nome',
          tipo: (TIPOS_AVULSO as readonly string[]).includes(t ?? '') ? (t as TipoAvulso) : 'Freelancer',
          contato: text(pr['Contato']),
          instagram: text(pr['Instagram']).replace(/^@/, ''),
          obs: text(pr['Observação']),
          ativo: checkbox(pr['Ativo']),
          history: text(pr['Histórico']),
          created: p.created_time.slice(0, 10)
        };
      });
  }).catch((e) => {
    console.error('[avulsos]', e);
    return [] as Avulso[];
  });
}

export async function findAvulso(name: string): Promise<Avulso | null> {
  const n = norm(name);
  return (await listAvulsos()).find((a) => norm(a.name) === n) ?? null;
}

export interface AvulsoInput { name: string; tipo: TipoAvulso; contato: string; instagram: string; obs: string; ativo: boolean }

function props(x: AvulsoInput) {
  return {
    Nome: titleProp(x.name),
    Tipo: { select: { name: x.tipo } },
    Contato: rt(x.contato),
    Instagram: rt(x.instagram.replace(/^@/, '')),
    'Observação': rt(x.obs),
    Ativo: { checkbox: x.ativo }
  };
}

export async function createAvulso(x: AvulsoInput, who: string): Promise<string> {
  if (!env.avulsosDb) throw new Error('Clientes avulsos não configurado');
  const page = await notion().pages.create({ parent: { database_id: env.avulsosDb }, properties: props(x) as never });
  invalidate('avulsos');
  await logHistory(page.id, `${who} cadastrou`);
  return page.id;
}

export async function updateAvulso(id: string, x: AvulsoInput, who: string) {
  const p = await notion().pages.retrieve({ page_id: id });
  if (!isPage(p) || (p.parent.type === 'database_id' ? p.parent.database_id : '').replace(/-/g, '') !== (env.avulsosDb ?? '').replace(/-/g, '')) throw new Error('Cadastro não encontrado');
  await notion().pages.update({ page_id: id, properties: props(x) as never });
  invalidate('avulsos');
  await logHistory(id, `${who} editou o cadastro`);
}

/** Quando a Produção lança um job de "Freelancer · Nome" que ainda não tem cadastro, cria o cadastro (reaproveita depois). */
export async function ensureAvulso(name: string, tipo: TipoAvulso, who: string): Promise<void> {
  if (!env.avulsosDb || !name.trim()) return;
  const have = await findAvulso(name);
  if (have) {
    if (!have.ativo) await notion().pages.update({ page_id: have.id, properties: { Ativo: { checkbox: true } } as never }).then(() => invalidate('avulsos')).catch(() => undefined);
    return;
  }
  await createAvulso({ name: name.trim().slice(0, 120), tipo, contato: '', instagram: '', obs: '', ativo: true }, who).catch((e) => console.error('[avulsos] criar', e));
}

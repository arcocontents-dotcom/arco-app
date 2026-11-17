import 'server-only';
import { env } from './env';
import { notion, text, isPage } from './notion';

// Histórico de alterações gravado na própria linha do Notion (coluna "Histórico"):
// a linha mais nova fica em cima. Ex.: "16/11 21:03 · Lemuel editou: entrega 18/11 → 20/11".

export function stamp(d = new Date()): string {
  const f = new Intl.DateTimeFormat('pt-BR', { timeZone: env.timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return f.replace(',', '');
}

const VERBS = /^(.+?) (lançou|editou|marcou|desmarcou|agendou|criou|tirou|encerrou|suspendeu|reativou|cadastrou|desfez|voltou)\b/;

export async function logHistory(pageId: string, line: string, prop = 'Histórico') {
  try {
    const p = await notion().pages.retrieve({ page_id: pageId });
    const cur = isPage(p) ? text(p.properties[prop]) : '';
    // também vai para o Registro do app (área pela tabela da linha)
    if (isPage(p)) {
      const db = p.parent.type === 'database_id' ? p.parent.database_id.replace(/-/g, '') : '';
      const n = (v: string | null | undefined) => (v || '~').replace(/-/g, '');
      const area = db === n(env.routineDb) ? 'Produção' : db === n(env.shootsDb) ? 'Captação' : db === n(env.finDb) || db === n(env.finAccountsDb) ? 'Financeiro' : null;
      if (area) {
        const titleProp = Object.values(p.properties).find((v) => v.type === 'title');
        const { logActivity } = await import('./registro');
        await logActivity({ area, who: line.match(VERBS)?.[1] ?? '', action: line, item: titleProp ? text(titleProp) : '', itemId: p.id });
      }
    }
    const next = `${stamp()} · ${line}${cur ? `\n${cur}` : ''}`.slice(0, 1990);
    await notion().pages.update({ page_id: pageId, properties: { [prop]: { rich_text: [{ text: { content: next } }] } } as never });
  } catch (e) {
    console.error('[historico]', e);
  }
}

/** "campo a → b" só para o que mudou. */
export function diffLine(pairs: [label: string, before: string | null | undefined, after: string | null | undefined][]): string {
  const out = pairs
    .filter(([, a, b]) => (a ?? '') !== (b ?? ''))
    .map(([l, a, b]) => (a && b ? `${l} ${a} → ${b}` : b ? `${l}: ${b}` : `${l} removido`));
  return out.join(' · ');
}

/** Primeira linha "criou" (de baixo para cima): quem lançou. */
export function creatorOf(history: string): string | null {
  const lines = history.split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^\S+ \S+ · (.+?) (?:lançou|criou|agendou)/);
    if (m) return m[1];
  }
  return null;
}

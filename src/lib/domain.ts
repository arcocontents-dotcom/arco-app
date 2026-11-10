// Regras do negócio, sem dependências de servidor (testáveis).

export const CONTENT_TYPES = ['Reels', 'Post', 'Carrossel', 'Story'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const ITEM_KEYS = ['video', 'capa', 'legenda', 'arte', 'story'] as const;
export type ItemKey = (typeof ITEM_KEYS)[number];

export type ItemStatus = 'Pendente' | 'Aprovado' | 'Ajuste' | 'Reprovado';
export type GeneralStatus = 'Rascunho' | 'Aguardando' | 'Aprovado' | 'Ajustes' | 'Reprovado' | 'Postado';

export const DECISIONS = ['Aprovado', 'Ajuste', 'Reprovado'] as const;
export type DecisionStatus = (typeof DECISIONS)[number];

export const ITEM_LABEL: Record<ItemKey, string> = {
  video: 'Vídeo',
  capa: 'Capa',
  legenda: 'Legenda',
  arte: 'Arte',
  story: 'Story'
};

export const NOTE_MAX = 280;

export function itemsFor(type: ContentType): ItemKey[] {
  switch (type) {
    case 'Reels':
      return ['video', 'capa', 'legenda'];
    case 'Post':
    case 'Carrossel':
      return ['arte', 'legenda'];
    case 'Story':
      return ['story'];
  }
}

export function itemLabel(type: ContentType, key: ItemKey): string {
  if (key === 'arte' && type === 'Carrossel') return 'Carrossel';
  return ITEM_LABEL[key];
}

export interface ItemState {
  status: ItemStatus;
  note: string;
}

export interface Decision {
  status: DecisionStatus;
  note: string;
}

/** Valida as respostas do cliente. Retorna mensagem de erro ou null. */
export function validateDecisions(type: ContentType, decisions: Record<string, unknown>): string | null {
  const keys = itemsFor(type);
  const sent = Object.keys(decisions);
  for (const k of sent) {
    if (!keys.includes(k as ItemKey)) return 'Item inválido para este conteúdo.';
  }
  for (const k of keys) {
    const d = decisions[k] as Decision | undefined;
    if (!d || typeof d !== 'object') return 'Responda todos os itens.';
    if (!(DECISIONS as readonly string[]).includes(d.status)) return 'Resposta inválida.';
    if (typeof d.note !== 'string') return 'Resposta inválida.';
    if (d.note.length > NOTE_MAX) return `O ajuste pode ter no máximo ${NOTE_MAX} caracteres.`;
    if (d.status === 'Ajuste' && !d.note.trim()) return `Escreva o ajuste de ${ITEM_LABEL[k]}.`;
  }
  return null;
}

export function generalStatus(type: ContentType, items: Partial<Record<ItemKey, ItemState>>): GeneralStatus {
  const keys = itemsFor(type);
  const states = keys.map((k) => items[k]?.status ?? 'Pendente');
  if (states.some((s) => s === 'Reprovado')) return 'Reprovado';
  if (states.some((s) => s === 'Ajuste')) return 'Ajustes';
  if (states.every((s) => s === 'Aprovado')) return 'Aprovado';
  return 'Aguardando';
}

export function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

export const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export function parseEmails(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    const e = normalizeEmail(part);
    if (e && EMAIL_RE.test(e) && !out.includes(e)) out.push(e);
  }
  return out;
}

// ---------- datas (sempre como texto YYYY-MM-DD, sem fuso) ----------

export function parseDay(s: string | undefined | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return s;
}

function toUTC(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const dt = toUTC(day);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUTC(dt);
}

/** 0 = segunda ... 6 = domingo */
export function weekdayMon(day: string): number {
  return (toUTC(day).getUTCDay() + 6) % 7;
}

export function startOfWeek(day: string): string {
  return addDays(day, -weekdayMon(day));
}

export function monthGrid(day: string): { day: string; inMonth: boolean }[] {
  const dt = toUTC(day);
  const first = fromUTC(new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1)));
  const start = startOfWeek(first);
  const month = dt.getUTCMonth();
  const cells: { day: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    cells.push({ day: d, inMonth: toUTC(d).getUTCMonth() === month });
  }
  // remove a última semana se ela for inteira do mês seguinte
  if (cells.slice(35).every((c) => !c.inMonth)) cells.length = 35;
  return cells;
}

export function addMonths(day: string, n: number): string {
  const dt = toUTC(day);
  const target = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + n, 1));
  return fromUTC(target);
}

export const WEEKDAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function dayNum(day: string): number {
  return Number(day.slice(8, 10));
}
export function monthIdx(day: string): number {
  return Number(day.slice(5, 7)) - 1;
}
export function yearNum(day: string): number {
  return Number(day.slice(0, 4));
}

export function dayLabel(day: string): string {
  return `${WEEKDAYS_SHORT[weekdayMon(day)]} ${dayNum(day)} ${MONTHS_SHORT[monthIdx(day)]}`;
}

/** Converte um instante ISO para dia e hora locais no fuso informado. */
export function localParts(iso: string, timeZone: string): { day: string; time: string | null } {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { day: iso, time: null };
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return { day: iso.slice(0, 10), time: null };
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const p = Object.fromEntries(fmt.formatToParts(dt).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function todayIn(timeZone: string): string {
  return localParts(new Date().toISOString(), timeZone).day;
}

export function chunk(text: string, size = 1900): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [];
}

import 'server-only';
import { env } from './env';
import { memo } from './cache';
import { addDays, localParts, weekdayMon } from './domain';

// Agenda do Notion Calendar (Google Agenda) por link iCal secreto, só leitura.
// O link fica no secret CAPTACAO_ICS_URL do Cloudflare (pode ter mais de um, separados por espaço).

const CREW = ['Lemuel', 'Marcos', 'Yan', 'Rafa'] as const;

export interface AgendaEvent {
  id: string;
  title: string;
  day: string;
  time: string | null;
  endTime: string | null;
  place: string;
  note: string;
  crew: (typeof CREW)[number][];
}

export const agendaConfigured = () => !!env.captacaoIcs;

type Raw = { name: string; params: Record<string, string>; value: string };

function unfold(ics: string): Raw[] {
  const lines = ics.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out: Raw[] = [];
  for (const l of lines) {
    const i = l.indexOf(':');
    if (i < 0) continue;
    const [name, ...ps] = l.slice(0, i).split(';');
    const params: Record<string, string> = {};
    for (const p of ps) {
      const [k, v] = p.split('=');
      if (k) params[k.toUpperCase()] = (v ?? '').replace(/^"|"$/g, '');
    }
    out.push({ name: name.toUpperCase(), params, value: l.slice(i + 1) });
  }
  return out;
}

const unescape = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();

/** Horário de parede num fuso → instante UTC. */
function wallToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(guess);
    const g = (t: string) => Number(parts.find((x) => x.type === t)?.value);
    const asLocal = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'));
    return new Date(guess.getTime() - (asLocal - guess.getTime()));
  } catch {
    return guess;
  }
}

/** Valor de DTSTART/DTEND → { day, time } no fuso da agência. */
function when(r: Raw | undefined): { day: string; time: string | null; at: number } | null {
  if (!r) return null;
  const m = r.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (!h) {
    const day = `${y}-${mo}-${d}`;
    return { day, time: null, at: Date.UTC(+y, +mo - 1, +d) };
  }
  const inst = z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi)) : wallToUtc(+y, +mo, +d, +h, +mi, r.params.TZID || env.timeZone);
  const lp = localParts(inst.toISOString(), env.timeZone);
  return { day: lp.day, time: lp.time, at: inst.getTime() };
}

const WD = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** Dias em que o evento acontece entre from e to (RRULE simples: DAILY/WEEKLY/MONTHLY, INTERVAL, COUNT, UNTIL, BYDAY). */
function occurrences(start: string, rrule: string | undefined, exdates: Set<string>, from: string, to: string): string[] {
  if (!rrule) return start >= from && start <= to ? [start] : [];
  const r = Object.fromEntries(rrule.split(';').map((p) => p.split('=')));
  const interval = Math.max(1, Number(r.INTERVAL) || 1);
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const until = r.UNTIL ? `${r.UNTIL.slice(0, 4)}-${r.UNTIL.slice(4, 6)}-${r.UNTIL.slice(6, 8)}` : null;
  const byday: number[] = r.BYDAY ? r.BYDAY.split(',').map((x: string) => WD.indexOf(x.slice(-2))).filter((x: number) => x >= 0) : [];
  const out: string[] = [];
  let n = 0;
  const startMon = addDays(start, -weekdayMon(start));
  for (let d = start, guard = 0; guard < 3000; d = addDays(d, 1), guard++) {
    if (until && d > until) break;
    if (d > to || n >= count) break;
    let hit = false;
    if (r.FREQ === 'DAILY') {
      const diff = Math.round((Date.parse(d) - Date.parse(start)) / 864e5);
      hit = diff % interval === 0;
    } else if (r.FREQ === 'WEEKLY') {
      const weeks = Math.floor(Math.round((Date.parse(d) - Date.parse(startMon)) / 864e5) / 7);
      hit = weeks % interval === 0 && (byday.length ? byday.includes(weekdayMon(d)) : weekdayMon(d) === weekdayMon(start));
    } else if (r.FREQ === 'MONTHLY') {
      const months = (Number(d.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(d.slice(5, 7)) - Number(start.slice(5, 7));
      hit = months % interval === 0 && d.slice(8) === start.slice(8);
    } else if (r.FREQ === 'YEARLY') {
      hit = d.slice(5) === start.slice(5);
    } else {
      hit = d === start;
    }
    if (!hit) continue;
    n++;
    if (d >= from && !exdates.has(d)) out.push(d);
  }
  return out;
}

export function parseIcs(ics: string, from: string, to: string): AgendaEvent[] {
  const rows = unfold(ics);
  const events: AgendaEvent[] = [];
  const overridden = new Set<string>();
  let cur: Raw[] | null = null;
  const blocks: Raw[][] = [];
  for (const r of rows) {
    if (r.name === 'BEGIN' && r.value === 'VEVENT') cur = [];
    else if (r.name === 'END' && r.value === 'VEVENT') {
      if (cur) blocks.push(cur);
      cur = null;
    } else if (cur) cur.push(r);
  }
  // ocorrências editadas (RECURRENCE-ID) substituem a original daquele dia
  for (const b of blocks) {
    const uid = b.find((x) => x.name === 'UID')?.value ?? '';
    const rid = when(b.find((x) => x.name === 'RECURRENCE-ID'));
    if (rid) overridden.add(`${uid}|${rid.day}`);
  }
  for (const b of blocks) {
    const get = (n: string) => b.find((x) => x.name === n);
    if ((get('STATUS')?.value ?? '').toUpperCase() === 'CANCELLED') continue;
    const s = when(get('DTSTART'));
    if (!s) continue;
    const e = when(get('DTEND'));
    const uid = get('UID')?.value ?? `${s.at}`;
    const isOverride = !!get('RECURRENCE-ID');
    const ex = new Set<string>();
    for (const x of b.filter((x) => x.name === 'EXDATE')) for (const v of x.value.split(',')) { const w = when({ ...x, value: v }); if (w) ex.add(w.day); }
    const title = unescape(get('SUMMARY')?.value ?? 'Evento');
    const place = unescape(get('LOCATION')?.value ?? '');
    const note = unescape(get('DESCRIPTION')?.value ?? '').replace(/<[^>]+>/g, ' ').slice(0, 400);
    const hay = `${title} ${note} ${b.filter((x) => x.name === 'ATTENDEE').map((x) => `${x.params.CN ?? ''} ${x.value}`).join(' ')}`.toLowerCase();
    const crew = CREW.filter((c) => new RegExp(`\\b${c.toLowerCase()}`, 'i').test(hay) || (c === 'Rafa' && /\brafael\b/.test(hay)));
    // dia todo: DTEND é exclusivo
    const spanDays = !s.time && e ? Math.max(1, Math.round((e.at - s.at) / 864e5)) : 1;
    const days = isOverride ? (s.day >= from && s.day <= to ? [s.day] : []) : occurrences(s.day, get('RRULE')?.value, ex, addDays(from, -(spanDays - 1)), to);
    for (const d0 of days) {
      if (!isOverride && overridden.has(`${uid}|${d0}`)) continue;
      for (let i = 0; i < spanDays; i++) {
        const day = addDays(d0, i);
        if (day < from || day > to) continue;
        events.push({ id: `${uid}|${day}`, title, day, time: s.time, endTime: e?.time ?? null, place, note, crew: [...crew] });
      }
    }
  }
  return events.sort((a, b) => `${a.day}${a.time ?? ''}`.localeCompare(`${b.day}${b.time ?? ''}`));
}

/** Eventos da agenda entre duas datas. Falha em silêncio (devolve null) se o link não responder. */
export function listAgenda(from: string, to: string): Promise<AgendaEvent[] | null> {
  const urls = (env.captacaoIcs ?? '').split(/[\s,]+/).filter((u) => /^https:\/\//.test(u));
  if (!urls.length) return Promise.resolve([]);
  return memo(`prod:agenda:${from}:${to}`, 120_000, async () => {
    const texts = await Promise.all(
      urls.map((u) => fetch(u, { headers: { accept: 'text/calendar' }, signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`ics ${r.status}`)))))
    );
    return texts.flatMap((t) => parseIcs(t, from, to));
  }).catch((e) => {
    console.error('[agenda] ics', e);
    return null;
  });
}

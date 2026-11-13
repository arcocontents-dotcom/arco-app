// Relatório mensal de planejamento (PDF), montado no navegador a partir do Notion.
// Pensado para ser lido no celular, pelo WhatsApp: hierarquia forte, pouco texto por bloco.

import { splitLinks, toEmbed } from './embed';
import { MONTHS, addDays, dayNum, monthGrid, weekdayMon } from './domain';

export interface ReportData {
  client: { name: string; instagram: string; logoUrl: string | null };
  first: string;
  last: string;
  items: {
    title: string;
    day: string | null;
    time: string | null;
    kind: string | null;
    status: string;
    objetivo: string;
    legenda: string;
    referencia: string;
    imagens?: string;
    roteiro: string;
  }[];
  planUrl?: string;
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const C = {
  bg: hex('#F4F2EE'),
  ink: hex('#111111'),
  muted: hex('#7A766F'),
  soft: hex('#3A3834'),
  line: hex('#DDD8D0'),
  white: hex('#FFFFFF')
};
const KIND: Record<string, { label: string; bg: RGB; fg: RGB; dot: RGB }> = {
  reels: { label: 'Reels', bg: hex('#FADEC9'), fg: hex('#8A4A15'), dot: hex('#D9730D') },
  post: { label: 'Post', bg: hex('#D3E5EF'), fg: hex('#183347'), dot: hex('#337EA9') },
  story: { label: 'Story', bg: hex('#FDECC8'), fg: hex('#6B4A12'), dot: hex('#CB912F') },
  fotos: { label: 'Fotos', bg: hex('#E8DEEE'), fg: hex('#412454'), dot: hex('#9065B0') },
  outro: { label: 'Conteúdo', bg: hex('#E9E8E5'), fg: hex('#37352F'), dot: hex('#9B9A97') }
};
const kindOf = (k: string | null) => {
  const s = (k ?? '').toLowerCase();
  if (s.startsWith('reels')) return 'reels';
  if (s.startsWith('post')) return 'post';
  if (s.startsWith('stor')) return 'story';
  if (s.startsWith('foto')) return 'fotos';
  return 'outro';
};
const WD = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
const WD_LONG = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const MON_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Tira emojis e caracteres que a fonte não desenha (no PDF de referência eles viravam lixo). */
const clean = (s: string) =>
  (s ?? '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}\u{E000}-\u{F8FF}]/gu, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

async function b64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  } catch {
    return null;
  }
}

async function dataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => res(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Corta a imagem em círculo (logo do cliente), via canvas. */
async function circle(src: string): Promise<string | null> {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const s = 400;
      const c = document.createElement('canvas');
      c.width = c.height = s;
      const ctx = c.getContext('2d')!;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
      ctx.clip();
      const r = Math.max(s / img.width, s / img.height);
      ctx.drawImage(img, (s - img.width * r) / 2, (s - img.height * r) / 2, img.width * r, img.height * r);
      try {
        res(c.toDataURL('image/png'));
      } catch {
        res(null);
      }
    };
    img.onerror = () => res(null);
    img.src = src;
  });
}

/** Ordem de leitura do planejamento: semana, depois formato (Story, Post, Reels, Fotos), depois data. Vale no PDF e no app. */
export const FORMAT_ORDER = ['story', 'post', 'reels', 'fotos', 'outro'] as const;
export { kindOf as planKind };
export function planOrder<T extends { day: string | null; kind: string | null }>(list: T[]): T[] {
  const wk = (d: string) => addDays(d, -weekdayMon(d));
  const rank = (k: string | null) => FORMAT_ORDER.indexOf(kindOf(k) as (typeof FORMAT_ORDER)[number]);
  return [...list].sort((a, b) => {
    const wa = wk(a.day!), wb = wk(b.day!);
    if (wa !== wb) return wa < wb ? -1 : 1;
    if (rank(a.kind) !== rank(b.kind)) return rank(a.kind) - rank(b.kind);
    return a.day! < b.day! ? -1 : a.day! > b.day! ? 1 : 0;
  });
}

export async function buildPlanningPdf(data: ReportData, appUrl: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const W = 210;
  const H = 297;
  const M = 18;

  // Fontes (Montserrat, a mesma família do app)
  const fonts: [string, string][] = [['M4', 'Montserrat_400Regular'], ['M6', 'Montserrat_600SemiBold'], ['M8', 'Montserrat_800ExtraBold'], ['M9', 'Montserrat_900Black']];
  for (const [id, file] of fonts) {
    const f = await b64(`/fonts/pdf/${file}.ttf`);
    if (f) {
      doc.addFileToVFS(`${file}.ttf`, f);
      doc.addFont(`${file}.ttf`, id, 'normal');
    }
  }
  const font = (id: 'M4' | 'M6' | 'M8' | 'M9', size: number, color: RGB = C.ink) => {
    try { doc.setFont(id, 'normal'); } catch { doc.setFont('helvetica', id === 'M4' ? 'normal' : 'bold'); }
    doc.setFontSize(size).setTextColor(...color);
  };
  const tracked = (txt: string, x: number, y: number, opts: { align?: 'left' | 'right' | 'center' } = {}) => {
    doc.setCharSpace(0.6);
    doc.text(txt, x, y, opts);
    doc.setCharSpace(0);
  };
  const bg = () => {
    doc.setFillColor(...C.bg).rect(0, 0, W, H, 'F');
  };

  const month = MONTHS[Number(data.first.slice(5, 7)) - 1];
  const year = data.first.slice(0, 4);
  const items = planOrder(data.items.filter((i) => i.day)).map((i, n) => ({ ...i, n: n + 1, k: kindOf(i.kind) }));
  const arco = await dataUrl('/logo-black.png');
  const logo = data.client.logoUrl ? await circle(data.client.logoUrl) : null;
  const ig = (data.client.instagram || '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
  const handle = ig ? `@${ig.replace(/^@/, '')}` : '';
  const pages: number[] = [];
  const footer = (page: number, total: number) => {
    font('M6', 7, C.muted);
    tracked(`ARCO CONTENTS  ·  PLANEJAMENTO ${month.toUpperCase()} ${year}`, M, H - 10);
    tracked(`${page}/${total}`, W - M, H - 10, { align: 'right' });
  };

  // ---------- capa: faixa escura + calendário do mês com os temas ----------
  const arcoW = await dataUrl('/logo-white.png');
  bg();
  const BAND = 98;
  doc.setFillColor(...C.ink).rect(0, 0, W, BAND, 'F');
  if (arcoW) doc.addImage(arcoW, 'PNG', M, 15, 30, 11);
  else if (arco) doc.addImage(arco, 'PNG', M, 15, 30, 11);
  font('M6', 7, hex('#9C978F'));
  tracked('PLANEJAMENTO DE CONTEÚDO', W - M, 22, { align: 'right' });

  let size = 58;
  font('M9', size, C.white);
  while (doc.getTextWidth(month.toUpperCase()) > W - 2 * M && size > 28) font('M9', --size, C.white);
  doc.text(month.toUpperCase(), M - 1, 58);
  font('M4', 15, hex('#8E8A83'));
  doc.text(year, M, 68);

  const cy = 76;
  if (logo) doc.addImage(logo, 'PNG', M, cy, 12, 12);
  else {
    doc.setFillColor(...C.white).circle(M + 6, cy + 6, 6, 'F');
    font('M8', 10, C.ink);
    doc.text(data.client.name.charAt(0).toUpperCase(), M + 6, cy + 9.4, { align: 'center' });
  }
  font('M8', 12, C.white);
  doc.text(clean(data.client.name), M + 16, cy + 5);
  font('M4', 8.5, hex('#9C978F'));
  doc.text(
    [handle, `${dayNum(data.first)} ${MON_SHORT[Number(data.first.slice(5, 7)) - 1]} — ${dayNum(data.last)} ${MON_SHORT[Number(data.last.slice(5, 7)) - 1]} ${year}`].filter(Boolean).join('   ·   '),
    M + 16,
    cy + 10.5
  );

  // números do mês
  const count = (k: string) => items.filter((i) => i.k === k).length;
  const stats: [string, number, RGB][] = [
    ['CONTEÚDOS', items.length, C.ink],
    ['REELS', count('reels'), KIND.reels.dot],
    ['POSTS', count('post') + count('fotos'), KIND.post.dot],
    ['STORIES', count('story'), KIND.story.dot]
  ];
  const sy = BAND + 8;
  const sw = (W - 2 * M - 9) / 4;
  stats.forEach(([label, n, color], i) => {
    const x = M + i * (sw + 3);
    doc.setFillColor(...C.white).roundedRect(x, sy, sw, 17, 2, 2, 'F');
    doc.setFillColor(...color).roundedRect(x, sy, 1.4, 17, 0.7, 0.7, 'F');
    font('M9', 17, C.ink);
    doc.text(String(n), x + 6, sy + 11.4);
    font('M6', 6.2, C.muted);
    tracked(label, x + 6 + doc.getTextWidth(String(n)) * (17 / 6.2) + 3, sy + 11);
  });

  // calendário grande: em cada dia, o formato e o tema
  const gy = sy + 29;
  font('M6', 7, C.muted);
  tracked('CALENDÁRIO DO MÊS', M, gy - 4);
  let lx = W - M;
  ([...(['fotos', 'story', 'post', 'reels'] as const)]).forEach((k) => {
    font('M4', 7, C.muted);
    const tw = doc.getTextWidth(KIND[k].label);
    lx -= tw;
    doc.text(KIND[k].label, lx, gy - 4);
    doc.setFillColor(...KIND[k].dot).circle(lx - 2.2, gy - 5.1, 1, 'F');
    lx -= 8;
  });
  const grid = monthGrid(data.first);
  const rows = Math.ceil(grid.length / 7);
  const GAP = 1;
  const cw = (W - 2 * M - GAP * 6) / 7;
  const top = gy + 6;
  const ch = (H - 14 - top - GAP * (rows - 1)) / rows;
  WD.forEach((d, i) => { font('M6', 6.2, C.muted); tracked(d, M + i * (cw + GAP) + 2, gy + 2.6); });
  grid.forEach((cell, i) => {
    const x = M + (i % 7) * (cw + GAP);
    const y0 = top + Math.floor(i / 7) * (ch + GAP);
    if (!cell.inMonth) {
      doc.setFillColor(...hex('#ECE9E4')).roundedRect(x, y0, cw, ch, 1.4, 1.4, 'F');
      return;
    }
    const dayItems = items.filter((it) => it.day === cell.day);
    doc.setFillColor(...C.white).roundedRect(x, y0, cw, ch, 1.4, 1.4, 'F');
    font(dayItems.length ? 'M8' : 'M4', 7.5, dayItems.length ? C.ink : hex('#B3AEA6'));
    doc.text(String(dayNum(cell.day)), x + 2, y0 + 4.6);
    let ey = y0 + 6.6;
    const room = y0 + ch - 1.2;
    dayItems.forEach((it, j) => {
      if (ey > room - 5) return;
      const kd = KIND[it.k];
      font('M6', 5.6, C.ink);
      let lines = doc.splitTextToSize(clean(it.title), cw - 4.4) as string[];
      const maxLines = Math.max(1, Math.min(3, Math.floor((room - ey - 4.6) / 2.5)));
      if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1].replace(/\s+\S*$/, '')}…`];
      const eh = 4.3 + lines.length * 2.45 + 1;
      const left = dayItems.length - j - 1;
      if (ey + eh > room && left >= 0 && j > 0) {
        font('M6', 5.4, C.muted);
        doc.text(`+${dayItems.length - j} conteúdo${dayItems.length - j > 1 ? 's' : ''}`, x + 2, ey + 2.8);
        ey = room;
        return;
      }
      doc.setFillColor(...kd.bg).roundedRect(x + 1, ey, cw - 2, eh, 1, 1, 'F');
      doc.setFillColor(...kd.dot).roundedRect(x + 1, ey, 0.9, eh, 0.45, 0.45, 'F');
      font('M8', 4.8, kd.fg);
      doc.setCharSpace(0.25);
      doc.text((it.kind || kd.label).toUpperCase(), x + 2.8, ey + 3);
      doc.setCharSpace(0);
      font('M6', 5.6, C.ink);
      doc.text(lines, x + 2.8, ey + 5.6, { lineHeightFactor: 1.25 });
      ey += eh + 1;
    });
  });

  // ---------- régua por semana (em sequência, sem página por semana) ----------
  const ORDER = FORMAT_ORDER;
  const PLURAL: Record<string, string> = { story: 'STORY', post: 'POST', reels: 'REELS', fotos: 'FOTOS', outro: 'CONTEÚDO' };
  const weeks: { start: string; end: string; list: typeof items }[] = [];
  for (let d = data.first; d <= data.last; ) {
    const end = addDays(d, 6 - weekdayMon(d)) > data.last ? data.last : addDays(d, 6 - weekdayMon(d));
    weeks.push({ start: d, end, list: items.filter((i) => i.day! >= d && i.day! <= end) });
    d = addDays(end, 1);
  }
  const range = (a: string, b: string) => `${String(dayNum(a)).padStart(2, '0')} – ${String(dayNum(b)).padStart(2, '0')} ${MON_SHORT[Number(b.slice(5, 7)) - 1]}`;
  const CW = W - 2 * M;
  const TX = 21; // coluna do texto dentro do cartão
  const TW = CW - TX - 6;
  const BOTTOM = H - 18;

  let y = 0;
  let contTitle = '';
  const newPage = (cont = '') => {
    doc.addPage();
    bg();
    font('M6', 6.8, C.muted);
    tracked(`RÉGUA DE CONTEÚDO  ·  ${month.toUpperCase()} ${year}`, M, 16);
    font('M6', 6.8, C.muted);
    tracked(clean(data.client.name).toUpperCase(), W - M, 16, { align: 'right' });
    doc.setDrawColor(...C.line).setLineWidth(0.3).line(M, 19.5, W - M, 19.5);
    y = 27;
    if (cont) {
      font('M8', 9, C.muted);
      tracked(cont, M, y + 1);
      y += 7;
    }
  };

  const LBL = 21.5; // coluna dos rótulos (OBJETIVO, LEGENDA) ao lado do texto
  const LH = 3.85;
  const block = (label: string, text: string, maxLines = 12) => {
    font('M4', 8.6, C.soft);
    const t = clean(text ?? '').trim();
    const lines = t ? (doc.splitTextToSize(t, TW - LBL - (label === 'LEGENDA' ? 2.5 : 0)) as string[]).slice(0, maxLines) : [];
    return { label, lines, h: lines.length ? lines.length * LH + 1.8 : 0 };
  };

  type It = (typeof items)[number];
  const measure = (it: It) => {
    font('M8', 10.5);
    const title = doc.splitTextToSize(clean(it.title), TW) as string[];
    const parts = [
      block('OBJETIVO', it.objetivo, 6),
      block('LEGENDA', it.legenda, 12),
      !it.objetivo && !it.legenda ? block('ROTEIRO', it.roteiro, 8) : block('', '')
    ].filter((p) => p.lines.length);
    const refs = splitLinks(it.referencia ?? '').map(toEmbed);
    const nImgs = splitLinks(it.imagens ?? '').length;
    const ref = refs.length > 0 || nImgs > 0;
    const body = parts.reduce((s, p) => s + p.h, 0);
    const h = Math.max(21, 13 + title.length * 4.6 + (body ? body + 1 : 0) + (ref ? 5.5 : 0) + 2.5);
    return { title, parts, refs, nImgs, ref, h };
  };

  const card = (it: It) => {
    const m = measure(it);
    if (y + m.h > BOTTOM) newPage(contTitle);
    const kd = KIND[it.k];
    doc.setFillColor(...C.white).roundedRect(M, y, CW, m.h, 2, 2, 'F');
    doc.setFillColor(...kd.dot).roundedRect(M, y, 1.4, m.h, 0.7, 0.7, 'F');
    // data
    font('M9', 16.5);
    doc.text(String(dayNum(it.day!)).padStart(2, '0'), M + 5.5, y + 10.2);
    font('M6', 6, C.muted);
    tracked(WD[weekdayMon(it.day!)], M + 5.6, y + 14.6);
    if (it.time) { font('M4', 6.8, C.muted); doc.text(it.time, M + 5.6, y + 18.8); }
    doc.setDrawColor(...C.line).line(M + TX - 3.5, y + 4.5, M + TX - 3.5, y + m.h - 4.5);
    // linha de cima: número do post + formato exato
    const kx = M + TX;
    font('M8', 6.6, C.ink);
    const num = `Nº ${String(it.n).padStart(2, '0')}`;
    tracked(num, kx, y + 7.4);
    const nw = doc.getTextWidth(num) + num.length * 0.6 + 3;
    const kl = (it.kind || kd.label).toUpperCase();
    font('M8', 5.8, kd.fg);
    const kw = doc.getTextWidth(kl) + kl.length * 0.45 + 4;
    doc.setFillColor(...kd.bg).roundedRect(kx + nw, y + 4.5, kw, 4.4, 1, 1, 'F');
    tracked(kl, kx + nw + 2, y + 7.6);
    font('M4', 6.8, C.muted);
    doc.text(WD_LONG[weekdayMon(it.day!)], kx + nw + kw + 3, y + 7.5);
    let ty = y + 13.2;
    font('M8', 10.5);
    doc.text(m.title, kx, ty);
    ty += m.title.length * 4.6 + 1;
    for (const p of m.parts) {
      font('M6', 5.6, C.muted);
      tracked(p.label, kx, ty + 0.1);
      const tx = kx + LBL;
      if (p.label === 'LEGENDA') doc.setFillColor(...kd.dot).rect(tx, ty - 2.6, 0.55, p.lines.length * LH, 'F');
      font('M4', 8.6, C.soft);
      doc.text(p.lines, tx + (p.label === 'LEGENDA' ? 2.5 : 0), ty, { lineHeightFactor: 1.27 });
      ty += p.h;
    }
    if (m.ref) {
      ty += 0.6;
      font('M6', 5.6, C.muted);
      tracked(m.refs.length > 1 ? 'REFERÊNCIAS' : m.refs.length ? 'REFERÊNCIA' : 'IMAGENS', kx, ty);
      let rx = kx + LBL;
      font('M6', 7.8, hex('#2F5F8A'));
      m.refs.slice(0, 4).forEach((r) => {
        doc.textWithLink(r.label, rx, ty, { url: r.url });
        rx += doc.getTextWidth(r.label) + 4;
      });
      if (m.refs.length > 4) { font('M4', 7.8, C.muted); doc.text(`+${m.refs.length - 4}`, rx, ty); rx += 7; }
      if (m.nImgs) { font('M4', 7.8, C.muted); doc.text(`${m.refs.length ? '·  ' : ''}${m.nImgs} imagem${m.nImgs > 1 ? 'ns' : ''}`, rx, ty); }
      if (data.planUrl) {
        font('M6', 7.4, C.ink);
        const t = 'Ver no app  ›';
        doc.textWithLink(t, M + CW - 5 - doc.getTextWidth(t), ty, { url: `${data.planUrl}#post-${it.n}` });
      }
    }
    y += m.h + 2.6;
  };

  const groupHead = (k: (typeof ORDER)[number], n: number) => {
    const kd = KIND[k];
    doc.setFillColor(...kd.dot).circle(M + 1.1, y + 1.5, 1.1, 'F');
    font('M8', 7.4, C.ink);
    tracked(PLURAL[k], M + 4, y + 2.6);
    const lw = doc.getTextWidth(PLURAL[k]) + PLURAL[k].length * 0.6;
    font('M6', 7, C.muted);
    doc.text(String(n), M + 4 + lw + 1.5, y + 2.6);
    y += 5.6;
  };

  newPage();
  weeks.forEach((w, wi) => {
    if (!w.list.length) return;
    const groups = ORDER.map((k) => ({ k, list: w.list.filter((i) => i.k === k) })).filter((g) => g.list.length);
    // o cabeçalho da semana nunca fica sozinho no pé da página
    if (y + 22 + measure(groups[0].list[0]).h > BOTTOM && y > 30) newPage();
    else if (y > 30) y += 4;
    font('M9', 18);
    doc.text(`SEMANA ${wi + 1}`, M, y + 6.5);
    const sw2 = doc.getTextWidth(`SEMANA ${wi + 1}`);
    // os formatos da semana: "STORY, POST E REELS"
    const names = groups.map((g) => PLURAL[g.k]);
    const phrase = names.length > 1 ? `${names.slice(0, -1).join(', ')} E ${names[names.length - 1]}` : names[0];
    font('M8', 7.6, C.soft);
    tracked(phrase, M + sw2 + 5, y + 6.2);
    let px = M + sw2 + 5 + doc.getTextWidth(phrase) + phrase.length * 0.6 + 3;
    groups.forEach((g) => {
      doc.setFillColor(...KIND[g.k].dot).circle(px, y + 5.2, 1, 'F');
      px += 3.2;
    });
    font('M6', 7, C.muted);
    tracked(range(w.start, w.end).toUpperCase(), W - M, y + 6.2, { align: 'right' });
    doc.setDrawColor(...C.ink).setLineWidth(0.45).line(M, y + 9.5, W - M, y + 9.5);
    doc.setLineWidth(0.3);
    y += 14;
    contTitle = `SEMANA ${wi + 1}  ·  CONTINUAÇÃO`;
    groups.forEach((g) => {
      if (y + 6 + measure(g.list[0]).h > BOTTOM) newPage(contTitle);
      groupHead(g.k, g.list.length);
      g.list.forEach(card);
    });
  });
  if (!items.length) {
    font('M4', 11, C.muted);
    doc.text('Nenhum conteúdo com data neste mês.', M, y + 8);
  }

  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    footer(p, total);
  }
  doc.setProperties({ title: `Planejamento ${month} ${year} — ${data.client.name}`, author: 'Arco Contents', creator: 'Arco Contents' });
  return doc.output('blob');
}

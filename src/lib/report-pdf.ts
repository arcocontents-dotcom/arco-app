// Relatório mensal de planejamento (PDF), montado no navegador a partir do Notion.
// Pensado para ser lido no celular, pelo WhatsApp: hierarquia forte, pouco texto por bloco.

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
    roteiro: string;
  }[];
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
  const items = data.items.filter((i) => i.day).map((i, n) => ({ ...i, n: n + 1, k: kindOf(i.kind) }));
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

  // ---------- capa ----------
  bg();
  if (arco) doc.addImage(arco, 'PNG', M, 18, 34, 12.5);
  font('M6', 7.5, C.muted);
  tracked('PLANEJAMENTO DE CONTEÚDO', W - M, 26, { align: 'right' });

  // mês gigante, ajustado à largura
  let size = 64;
  font('M9', size);
  while (doc.getTextWidth(month.toUpperCase()) > W - 2 * M && size > 30) font('M9', --size);
  doc.text(month.toUpperCase(), M, 78);
  font('M4', 28, C.muted);
  doc.text(year, M, 92);

  // cliente
  const cy = 118;
  if (logo) doc.addImage(logo, 'PNG', M, cy - 4, 20, 20);
  else {
    doc.setFillColor(...C.ink).circle(M + 10, cy + 6, 10, 'F');
    font('M8', 14, C.white);
    doc.text(data.client.name.charAt(0).toUpperCase(), M + 10, cy + 11, { align: 'center' });
  }
  font('M8', 17);
  doc.text(data.client.name, M + 26, cy + 5);
  font('M4', 10, C.muted);
  doc.text([handle, `${dayNum(data.first)} ${MON_SHORT[Number(data.first.slice(5, 7)) - 1]} — ${dayNum(data.last)} ${MON_SHORT[Number(data.last.slice(5, 7)) - 1]} ${year}`].filter(Boolean).join('   ·   '), M + 26, cy + 12);

  // números
  const count = (k: string) => items.filter((i) => i.k === k).length;
  const stats: [string, number][] = [
    ['CONTEÚDOS', items.length],
    ['REELS', count('reels')],
    ['POSTS', count('post') + count('fotos')],
    ['STORIES', count('story')]
  ];
  const sy = 146;
  const sw = (W - 2 * M - 9) / 4;
  stats.forEach(([label, n], i) => {
    const x = M + i * (sw + 3);
    doc.setFillColor(...(i === 0 ? C.ink : C.white)).roundedRect(x, sy, sw, 30, 2, 2, 'F');
    font('M9', 26, i === 0 ? C.white : C.ink);
    doc.text(String(n), x + 6, sy + 17);
    font('M6', 6.5, i === 0 ? hex('#BDBAB4') : C.muted);
    tracked(label, x + 6, sy + 25);
  });

  // mini calendário com os dias de postagem
  const gy = 190;
  font('M6', 7, C.muted);
  tracked('CALENDÁRIO DO MÊS', M, gy - 6);
  const cw = (W - 2 * M) / 7;
  WD.forEach((d, i) => { font('M6', 6.5, C.muted); tracked(d, M + i * cw + cw / 2, gy, { align: 'center' }); });
  const grid = monthGrid(data.first);
  grid.forEach((cell, i) => {
    const r = Math.floor(i / 7);
    const x = M + (i % 7) * cw;
    const y = gy + 4 + r * 11;
    if (!cell.inMonth) return;
    const dayItems = items.filter((it) => it.day === cell.day);
    if (dayItems.length) {
      doc.setFillColor(...C.ink).roundedRect(x + 1, y, cw - 2, 9.5, 1.5, 1.5, 'F');
      font('M8', 8.5, C.white);
    } else font('M4', 8.5, C.muted);
    doc.text(String(dayNum(cell.day)), x + cw / 2, y + 5.2, { align: 'center' });
    dayItems.slice(0, 4).forEach((it, j) => {
      doc.setFillColor(...KIND[it.k].dot).circle(x + cw / 2 - (Math.min(dayItems.length, 4) - 1) * 1.4 + j * 2.8, y + 7.6, 0.75, 'F');
    });
  });
  // legenda das cores
  const ly = gy + 4 + Math.ceil(grid.length / 7) * 11 + 6;
  let lx = M;
  (['reels', 'post', 'story', 'fotos'] as const).forEach((k) => {
    doc.setFillColor(...KIND[k].dot).circle(lx + 1, ly - 1, 1, 'F');
    font('M4', 7.5, C.muted);
    doc.text(KIND[k].label, lx + 3.5, ly);
    lx += doc.getTextWidth(KIND[k].label) + 10;
  });
  pages.push(doc.getNumberOfPages());

  // ---------- régua por semana ----------
  const weeks: { start: string; end: string; list: typeof items }[] = [];
  for (let d = data.first; d <= data.last; ) {
    const end = addDays(d, 6 - weekdayMon(d)) > data.last ? data.last : addDays(d, 6 - weekdayMon(d));
    weeks.push({ start: d, end, list: items.filter((i) => i.day! >= d && i.day! <= end) });
    d = addDays(end, 1);
  }
  const range = (a: string, b: string) => `${String(dayNum(a)).padStart(2, '0')} – ${String(dayNum(b)).padStart(2, '0')} ${MON_SHORT[Number(b.slice(5, 7)) - 1]}`;
  const CW = W - 2 * M;
  const TX = 30; // coluna do texto dentro do cartão
  const TW = CW - TX - 6;

  let y = 0;
  const newPage = (title: string, sub: string) => {
    doc.addPage();
    bg();
    font('M6', 7, C.muted);
    tracked('RÉGUA DE CONTEÚDO', M, 22);
    font('M9', 24);
    doc.text(title, M, 33);
    font('M4', 10, C.muted);
    doc.text(sub, W - M, 33, { align: 'right' });
    doc.setDrawColor(...C.line).setLineWidth(0.3).line(M, 38, W - M, 38);
    y = 46;
  };

  const block = (label: string, text: string, maxLines = 14) => {
    font('M4', 9.2, C.soft);
    const t = clean(text ?? '').trim();
    const lines = t ? (doc.splitTextToSize(t, TW) as string[]).slice(0, maxLines) : [];
    return { label, lines, h: lines.length ? 5 + lines.length * 4.3 + 2.5 : 0 };
  };

  weeks.forEach((w, wi) => {
    if (!w.list.length) return;
    newPage(`Semana ${wi + 1}`, range(w.start, w.end));
    for (const it of w.list) {
      font('M8', 12);
      const title = doc.splitTextToSize(clean(it.title), TW) as string[];
      const parts = [
        block('OBJETIVO', it.objetivo, 8),
        block('LEGENDA', it.legenda, 14),
        !it.objetivo && !it.legenda ? block('ROTEIRO', it.roteiro, 10) : block('', '')
      ].filter((p) => p.lines.length);
      const ref = clean(it.referencia);
      const h = 12 + title.length * 5.6 + parts.reduce((s, p) => s + p.h, 0) + (ref ? 8 : 0) + 4;
      if (y + h > H - 20) newPage(`Semana ${wi + 1}`, `${range(w.start, w.end)}  ·  continuação`);

      doc.setFillColor(...C.white).roundedRect(M, y, CW, h, 2.5, 2.5, 'F');
      // data
      font('M9', 22);
      doc.text(String(dayNum(it.day!)).padStart(2, '0'), M + 6, y + 13);
      font('M6', 7, C.muted);
      tracked(WD[weekdayMon(it.day!)], M + 6, y + 19);
      if (it.time) { font('M4', 7.5, C.muted); doc.text(it.time, M + 6, y + 24); }
      doc.setDrawColor(...C.line).line(M + TX - 4, y + 6, M + TX - 4, y + h - 6);

      // etiqueta do formato + número
      const kx = M + TX;
      const kd = KIND[it.k];
      const kl = (it.kind || kd.label).toUpperCase();
      font('M6', 6.8, kd.fg);
      const kw = doc.getTextWidth(kl) + kl.length * 0.5 + 5;
      doc.setFillColor(...kd.bg).roundedRect(kx, y + 6, kw, 5.6, 1.2, 1.2, 'F');
      tracked(kl, kx + 2.5, y + 9.9);
      font('M6', 6.8, C.muted);
      tracked(`POST ${String(it.n).padStart(2, '0')}  ·  ${WD_LONG[weekdayMon(it.day!)].toUpperCase()}`, kx + kw + 4, y + 9.9);

      let ty = y + 18;
      font('M8', 12);
      doc.text(title, kx, ty);
      ty += title.length * 5.6;
      for (const p of parts) {
        font('M6', 6.5, C.muted);
        tracked(p.label, kx, ty + 1.5);
        if (p.label === 'LEGENDA') doc.setFillColor(...C.line).rect(kx, ty + 3.3, 0.7, p.lines.length * 4.3, 'F');
        font('M4', 9.2, C.soft);
        doc.text(p.lines, kx + (p.label === 'LEGENDA' ? 3 : 0), ty + 6.5, { lineHeightFactor: 1.32 });
        ty += p.h;
      }
      if (ref) {
        font('M6', 6.5, C.muted);
        tracked('REFERÊNCIA', kx, ty + 1.5);
        font('M4', 8.5, hex('#2F5F8A'));
        const shown = ref.length > 70 ? `${ref.slice(0, 67)}…` : ref;
        if (/^https?:\/\//.test(ref)) doc.textWithLink(shown, kx + 22, ty + 1.5, { url: ref });
        else doc.text(shown, kx + 22, ty + 1.5);
      }
      y += h + 5;
    }
  });

  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    footer(p, total);
  }
  doc.setProperties({ title: `Planejamento ${month} ${year} — ${data.client.name}`, author: 'Arco Contents', creator: 'Arco Contents' });
  return doc.output('blob');
}

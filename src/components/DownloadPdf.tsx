'use client';

import { useState } from 'react';

interface Props {
  month: string;
  client: string;
  type: string;
  posted: number;
  late: number;
  planned: number;
  fileName: string;
}

const OK: [number, number, number] = [63, 107, 78];
const REJ: [number, number, number] = [142, 42, 42];
const LINE: [number, number, number] = [214, 211, 206];
const INK: [number, number, number] = [17, 17, 17];
const MUTED: [number, number, number] = [107, 105, 102];

async function loadImage(src: string): Promise<string | null> {
  try {
    const blob = await (await fetch(src)).blob();
    return await new Promise((r) => {
      const fr = new FileReader();
      fr.onload = () => r(String(fr.result));
      fr.onerror = () => r(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export default function DownloadPdf(p: Props) {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const W = 210;
      const logo = await loadImage('/logo-black.png');
      if (logo) doc.addImage(logo, 'PNG', 20, 18, 38, 14);

      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
      doc.setCharSpace(0.8);
      doc.text('RELATÓRIO DE PRODUÇÃO', W - 20, 27, { align: 'right' });
      doc.setCharSpace(0);

      doc.setFont('helvetica', 'bold').setFontSize(34).setTextColor(...INK);
      doc.text(p.month.toUpperCase(), 20, 62);
      doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(...MUTED);
      doc.text(`${p.client}  ·  ${p.type}`, 20, 71);
      doc.setDrawColor(...LINE).setLineWidth(0.3).line(20, 80, W - 20, 80);

      // anel
      const cx = W / 2, cy = 145, r = 42, lw = 6;
      const pr = p.planned ? p.posted / p.planned : 0;
      const lr = p.planned ? Math.min(p.late / p.planned, 1 - pr) : 0;
      const arc = (from: number, to: number, color: [number, number, number]) => {
        if (to - from <= 0) return;
        const steps = Math.max(2, Math.ceil((to - from) * 180));
        const pts: [number, number][] = [];
        for (let i = 0; i <= steps; i++) {
          const a = -Math.PI / 2 + 2 * Math.PI * (from + ((to - from) * i) / steps);
          pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
        const rel = pts.slice(1).map((pt, i) => [pt[0] - pts[i][0], pt[1] - pts[i][1]]);
        doc.setDrawColor(...color).setLineWidth(lw);
        doc.setLineCap('butt');
        doc.lines(rel, pts[0][0], pts[0][1], [1, 1], 'S', false);
      };
      arc(0, 1, LINE);
      arc(pr, pr + lr, REJ);
      arc(0, pr, OK);

      doc.setFont('helvetica', 'bold').setFontSize(40).setTextColor(...INK);
      doc.text(`${Math.round(pr * 100)}%`, cx, cy + 5, { align: 'center' });
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
      doc.setCharSpace(0.8);
      doc.text('POSTADO', cx, cy + 14, { align: 'center' });
      doc.setCharSpace(0);

      // números
      const col = (x: number, n: number, label: string, color: [number, number, number]) => {
        doc.setFont('helvetica', 'bold').setFontSize(26).setTextColor(...color);
        doc.text(String(n), x, 222, { align: 'center' });
        doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
        doc.setCharSpace(0.8);
        doc.text(label, x, 231, { align: 'center' });
        doc.setCharSpace(0);
      };
      col(W / 2 - 55, p.posted, 'POSTADOS', OK);
      col(W / 2, p.planned, 'PLANEJADOS', INK);
      col(W / 2 + 55, p.late, 'ATRASADOS', p.late ? REJ : INK);

      doc.setDrawColor(...LINE).setLineWidth(0.3).line(20, 270, W - 20, 270);
      doc.setFontSize(8).setTextColor(...MUTED);
      doc.text('Arco Contents', 20, 277);
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, W - 20, 277, { align: 'right' });

      doc.save(p.fileName);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn small" onClick={run} disabled={busy}>
      {busy ? 'Gerando…' : 'Baixar PDF'}
    </button>
  );
}

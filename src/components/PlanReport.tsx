'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { MONTHS } from '@/lib/domain';
import type { ReportData } from '@/lib/report-pdf';

type Done = { url: string | null; file: File; count: number; message: string; blobUrl: string };

/** Gera o PDF do planejamento do mês e prepara o envio pelo WhatsApp. */
export default function PlanReport({ clientId, clientName, month, appUrl }: { clientId: string; clientName: string; month: string; appUrl: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  const [copied, setCopied] = useState(false);
  const monthName = MONTHS[Number(month.slice(5, 7)) - 1];
  const canShareFiles = (f: File) => typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [f] });

  async function generate() {
    setOpen(true);
    setStep('working');
    setMsg('Lendo o Calendário mensal no Notion…');
    try {
      const r = await fetch(`/api/planejamento/relatorio?c=${encodeURIComponent(clientId)}&m=${month}`, { cache: 'no-store' });
      const data = (await r.json()) as ReportData & { error?: string };
      if (!r.ok) throw new Error(data.error ?? 'Não foi possível ler o planejamento.');
      if (!data.items.filter((i) => i.day).length) throw new Error(`Nenhum conteúdo com data em ${monthName.toLowerCase()} ainda. Coloque datas nos cards e tente de novo.`);
      setMsg('Montando o PDF…');
      const { buildPlanningPdf } = await import('@/lib/report-pdf');
      const blob = await buildPlanningPdf(data, appUrl);
      const name = `Planejamento ${monthName} ${month.slice(0, 4)} - ${clientName}.pdf`;
      const file = new File([blob], name, { type: 'application/pdf' });
      setMsg('Guardando o link…');
      let url: string | null = null;
      try {
        const up = await fetch('/api/upload/doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `${clientName} ${monthName} ${month.slice(0, 4)}` }) });
        if (up.ok) {
          const { uploadURL, publicUrl } = (await up.json()) as { uploadURL: string; publicUrl: string };
          const put = await fetch(uploadURL, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: blob });
          if (put.ok) url = publicUrl;
        }
      } catch {
        /* sem link: ainda dá para compartilhar o arquivo */
      }
      const first = clientName.split(/\s+/).filter((w) => !/^(arqui?\.?|dra?\.?)$/i.test(w))[0] ?? clientName;
      const message =
        `Olá, ${first}! Aqui está o planejamento de conteúdo de ${monthName.toLowerCase()}` +
        (url ? `:\n${url}\n\n` : '.\n\n') +
        `São ${data.items.filter((i) => i.day).length} conteúdos. Se estiver tudo certo, é só responder "APROVADO". ` +
        `Quer mudar algo? Responda com o número do post e o ajuste.`;
      setDone({ url, file, count: data.items.length, message, blobUrl: URL.createObjectURL(blob) });
      setStep('done');
    } catch (e) {
      setMsg((e as Error).message);
      setStep('error');
    }
  }

  async function shareFile() {
    if (!done) return;
    try {
      await navigator.share({ files: [done.file], text: done.message });
    } catch {
      /* o usuário cancelou */
    }
  }

  async function copy() {
    if (!done) return;
    try {
      await navigator.clipboard.writeText(done.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <>
      <button type="button" className="btn small" onClick={generate}>
        <Icon name="send" size={15} />Planejamento do mês
      </button>
      {open && createPortal(
        <div className="leave-overlay" role="dialog" aria-modal="true" aria-label="Planejamento do mês" onMouseDown={(e) => e.target === e.currentTarget && step !== 'working' && setOpen(false)}>
          <div className="leave-box report-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="label">{clientName} · {monthName} {month.slice(0, 4)}</span>
              {step !== 'working' && <button type="button" className="icon-btn" aria-label="Fechar" onClick={() => setOpen(false)}><Icon name="x" /></button>}
            </div>
            {step === 'working' && (
              <div className="report-working">
                <span className="spinner" aria-hidden="true" />
                <p style={{ margin: 0 }}>{msg}</p>
              </div>
            )}
            {step === 'error' && <p className="error" role="alert">{msg}</p>}
            {step === 'done' && done && (
              <>
                <div className="report-file">
                  <Icon name="check" size={22} className="ic-play" />
                  <div>
                    <strong>{done.file.name}</strong>
                    <span className="hint">{done.url ? 'PDF pronto e com link para o cliente.' : 'PDF pronto (sem link: envie o arquivo).'}</span>
                  </div>
                </div>
                {canShareFiles(done.file) && (
                  <button type="button" className="btn block" onClick={shareFile}><Icon name="send" size={16} />Enviar PDF no WhatsApp</button>
                )}
                <a className={`btn block${canShareFiles(done.file) ? ' outline' : ''}`} href={`https://wa.me/?text=${encodeURIComponent(done.message)}`} target="_blank" rel="noreferrer">
                  <Icon name="chat" size={16} />{done.url ? 'Mandar link no WhatsApp' : 'Abrir WhatsApp'}
                </a>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <a className="btn outline small" href={done.blobUrl} download={done.file.name}><Icon name="download" size={15} />Baixar PDF</a>
                  <a className="btn outline small" href={done.blobUrl} target="_blank" rel="noreferrer"><Icon name="eye" size={15} />Ver PDF</a>
                  <button type="button" className="btn outline small" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Copiado' : 'Copiar mensagem'}</button>
                </div>
                <pre className="report-msg">{done.message}</pre>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

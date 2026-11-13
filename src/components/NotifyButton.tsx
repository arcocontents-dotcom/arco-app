'use client';

import { useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { notifyContentAction } from '@/app/admin/actions';

type Result = { ok: boolean; text: string; wa: string };

/** Avisa o cliente sobre UM conteúdo: aviso no celular abrindo direto nele, ou WhatsApp com o link. */
export default function NotifyButton({ contentId, title, compact = false }: { contentId: string; title: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Result | null>(null);

  const run = () =>
    start(async () => {
      const r = await notifyContentAction(contentId);
      setRes({
        ok: r.ok,
        text: r.ok ? `Aviso enviado · ${r.sent} aparelho${r.sent > 1 ? 's' : ''}` : (r.error ?? 'Não deu certo.'),
        wa: r.wa
      });
      setTimeout(() => setRes((x) => (x?.ok ? null : x)), 4000);
    });

  const toast =
    res &&
    createPortal(
      <div className={`toast notify-toast ic-inline${res.ok ? '' : ' toast-err'}`} role="status">
        <Icon name={res.ok ? 'check' : 'bell'} size={15} className="ic-play" />
        <span>{res.text}</span>
        {res.wa && (
          <a className="notify-wa" href={res.wa} target="_blank" rel="noreferrer" onClick={() => setRes(null)}>
            <Icon name="chat" size={14} />{res.ok ? 'WhatsApp também' : 'Mandar no WhatsApp'}
          </a>
        )}
        <button type="button" className="notify-x" aria-label="Fechar aviso" onClick={() => setRes(null)}><Icon name="x" size={13} /></button>
      </div>,
      document.body
    );

  if (compact) {
    return (
      <>
        <button
          type="button"
          className={`card-notify${pending ? ' busy' : ''}`}
          onClick={run}
          disabled={pending}
          aria-label={`Avisar cliente sobre ${title}`}
          title="Avisar cliente sobre este conteúdo"
        >
          <Icon name="bell" size={14} className={pending ? 'ic-play' : ''} />
        </button>
        {toast}
      </>
    );
  }

  return (
    <>
      <button type="button" className="btn outline small" disabled={pending} onClick={run} title={`Avisar o cliente sobre "${title}"`}>
        <Icon name="bell" size={16} className={pending ? 'ic-play' : ''} />{pending ? 'Avisando…' : 'Avisar cliente'}
      </button>
      {toast}
    </>
  );
}

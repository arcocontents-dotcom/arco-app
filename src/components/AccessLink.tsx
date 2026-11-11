'use client';

import Icon from './Icon';
import { useState, useTransition } from 'react';
import { accessLinkAction, type LinkKind } from '@/app/admin/actions';

/** Mostra um link de acesso pronto, com copiar e enviar pelo WhatsApp. */
const KIND_LABEL: Record<LinkKind, string> = { mes: 'Calendário do mês', semana: 'Semana atual' };

export function LinkBox({ link, name, kind = 'mes' }: { link: string; name?: string; kind?: LinkKind }) {
  const [copied, setCopied] = useState(false);
  const msg = `Olá${name ? `, ${name}` : ''}! Este é o seu acesso à área de aprovação da Arco Contents (${KIND_LABEL[kind].toLowerCase()}): ${link}\n\nToque em Entrar uma única vez. Depois, o acesso fica salvo no seu celular e você não precisa entrar de novo.`;
  return (
    <div className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, background: '#fff', border: '1px solid var(--line)' }}>
      <span className="label">{KIND_LABEL[kind]} · o primeiro acesso vale 24 horas</span>
      <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ fontSize: 12 }} aria-label="Link de acesso" />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn small"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              /* o campo acima continua selecionável */
            }
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={15} className={copied ? 'ic-play' : ''} />{copied ? 'Copiado' : 'Copiar link'}
        </button>
        <a className="btn small outline" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer">
          <Icon name="chat" size={15} />Enviar no WhatsApp
        </a>
      </div>
      <span className="hint">Mande só para essa pessoa: quem abrir o link entra como ela.</span>
    </div>
  );
}

export default function AccessLink({ clientId, email }: { clientId: string; email: string }) {
  const [link, setLink] = useState<{ url: string; kind: LinkKind } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const gen = (kind: LinkKind) =>
    start(async () => {
      setError(null);
      const r = await accessLinkAction(clientId, email, kind);
      if (r.ok) setLink({ url: r.link, kind });
      else setError(r.error);
    });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <button type="button" className="link-btn" style={{ minHeight: 32 }} disabled={pending} onClick={() => gen('mes')}>
          Link do mês
        </button>
        <button type="button" className="link-btn" style={{ minHeight: 32 }} disabled={pending} onClick={() => gen('semana')}>
          Link da semana atual
        </button>
      </div>
      {error && <span className="error">{error}</span>}
      {link && <LinkBox key={link.url} link={link.url} kind={link.kind} />}
    </div>
  );
}

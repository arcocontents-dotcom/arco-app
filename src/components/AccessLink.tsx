'use client';

import Icon from './Icon';
import { useState, useTransition } from 'react';
import { accessLinkAction } from '@/app/admin/actions';

/** Mostra um link de acesso pronto, com copiar e enviar pelo WhatsApp. */
export function LinkBox({ link, name }: { link: string; name?: string }) {
  const [copied, setCopied] = useState(false);
  const msg = `Olá${name ? `, ${name}` : ''}! Este é o seu acesso à área de aprovação da Arco Contents: ${link}\n\nToque em Entrar uma única vez. Depois, o acesso fica salvo no seu celular e você não precisa entrar de novo.`;
  return (
    <div className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, background: '#fff', border: '1px solid var(--line)' }}>
      <span className="label">Acesso ao calendário · o primeiro acesso vale 24 horas</span>
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
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const gen = () =>
    start(async () => {
      setError(null);
      const r = await accessLinkAction(clientId, email);
      if (r.ok) setLink(r.link);
      else setError(r.error);
    });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <button type="button" className="link-btn ic-inline" style={{ minHeight: 32, alignSelf: 'flex-start' }} disabled={pending} onClick={gen}>
        <Icon name="link" size={14} />{pending ? 'Gerando…' : 'Gerar link de acesso'}
      </button>
      {error && <span className="error">{error}</span>}
      {link && <LinkBox key={link} link={link} />}
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { accessLinkAction } from '@/app/admin/actions';

/** Mostra um link de acesso pronto, com copiar e enviar pelo WhatsApp. */
export function LinkBox({ link, name }: { link: string; name?: string }) {
  const [copied, setCopied] = useState(false);
  const msg = `Olá${name ? `, ${name}` : ''}! Este é o seu acesso à área de aprovação da Arco Contents: ${link}\n\nO link vale por 24 horas. Depois de entrar, o acesso fica salvo no seu celular por 30 dias.`;
  return (
    <div className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, background: '#fff', border: '1px solid var(--line)' }}>
      <span className="label">Link de acesso · vale 24 horas</span>
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
          {copied ? 'Copiado' : 'Copiar link'}
        </button>
        <a className="btn small outline" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer">
          Enviar no WhatsApp
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {!link && (
        <button
          type="button"
          className="link-btn"
          style={{ alignSelf: 'flex-start', minHeight: 32 }}
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await accessLinkAction(clientId, email);
              if (r.ok) setLink(r.link);
              else setError(r.error);
            })
          }
        >
          {pending ? 'Gerando…' : 'Gerar link de acesso'}
        </button>
      )}
      {error && <span className="error">{error}</span>}
      {link && <LinkBox link={link} />}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

/** Imagens do post em fileira; toque abre em tela cheia. */
export default function ImageStrip({ urls }: { urls: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className="img-strip">
        {urls.map((u, i) => (
          <button key={u} type="button" onClick={() => setOpen(i)} aria-label={`Ampliar imagem ${i + 1}`}>
            <img src={u} alt={`Imagem ${i + 1}`} loading="lazy" />
          </button>
        ))}
      </div>
      {open !== null &&
        createPortal(
          <div className="lightbox" role="dialog" aria-modal="true" aria-label="Imagem" onClick={() => setOpen(null)}>
            <img src={urls[open]} alt={`Imagem ${open + 1}`} onClick={(e) => e.stopPropagation()} />
            {urls.length > 1 && (
              <>
                <button type="button" className="lb-nav prev" aria-label="Anterior" onClick={(e) => { e.stopPropagation(); setOpen((open - 1 + urls.length) % urls.length); }}><Icon name="left" /></button>
                <button type="button" className="lb-nav next" aria-label="Próxima" onClick={(e) => { e.stopPropagation(); setOpen((open + 1) % urls.length); }}><Icon name="right" /></button>
              </>
            )}
            <button type="button" className="lb-close" aria-label="Fechar" onClick={() => setOpen(null)}><Icon name="x" /></button>
          </div>,
          document.body
        )}
    </>
  );
}

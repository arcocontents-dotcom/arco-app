'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, XIcon } from './icons';

/** Imagem grande que abre em tela cheia ao tocar (funciona também no iPhone). */
export default function Lightbox({
  images, index, onClose, title
}: { images: string[]; index: number; onClose: () => void; title: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(index);
  useEffect(() => {
    const el = track.current;
    if (el) el.scrollTo({ left: index * el.clientWidth });
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(i + 1);
      if (e.key === 'ArrowLeft') go(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const go = (j: number) => {
    const el = track.current;
    const k = Math.max(0, Math.min(images.length - 1, j));
    if (el) el.scrollTo({ left: k * el.clientWidth, behavior: 'smooth' });
    setI(k);
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="lightbox">
      <div
        className="track lb-track"
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          const k = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (k !== i) setI(k);
        }}
      >
        {images.map((src, k) => (
          <div key={src + k} className="lb-slide" onClick={onClose}>
            <img src={src} alt={`${title} ${images.length > 1 ? `— ${k + 1} de ${images.length}` : ''}`} onClick={(e) => e.stopPropagation()} />
          </div>
        ))}
      </div>
      <button type="button" className="lb-close" onClick={onClose} aria-label="Fechar"><XIcon size={22} color="#fff" /></button>
      {images.length > 1 && (
        <>
          <span className="lb-count">{i + 1}/{images.length}</span>
          <button type="button" className="arrow prev" onClick={() => go(i - 1)} hidden={i === 0} aria-label="Anterior"><ArrowLeft /></button>
          <button type="button" className="arrow next" onClick={() => go(i + 1)} hidden={i === images.length - 1} aria-label="Próxima"><ArrowRight /></button>
        </>
      )}
    </div>
  );
}

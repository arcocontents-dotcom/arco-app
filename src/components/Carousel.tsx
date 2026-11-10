'use client';

import { useCallback, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from './icons';

export default function Carousel({ images, title }: { images: string[]; title: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const n = images.length;

  const go = useCallback((j: number) => {
    const el = track.current;
    if (!el) return;
    const k = Math.max(0, Math.min(n - 1, j));
    el.scrollTo({ left: k * el.clientWidth, behavior: 'smooth' });
    setI(k);
  }, [n]);

  if (!n) {
    return <div className="frame-45" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="label">Sem arte ainda</span></div>;
  }

  return (
    <div>
      <div className="carousel" aria-roledescription="carrossel" aria-label={title}>
        <div
          className="track"
          ref={track}
          onScroll={(e) => {
            const el = e.currentTarget;
            const k = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
            if (k !== i) setI(k);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') go(i + 1);
            if (e.key === 'ArrowLeft') go(i - 1);
          }}
          tabIndex={0}
        >
          {images.map((src, k) => (
            <div key={src + k} className="frame-45" role="group" aria-label={`Arte ${k + 1} de ${n}`}>
              <img src={src} alt={`${title} — arte ${k + 1}`} loading={k === 0 ? 'eager' : 'lazy'} decoding="async" />
            </div>
          ))}
        </div>
        {n > 1 && <span className="counter">{i + 1}/{n}</span>}
        {n > 1 && (
          <>
            <button type="button" className="arrow prev" onClick={() => go(i - 1)} aria-label="Arte anterior" hidden={i === 0}><ArrowLeft /></button>
            <button type="button" className="arrow next" onClick={() => go(i + 1)} aria-label="Próxima arte" hidden={i === n - 1}><ArrowRight /></button>
          </>
        )}
      </div>
      {n > 1 && (
        <>
          <div className="dots-nav">
            {images.map((_, k) => (
              <button key={k} type="button" onClick={() => go(k)} aria-label={`Ir para a arte ${k + 1}`} aria-current={k === i}>
                <i />
              </button>
            ))}
          </div>
          <p className="label" style={{ textAlign: 'center' }}>Deslize para o lado</p>
        </>
      )}
    </div>
  );
}

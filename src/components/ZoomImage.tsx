'use client';

import { useState } from 'react';
import Lightbox from './Lightbox';

export default function ZoomImage({ src, alt, ratio = '9 / 16' }: { src: string; alt: string; ratio?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="zoomable" style={{ aspectRatio: ratio }} onClick={() => setOpen(true)} aria-label={`Ampliar ${alt}`}>
        <img src={src} alt={alt} decoding="async" />
        <span className="max-hint">Toque para ampliar</span>
      </button>
      {open && <Lightbox images={[src]} index={0} title={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

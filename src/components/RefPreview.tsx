'use client';

import { useState } from 'react';
import Icon from './Icon';
import { toEmbed } from '@/lib/embed';

/** Mostra a referência tocando dentro do site (Instagram, TikTok, YouTube, Pinterest). */
export default function RefPreview({ url, start = false }: { url: string; start?: boolean }) {
  const e = toEmbed(url);
  const [on, setOn] = useState(start);
  const [loaded, setLoaded] = useState(false);

  if (!e.src) {
    return (
      <a className="ref-link" href={e.url} target="_blank" rel="noreferrer">
        <Icon name="link" size={16} />
        <span><strong>{e.label}</strong><small>{e.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70)}</small></span>
        <Icon name="external" size={14} />
      </a>
    );
  }

  return (
    <figure className={`ref ref-${e.kind}${e.vertical ? ' tall' : ''}`}>
      {on ? (
        <div className="ref-frame">
          {!loaded && <span className="ref-loading"><span className="spinner" aria-hidden="true" />Carregando {e.label}…</span>}
          <iframe
            src={e.src}
            title={`Referência do ${e.label}`}
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
            onLoad={() => setLoaded(true)}
          />
        </div>
      ) : (
        <button type="button" className="ref-cover" onClick={() => setOn(true)} aria-label={`Ver referência do ${e.label}`}>
          <span className={`ref-badge rb-${e.kind}`}>{e.label}</span>
          <span className="ref-play"><Icon name="video" size={22} /></span>
          <small>Toque para ver aqui</small>
        </button>
      )}
      <figcaption>
        <span className={`ref-dot rb-${e.kind}`} />{e.label}
        <a href={e.url} target="_blank" rel="noreferrer" className="ref-out">Abrir no {e.label} <Icon name="external" size={12} /></a>
      </figcaption>
    </figure>
  );
}

'use client';

import { useState } from 'react';
import { PlayIcon } from './icons';

/**
 * Mostra só a capa (leve). O vídeo só começa a baixar quando a pessoa toca no play.
 * Aceita vídeo do Stream (embedUrl) ou arquivo direto (fileUrl).
 */
export default function VideoPlayer({
  embedUrl, fileUrl, poster, label
}: { embedUrl?: string | null; fileUrl?: string | null; poster: string | null; label: string }) {
  const [on, setOn] = useState(false);
  return (
    <div className="frame-916" style={poster ? { backgroundImage: `url(${poster})` } : undefined}>
      {on && embedUrl && (
        <iframe src={embedUrl} title={label} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
      )}
      {on && !embedUrl && fileUrl && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={fileUrl} poster={poster ?? undefined} controls autoPlay playsInline preload="auto" style={{ objectFit: 'contain', background: '#000' }} />
      )}
      {!on && !poster && fileUrl && (
        <video src={`${fileUrl}#t=0.5`} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} />
      )}
      {!on && (
        <button type="button" className="play" onClick={() => setOn(true)} aria-label={`Reproduzir ${label}`}>
          <span><PlayIcon size={22} /></span>
        </button>
      )}
    </div>
  );
}

'use client';

import { useRef, useState } from 'react';
import { PlayIcon } from './icons';

type FsVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

/**
 * Vídeo grande. No primeiro toque já abre em tela cheia e começa a tocar.
 * Aceita arquivo direto (fileUrl) ou vídeo do Stream (embedUrl).
 */
export default function VideoPlayer({
  embedUrl, fileUrl, poster, label
}: { embedUrl?: string | null; fileUrl?: string | null; poster: string | null; label: string }) {
  const [on, setOn] = useState(false);
  const ref = useRef<FsVideo>(null);

  function start() {
    setOn(true);
    const v = ref.current;
    if (!v) return;
    v.controls = true;
    void v.play().catch(() => undefined);
    // Precisa acontecer dentro do toque, senão o navegador bloqueia a tela cheia.
    if (v.requestFullscreen) v.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    else v.webkitEnterFullscreen?.();
  }

  if (embedUrl) {
    return (
      <div className="frame-916" style={poster ? { backgroundImage: `url(${poster})` } : undefined}>
        {on ? (
          <iframe src={embedUrl} title={label} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        ) : (
          <button type="button" className="play" onClick={() => setOn(true)} aria-label={`Reproduzir ${label}`}>
            <span><PlayIcon size={26} /></span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="frame-916" style={poster ? { backgroundImage: `url(${poster})` } : undefined}>
      <video
        ref={ref}
        src={fileUrl ?? undefined}
        poster={poster ?? undefined}
        playsInline
        preload="metadata"
        controls={on}
        style={{ objectFit: 'contain', background: on ? '#000' : 'transparent' }}
      />
      {!on && (
        <button type="button" className="play" onClick={start} aria-label={`Reproduzir ${label} em tela cheia`}>
          <span><PlayIcon size={26} /></span>
          <em className="max-hint">Toque para ver em tela cheia</em>
        </button>
      )}
    </div>
  );
}

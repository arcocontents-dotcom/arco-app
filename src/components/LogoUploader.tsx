'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setClientLogoAction } from '@/app/admin/actions';
import { uploadImage, useUploader } from './upload';

export default function LogoUploader({ clientId, logoUrl }: { clientId: string; logoUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const up = useUploader();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(logoUrl);

  function save(url: string | null) {
    setError(null);
    start(async () => {
      const r = await setClientLogoAction(clientId, url);
      if (!r.ok) return setError(r.error);
      setCurrent(url);
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <div className="avatar" style={{ width: 72, height: 72 }}>
        <span style={{ background: current ? '#fff' : 'var(--ink)', overflow: 'hidden' }}>
          {current ? (
            <img src={current} alt="Logo do cliente" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <img src="/icon-white.png" alt="" style={{ width: 30, height: 'auto' }} />
          )}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn small" disabled={pending || up.progress !== null} onClick={() => input.current?.click()}>
            {current ? 'Trocar logo' : 'Enviar logo'}
          </button>
          {current && (
            <button type="button" className="link-btn" disabled={pending} onClick={() => save(null)}>Remover</button>
          )}
        </div>
        {up.progress !== null && <span className="hint">Enviando… {Math.round(up.progress * 100)}%</span>}
        {(error || up.error) && <span className="error" role="alert">{error ?? up.error}</span>}
        <span className="hint">Aparece redonda, como a foto do Instagram. Use uma imagem quadrada.</span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const u = await up.run((p) => uploadImage(f, p));
          if (u) save(u);
        }}
      />
    </div>
  );
}

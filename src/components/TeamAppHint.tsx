'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';

/** No link da equipe: dica para instalar como app no celular e atualização automática das tarefas. */
export default function TeamAppHint() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try { dismissed = localStorage.getItem('arco-team-hint') === '1'; } catch {}
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setShow(!standalone && !dismissed);
    // sempre em dia: atualiza ao voltar para o app e a cada 2 minutos
    const refresh = () => document.visibilityState === 'visible' && router.refresh();
    document.addEventListener('visibilitychange', refresh);
    const t = setInterval(refresh, 120_000);
    return () => { document.removeEventListener('visibilitychange', refresh); clearInterval(t); };
  }, [router]);

  if (!show) return null;
  const close = () => {
    try { localStorage.setItem('arco-team-hint', '1'); } catch {}
    setShow(false);
  };
  return (
    <aside className="team-hint" role="note">
      <img src="/icon-192.png" alt="" width={36} height={36} />
      <div>
        <strong>Instale o app no celular</strong>
        <p>
          {ios ? (
            <>No Safari, toque em <b>Compartilhar</b> <Icon name="send" size={11} /> e depois em <b>Adicionar à Tela de Início</b>.</>
          ) : (
            <>No Chrome, toque no menu <b>⋮</b> e depois em <b>Instalar app</b> (ou Adicionar à tela inicial).</>
          )}
        </p>
      </div>
      <button type="button" className="icon-btn" aria-label="Fechar dica" onClick={close}><Icon name="x" size={14} /></button>
    </aside>
  );
}

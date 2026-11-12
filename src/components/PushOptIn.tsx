'use client';

import { useEffect, useState } from 'react';
import Icon from './Icon';

type State = 'loading' | 'unsupported' | 'ios-install' | 'off' | 'on' | 'denied' | 'hidden' | 'working';

const b64 = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const KEY = 'arco-push-dispensado';

/** Card discreto para o cliente receber aviso no celular quando tiver conteúdo novo. */
export default function PushOptIn({ clientId, vapidKey }: { clientId: string; vapidKey: string }) {
  const [state, setState] = useState<State>('loading');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(KEY) === '1'; } catch {}
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState(ios && !standalone ? (dismissed ? 'hidden' : 'ios-install') : 'unsupported');
      return;
    }
    (async () => {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      reg.active?.postMessage({ type: 'home', url: `/c/${clientId}` });
      const sub = await reg.pushManager.getSubscription();
      if (sub) setState('on');
      else if (Notification.permission === 'denied') setState(dismissed ? 'hidden' : 'denied');
      else setState(dismissed ? 'hidden' : 'off');
    })().catch(() => setState('unsupported'));
  }, [clientId]);

  async function enable() {
    setState('working');
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return setState('denied');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(vapidKey) }));
      const r = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, endpoint: sub.endpoint }) });
      if (!r.ok) throw new Error();
      setState('on');
    } catch {
      setMsg('Não deu para ativar agora. Tente de novo.');
      setState('off');
    }
  }

  async function disable() {
    setState('working');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
    } catch {}
    setState('off');
  }

  const dismiss = () => {
    try { localStorage.setItem(KEY, '1'); } catch {}
    setState('hidden');
  };

  if (state === 'loading' || state === 'unsupported' || state === 'hidden') return null;

  if (state === 'on') {
    return (
      <p className="push-on rise">
        <Icon name="check" size={14} className="ic-play" />Avisos ativados neste aparelho
        <button type="button" className="link-btn" onClick={disable}>Desativar</button>
      </p>
    );
  }

  return (
    <div className="push-card rise" role="region" aria-label="Avisos no celular">
      <span className="push-ic"><Icon name="phone" size={22} className="ic-play" /></span>
      <div className="push-text">
        <strong>Receba um aviso quando tiver conteúdo novo</strong>
        {state === 'ios-install' ? (
          <span>No iPhone: toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b> e abra o app por lá. Depois ative os avisos.</span>
        ) : state === 'denied' ? (
          <span>Os avisos estão bloqueados. Libere nas configurações do navegador para este site.</span>
        ) : (
          <span>Um toque e pronto. Você pode desligar quando quiser.</span>
        )}
        {msg && <span className="error">{msg}</span>}
      </div>
      <div className="push-actions">
        {(state === 'off' || state === 'working') && (
          <button type="button" className="btn small" onClick={enable} disabled={state === 'working'}>
            <Icon name="bell" size={15} />{state === 'working' ? 'Ativando…' : 'Ativar avisos'}
          </button>
        )}
        <button type="button" className="link-btn" onClick={dismiss}>Agora não</button>
      </div>
    </div>
  );
}

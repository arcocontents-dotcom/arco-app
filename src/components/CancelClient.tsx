'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setClientCancelledAction } from '@/app/admin/actions';

export default function CancelClient({ clientId, name, cancelled }: { clientId: string; name: string; cancelled: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (v: boolean) =>
    start(async () => {
      setError(null);
      const r = await setClientCancelledAction(clientId, v);
      if (!r.ok) return setError(r.error);
      setConfirm(false);
      router.push(v ? '/admin' : `/admin/clientes/${clientId}`);
      router.refresh();
    });

  if (cancelled) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="status s-Reprovado">Removido</span>
        <p className="hint">Ninguém deste cliente consegue entrar. Os conteúdos continuam guardados no Notion.</p>
        <button type="button" className="btn small outline" style={{ alignSelf: 'flex-start' }} disabled={pending} onClick={() => run(false)}>
          Reativar cliente
        </button>
        {error && <span className="error">{error}</span>}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="hint">Para clientes que cancelaram: some do painel e todos os e-mails dele perdem o acesso na hora. Nada é apagado do Notion, e dá para reativar depois.</p>
      {!confirm ? (
        <button type="button" className="btn small outline" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(true)}>
          Remover
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="hint">Remover {name}?</span>
          <button type="button" className="btn small" disabled={pending} onClick={() => run(true)}>{pending ? 'Removendo…' : 'Sim, remover'}</button>
          <button type="button" className="link-btn" onClick={() => setConfirm(false)}>Cancelar</button>
        </div>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import Icon from './Icon';
import { notifyClientAction } from '@/app/admin/actions';

export default function NotifyButton({ clientId, name }: { clientId: string; name: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn outline small"
        disabled={pending}
        title={`Mandar aviso no celular de ${name}`}
        onClick={() =>
          start(async () => {
            const r = await notifyClientAction(clientId);
            setMsg(r.ok ? { ok: true, text: `Aviso enviado · ${r.sent} aparelho${r.sent > 1 ? 's' : ''}` } : { ok: false, text: r.error });
            setTimeout(() => setMsg(null), 4000);
          })
        }
      >
        <Icon name="bell" size={16} className={pending ? 'ic-play' : ''} />{pending ? 'Avisando…' : 'Avisar cliente'}
      </button>
      {msg && <p className={`toast ic-inline${msg.ok ? '' : ' toast-err'}`} role="status"><Icon name={msg.ok ? 'check' : 'x'} size={15} className="ic-play" />{msg.text}</p>}
    </>
  );
}

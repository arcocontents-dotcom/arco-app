'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setClientPausedAction } from '@/app/admin/clientes/pausa-actions';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mes = (d: string) => `${MESES[Number(d.slice(5, 7)) - 1]}`;

/** Canto da página do cliente: Ativo / Pausado. Só quem tem permissão consegue trocar. */
export default function ClientStatus({ clientId, name, paused, since, canPause }: { clientId: string; name: string; paused: boolean; since: string | null; canPause: boolean }) {
  const router = useRouter();
  const [state, setState] = useState({ paused, since });
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const label = state.paused ? (state.since ? `Pausado · a partir de ${mes(state.since)}` : 'Pausado') : 'Cliente ativo';

  const toggle = () =>
    start(async () => {
      setErr(null);
      const r = await setClientPausedAction(clientId, !state.paused);
      if (!r.ok) return setErr(r.error);
      setState({ paused: r.paused, since: r.since });
      setAsk(false);
      router.refresh();
    });

  return (
    <div className="cstatus">
      <button
        type="button"
        className={`cstatus-btn${state.paused ? ' off' : ''}`}
        role="switch"
        aria-checked={!state.paused}
        aria-label={`${name}: ${label}`}
        disabled={!canPause || pending}
        title={canPause ? (state.paused ? 'Reativar o cliente' : 'Pausar o cliente') : 'Só a Arco, o Marcos e o Lemuel podem pausar'}
        onClick={() => setAsk(true)}
      >
        <i aria-hidden="true" />
        <span>{label}</span>
      </button>
      {ask && canPause && (
        <div className="cstatus-pop" role="alertdialog" aria-label={state.paused ? 'Reativar cliente' : 'Pausar cliente'}>
          <p>
            {state.paused
              ? <>Reativar <b>{name}</b>? A cota volta a renovar a partir deste mês e os atrasados voltam a contar.</>
              : <>Pausar <b>{name}</b>? Este mês continua contando. Do mês que vem em diante a cota não renova, os atrasados ficam congelados e nada entra como produção nova até reativar.</>}
          </p>
          {err && <p className="error" role="alert" style={{ margin: 0 }}>{err}</p>}
          <div className="cstatus-actions">
            <button type="button" className="btn small" disabled={pending} onClick={toggle}>{pending ? 'Salvando…' : state.paused ? 'Reativar' : 'Pausar cliente'}</button>
            <button type="button" className="link-btn" onClick={() => { setAsk(false); setErr(null); }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

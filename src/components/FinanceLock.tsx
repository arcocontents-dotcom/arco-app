'use client';

import { useActionState } from 'react';
import Icon from './Icon';
import { unlockFinanceAction, type UnlockState } from '@/app/admin/financeiro/actions';

/** Tela de senha do Financeiro. */
export default function FinanceLock() {
  const [state, action, pending] = useActionState<UnlockState, FormData>(unlockFinanceAction, {});
  return (
    <div className="fin-lock">
      <form action={action} className="fin-lock-box">
        <span className="fin-lock-ic"><Icon name="wallet" size={26} /></span>
        <h1>Financeiro</h1>
        <p>Digite a senha do Financeiro para abrir. Fica aberto neste aparelho por 12 horas.</p>
        <input className="ninput" type="password" name="senha" inputMode="numeric" autoComplete="current-password" aria-label="Senha do Financeiro" placeholder="Senha" autoFocus required />
        {state.error && <p className="error" role="alert" style={{ margin: 0 }}>{state.error}</p>}
        <button type="submit" className="btn block" disabled={pending}><Icon name="check" size={16} />{pending ? 'Conferindo…' : 'Abrir'}</button>
      </form>
    </div>
  );
}

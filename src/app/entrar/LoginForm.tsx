'use client';

import { useActionState } from 'react';
import { requestLink, type LoginState } from './actions';

export default function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestLink, { status: 'idle' });

  if (state.status === 'sent') {
    return (
      <div className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="label">Confira seu e-mail</p>
        <p style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 24, lineHeight: 1.3 }}>
          Se {state.email} estiver liberado, você vai receber um link para entrar em instantes.
        </p>
        <p className="hint">O link vale por 20 minutos. Confira também a caixa de spam.</p>
      </div>
    );
  }

  return (
    <form action={action} className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 14, ['--d' as string]: '200ms' }}>
      <label htmlFor="email" className="label">Seu e-mail</label>
      <input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        defaultValue={state.email}
        placeholder="nome@empresa.com"
        className="input"
      />
      {(state.status === 'error' || notice) && (
        <p role="alert" className="error" style={{ color: '#e59a8c' }}>{state.message ?? notice}</p>
      )}
      <button type="submit" className="btn light block" disabled={pending} style={{ marginTop: 10 }}>
        {pending ? 'Enviando…' : 'Receber link de acesso'}
      </button>
      <p className="hint">Sem senha. Você recebe um link no e-mail liberado pela Arco e entra direto.</p>
    </form>
  );
}

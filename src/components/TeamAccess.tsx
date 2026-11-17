'use client';

import { useState, useTransition } from 'react';
import Icon from './Icon';
import { teamLoginLinkAction } from '@/app/admin/actions';

/** Gestão → Acessos: administradores da equipe e link de entrada para mandar pelo WhatsApp. */
export default function TeamAccess({ admins, canLink }: { admins: { name: string; email: string; finance: boolean }[]; canLink: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();
  const copy = (email: string, name: string) =>
    start(async () => {
      const r = await teamLoginLinkAction(email);
      if (!r.ok) return setMsg(r.error);
      try {
        await navigator.clipboard.writeText(r.url);
        setMsg(`Link de ${name} copiado (vale 24h). Cole no WhatsApp dele.`);
      } catch {
        setMsg(r.url);
      }
    });
  return (
    <section className="panel" aria-label="Acessos de administrador">
      <span className="label ic-inline"><Icon name="users" size={13} />Administradores</span>
      <ul className="people">
        <li><div style={{ flex: 1 }}><b>Arco (principal)</b> <small className="hint">· tudo, inclusive Financeiro</small></div></li>
        {admins.map((a) => (
          <li key={a.email}>
            <div style={{ flex: 1 }}><b>{a.name}</b> <small className="hint">· {a.email}{a.finance ? ' · vê o Financeiro' : ''}</small></div>
            {canLink && <button type="button" className="btn small outline" onClick={() => copy(a.email, a.name)}><Icon name="link" size={13} />Copiar link de entrada</button>}
          </li>
        ))}
      </ul>
      <p className="hint" style={{ margin: 0 }}>Eles também podem entrar pela tela de login com o e-mail (recebem o link por e-mail). Para tirar ou dar acesso, edite a tabela <b>🔑 Acessos do app</b> no Notion.</p>
      {msg && <p className="hint" role="status" style={{ margin: 0, overflowWrap: 'anywhere' }}>{msg}</p>}
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { createClientFullAction } from '@/app/admin/actions';
import { uploadImage, useUploader } from './upload';
import { LinkBox } from './AccessLink';

export default function NewClientForm() {
  const [name, setName] = useState('');
  const [instagram, setInstagram] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'approver' | 'viewer'>('approver');
  const [logo, setLogo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; link: string | null } | null>(null);
  const [pending, start] = useTransition();
  const up = useUploader();
  const file = useRef<HTMLInputElement>(null);

  if (done) {
    return (
      <div className="panel rise" style={{ maxWidth: 620 }}>
        <span className="label">Cliente criado</span>
        <h2 className="display md">{name}</h2>
        {done.link ? (
          <>
            <p className="hint">{email} já está liberado. Mande este link para o cliente: ele abre direto no calendário dele. Depois do primeiro toque em Entrar, não precisa entrar de novo.</p>
            <LinkBox link={done.link} name={name} />
          </>
        ) : (
          <p className="hint">Nenhum e-mail liberado ainda. Você pode liberar na página de acessos.</p>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="btn" href={`/admin/conteudo/novo?c=${done.id}`}>+ Primeiro conteúdo</Link>
          <Link className="btn outline" href={`/admin/clientes/${done.id}`}>Acessos e logo</Link>
        </div>
      </div>
    );
  }

  return (
    <form
      className="panel rise"
      style={{ maxWidth: 620, ['--d' as string]: '140ms' }}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await createClientFullAction({ name, instagram, email, role, logoUrl: logo });
          if (!r.ok) return setError(r.error);
          setDone({ id: r.id, link: r.link });
        });
      }}
    >
      <div className="field">
        <label htmlFor="name" className="label">Nome</label>
        <input id="name" className="input" required maxLength={120} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="instagram" className="label">Instagram (opcional)</label>
        <input id="instagram" className="input" placeholder="@perfil" maxLength={60} value={instagram} onChange={(e) => setInstagram(e.target.value)} />
      </div>

      <div className="field">
        <span className="label">Logo (opcional)</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="avatar" style={{ width: 64, height: 64 }}>
            <span style={{ background: logo ? '#fff' : 'var(--ink)', overflow: 'hidden' }}>
              {logo ? <img src={logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src="/icon-white.png" alt="" style={{ width: 28, height: 'auto' }} />}
            </span>
          </div>
          <button type="button" className="btn small outline" onClick={() => file.current?.click()} disabled={up.progress !== null}>
            {up.progress !== null ? `Enviando… ${Math.round(up.progress * 100)}%` : logo ? 'Trocar logo' : 'Enviar logo'}
          </button>
          <input
            ref={file}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const u = await up.run((p) => uploadImage(f, p));
              if (u) setLogo(u);
            }}
          />
        </div>
        {up.error && <p className="error">{up.error}</p>}
      </div>

      <div className="field" style={{ paddingTop: 8, borderTop: '1px solid var(--line)' }}>
        <label htmlFor="email" className="label" style={{ paddingTop: 14 }}>E-mail do cliente para liberar o acesso (opcional)</label>
        <input id="email" type="email" className="input" placeholder="email@cliente.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: 18 }}>
          <legend className="sr-only">Permissão</legend>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
            <input type="radio" name="role" checked={role === 'approver'} onChange={() => setRole('approver')} /> Pode aprovar
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
            <input type="radio" name="role" checked={role === 'viewer'} onChange={() => setRole('viewer')} /> Só visualiza
          </label>
        </fieldset>
        <p className="hint">Ao criar, o app gera o link de acesso para você mandar no WhatsApp.</p>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" type="submit" disabled={pending || up.progress !== null}>{pending ? 'Criando…' : 'Criar cliente'}</button>
    </form>
  );
}

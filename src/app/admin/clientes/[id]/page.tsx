import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/access';
import { env } from '@/lib/env';
import { getClientFresh } from '@/lib/notion';
import { instagramConfigured } from '@/lib/instagram';
import AdminShell from '@/components/AdminShell';
import { XIcon } from '@/components/icons';
import LogoUploader from '@/components/LogoUploader';
import AccessLink from '@/components/AccessLink';
import CancelClient from '@/components/CancelClient';
import { addAccessAction, disconnectInstagramAction, removeAccessAction, updateClientAction } from '../../actions';

const OK: Record<string, string> = {
  criado: 'Cliente criado. Agora libere os e-mails.',
  salvo: 'Alterações salvas.',
  liberado: 'Acesso liberado.',
  removido: 'Acesso removido.',
  'ig-ok': 'Instagram conectado.',
  'ig-off': 'Instagram desconectado.'
};
const ERR: Record<string, string> = {
  email: 'Digite um e-mail válido.',
  nome: 'Dê um nome ao cliente.',
  ig: 'Não foi possível conectar o Instagram. Confirme que a conta é Profissional e tente de novo.',
  admin: 'Esse é o e-mail do administrador: ele já vê todos os clientes.'
};

export const dynamic = 'force-dynamic';

export default async function ClienteAcessos({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; e?: string; quem?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const c = await getClientFresh(id);
  if (!c) notFound();
  const people = [
    ...c.approvers.map((e) => ({ email: e, role: 'Pode aprovar' })),
    ...c.viewers.map((e) => ({ email: e, role: 'Só visualiza' }))
  ];
  const appLink = `${env.appUrl}/entrar`;

  return (
    <AdminShell current={c.id} section="gestao">
      <div className="toolbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <a href="/admin/gestao" className="label rise" style={{ textDecoration: 'none' }}>← Gestão</a>
          <h1 className="display rise" style={{ fontSize: 'clamp(36px, 5.5vw, 68px)', ['--d' as string]: '60ms' }}>{c.name}</h1>
        </div>
        <div className="actions">
          <a className="btn outline small" href={`/admin?c=${c.id}`}>Calendário</a>
          <a className="btn outline small" href={`/c/${c.id}`}>Ver como cliente</a>
        </div>
      </div>

      {sp.ok && OK[sp.ok] && <p className="toast" role="status">{OK[sp.ok]}</p>}
      {sp.e && ERR[sp.e] && <p className="error" role="alert">{ERR[sp.e]}</p>}
      {sp.e === 'outro' && (
        <p className="error" role="alert">
          Esse e-mail já está liberado no cliente {sp.quem ?? 'outro'}. Cada e-mail só pode acessar um cliente. Remova de lá antes, ou use outro e-mail.
        </p>
      )}

      <section className="panel rise" style={{ ['--d' as string]: '100ms' }}>
        <h2 className="label">Logo do cliente</h2>
        <LogoUploader clientId={c.id} logoUrl={c.logoUrl} />
      </section>

      <div className="form-grid" style={{ alignItems: 'start' }}>
        <section className="panel rise" style={{ ['--d' as string]: '120ms' }}>
          <h2 className="label">Quem acessa a página deste cliente</h2>
          <p className="hint">Só os e-mails desta lista entram, e cada um vê apenas este cliente. Um mesmo e-mail não pode ser liberado em dois clientes. Eles entram por {appLink}.</p>
          <ul className="people">
            <li>
              <span className="initial"><img src="/icon-white.png" alt="" style={{ width: 18, height: 'auto' }} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{env.adminEmail}</div>
                <span className="label">Administrador · todos os clientes</span>
              </div>
            </li>
            {people.map((p) => (
              <li key={p.email} style={{ flexWrap: 'wrap' }}>
                <span className="initial">{p.email[0]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.email}</div>
                  <span className="label">{p.role}</span>
                  <AccessLink clientId={c.id} email={p.email} />
                </div>
                <form action={removeAccessAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="email" value={p.email} />
                  <button className="icon-btn" type="submit" aria-label={`Remover acesso de ${p.email}`}><XIcon /></button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addAccessAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="hidden" name="id" value={c.id} />
            <div className="field">
              <label htmlFor="email" className="label">Adicionar e-mail</label>
              <input id="email" name="email" type="email" required className="input" placeholder="email@cliente.com" />
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: 18 }}>
              <legend className="sr-only">Permissão</legend>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
                <input type="radio" name="role" value="approver" defaultChecked /> Pode aprovar
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
                <input type="radio" name="role" value="viewer" /> Só visualiza
              </label>
            </fieldset>
            <button className="btn" type="submit">Liberar acesso</button>
          </form>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <section className="panel rise" style={{ ['--d' as string]: '180ms' }}>
            <h2 className="label">Instagram</h2>
            {c.igConnected ? (
              <>
                <span className="status s-Aprovado">Conectado{c.instagram ? ` · @${c.instagram}` : ''}</span>
                <p className="hint">Os posts publicados desde 01/01/2026 aparecem sozinhos na aba Feed e se atualizam a cada 10 minutos.</p>
                <form action={disconnectInstagramAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="btn outline small" type="submit">Desconectar</button>
                </form>
              </>
            ) : instagramConfigured() ? (
              <>
                <p className="hint">A conta precisa ser Profissional (Comercial ou Criador). Quem tiver o login do cliente autoriza uma única vez.</p>
                <a className="btn" href={`/api/instagram/connect?c=${c.id}`}>Conectar Instagram</a>
              </>
            ) : (
              <p className="hint">A conexão com o Instagram fica disponível quando o app da Meta estiver configurado. Enquanto isso, o Feed mostra o que foi marcado como postado no app desde 01/01/2026.</p>
            )}
          </section>

          <form action={updateClientAction} className="panel rise" style={{ ['--d' as string]: '240ms' }}>
            <h2 className="label">Dados do cliente</h2>
            <input type="hidden" name="id" value={c.id} />
            <div className="field">
              <label htmlFor="name" className="label">Nome</label>
              <input id="name" name="name" className="input" defaultValue={c.name} required maxLength={120} />
            </div>
            <div className="field">
              <label htmlFor="ig" className="label">Instagram</label>
              <input id="ig" name="instagram" className="input" defaultValue={c.instagram ? `@${c.instagram}` : ''} maxLength={60} />
            </div>
            <button className="btn outline" type="submit">Salvar</button>
          </form>

          <section className="panel rise" style={{ ['--d' as string]: '300ms' }}>
            <h2 className="label">Cliente cancelou?</h2>
            <CancelClient clientId={c.id} name={c.name} cancelled={c.cancelled} />
          </section>
        </div>
      </div>
    </AdminShell>
  );
}

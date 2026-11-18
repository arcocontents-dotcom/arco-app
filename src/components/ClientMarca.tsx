import Icon from './Icon';
import { MarcaFonts } from './MarcaPanel';
import { fontFamilyOf } from '@/lib/marca-view';
import type { Marca } from '@/lib/marca';

const tel = (s: string) => `tel:+55${s.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')}`;
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
/** Cor do texto em cima de uma cor da paleta (claro no escuro e vice-versa). */
function ink(hex: string) {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#111' : '#fff';
}

/** Aba do cliente: MARCA — paleta, tipografia, edição, contato e links (lidos da página Marca no Notion). */
export default function ClientMarca({ marca, clientName }: { marca: Marca | null; clientName: string }) {
  if (!marca) {
    return (
      <section className="cmarca rise" aria-label="Marca">
        <div className="cmarca-head"><h2 className="label">Marca</h2></div>
        <p className="hint" style={{ margin: 0 }}>
          Não achei a página <b>Marca</b> de {clientName} no Notion (Gestão → {clientName} → Bastidores → Marca), ou ela ainda está vazia.
          Preencha lá a paleta, as fontes e o contato: aparece aqui sozinho.
        </p>
      </section>
    );
  }
  const k = marca.contato;
  const contato = [
    k.telefone && { icon: 'phone' as const, nome: 'Telefone', valor: k.telefone, href: tel(k.telefone) },
    k.whatsapp && { icon: 'send' as const, nome: 'WhatsApp', valor: /^https?:/.test(k.whatsapp) ? 'Abrir conversa' : k.whatsapp, href: /^https?:/.test(k.whatsapp) ? k.whatsapp : `https://wa.me/55${k.whatsapp.replace(/\D/g, '')}` },
    k.endereco && { icon: 'pin' as const, nome: 'Endereço', valor: k.endereco, href: k.maps ?? `https://www.google.com/maps/search/${encodeURIComponent(k.endereco)}` },
    !k.endereco && k.maps && { icon: 'pin' as const, nome: 'Localização', valor: 'Abrir no Maps', href: k.maps },
    k.instagram && { icon: 'image' as const, nome: 'Instagram', valor: /^https?:/.test(k.instagram) ? host(k.instagram) : k.instagram, href: /^https?:/.test(k.instagram) ? k.instagram : `https://instagram.com/${k.instagram.replace(/^@/, '')}` },
    k.site && { icon: 'link' as const, nome: 'Site', valor: host(k.site), href: /^https?:/.test(k.site) ? k.site : `https://${k.site}` },
    ...k.outros.map((o) => ({ icon: 'link' as const, nome: o.nome, valor: o.url ? host(o.url) : o.valor, href: o.url ?? null }))
  ].filter(Boolean) as { icon: 'phone' | 'send' | 'pin' | 'image' | 'link'; nome: string; valor: string; href: string | null }[];

  return (
    <section className="cmarca rise" aria-label="Marca">
      <MarcaFonts marca={marca} />
      <div className="cmarca-head">
        <h2 className="label">Marca</h2>
        <a className="link-btn ic-inline" href={marca.pagina} target="_blank" rel="noreferrer"><Icon name="external" size={12} />Abrir a página Marca no Notion</a>
      </div>

      {marca.cores.length > 0 && (
        <div className="cmarca-block">
          <h3 className="cmarca-t">Paleta de cores</h3>
          <ul className="cmarca-pal">
            {marca.cores.map((c) => (
              <li key={c.hex} style={{ background: c.hex, color: ink(c.hex) }}>
                <b>{c.nome !== c.hex ? c.nome : ''}</b>
                <code>{c.hex.toUpperCase()}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(marca.fontePrincipal || marca.fonteSecundaria || marca.fonteInstagram) && (
        <div className="cmarca-block">
          <h3 className="cmarca-t">Tipografia</h3>
          <div className="cmarca-type">
            {marca.fontePrincipal && (
              <div className="cmarca-spec main">
                <span className="cmarca-aa" style={{ fontFamily: fontFamilyOf(marca.fontePrincipal) ?? undefined }}>Aa</span>
                <div><small>Fonte principal · títulos</small><strong style={{ fontFamily: fontFamilyOf(marca.fontePrincipal) ?? undefined }}>{marca.fontePrincipal}</strong></div>
              </div>
            )}
            {marca.fonteSecundaria && (
              <div className="cmarca-spec">
                <span className="cmarca-aa" style={{ fontFamily: fontFamilyOf(marca.fonteSecundaria) ?? undefined }}>Aa</span>
                <div><small>Fonte secundária · textos</small><strong style={{ fontFamily: fontFamilyOf(marca.fonteSecundaria) ?? undefined }}>{marca.fonteSecundaria}</strong></div>
              </div>
            )}
            {marca.fonteInstagram && (
              <div className="cmarca-spec">
                <span className="cmarca-aa" style={{ fontFamily: fontFamilyOf(marca.fonteInstagram) ?? undefined }}>Aa</span>
                <div><small>Fonte do Instagram</small><strong>{marca.fonteInstagram}</strong></div>
              </div>
            )}
          </div>
          {marca.edicao.length > 0 && (
            <dl className="cmarca-edit">
              {marca.edicao.map((e, i) => <div key={`${e.nome}-${i}`}><dt>{e.nome}</dt><dd>{e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.valor}</a> : e.valor}</dd></div>)}
            </dl>
          )}
        </div>
      )}

      {contato.length > 0 && (
        <div className="cmarca-block">
          <h3 className="cmarca-t">Dados do cliente</h3>
          <ul className="cmarca-contact">
            {contato.map((c, i) => (
              <li key={`${c.nome}-${i}`}>
                <span className="cmarca-ic" aria-hidden="true"><Icon name={c.icon} size={15} /></span>
                <div><small>{c.nome}</small>{c.href ? <a href={c.href} target={c.href.startsWith('tel:') ? undefined : '_blank'} rel="noreferrer">{c.valor}</a> : <span>{c.valor}</span>}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(marca.arquivos.length > 0 || marca.referencias.length > 0) && (
        <div className="cmarca-block cmarca-links">
          {marca.arquivos.length > 0 && (
            <div>
              <h3 className="cmarca-t">Arquivos e links</h3>
              <ul>{marca.arquivos.map((a, i) => <li key={`${a.url}-${i}`}><a href={a.url} target="_blank" rel="noreferrer"><b>{a.nome}</b><span>{a.url ? host(a.url) : ''}</span></a></li>)}</ul>
            </div>
          )}
          {marca.referencias.length > 0 && (
            <div>
              <h3 className="cmarca-t">Referências que o cliente gosta</h3>
              <ul>{marca.referencias.map((a, i) => <li key={`${a.url}-${i}`}><a href={a.url} target="_blank" rel="noreferrer"><b>{a.nome}</b><span>{a.url ? host(a.url) : ''}</span></a></li>)}</ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

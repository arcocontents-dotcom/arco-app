import Icon from './Icon';
import { fontFamilyOf, googleFontHref, type Marca } from '@/lib/marca';

const tel = (s: string) => `tel:+55${s.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')}`;

/** Fontes da marca carregadas do Google Fonts (quando existem lá) para mostrar a letra de verdade. */
export function MarcaFonts({ marca }: { marca: Marca }) {
  const hrefs = [...new Set([marca.fontePrincipal, marca.fonteSecundaria, marca.fonteInstagram].map(googleFontHref).filter((h): h is string => !!h))];
  return <>{hrefs.map((h) => <link key={h} rel="stylesheet" href={h} precedence="default" />)}</>;
}

/** Identidade visual do cliente (página Marca do Notion), compacta, ao lado das entregas. */
export default function MarcaPanel({ marca, clientName }: { marca: Marca; clientName: string }) {
  return (
    <section className="marca-panel rise" aria-label={`Identidade visual de ${clientName}`}>
      <MarcaFonts marca={marca} />
      <div className="marca-head">
        <h2 className="label">Identidade visual</h2>
        <a className="link-btn ic-inline" href={marca.pagina} target="_blank" rel="noreferrer"><Icon name="link" size={12} />Notion</a>
      </div>
      {marca.cores.length > 0 && (
        <ul className="marca-strip" aria-label="Paleta de cores">
          {marca.cores.map((c) => <li key={c.hex} style={{ background: c.hex }} title={`${c.nome} ${c.hex}`}><span>{c.hex}</span></li>)}
        </ul>
      )}
      <dl className="marca-fontes">
        {marca.fontePrincipal && <div className="marca-kv"><dt>Fonte principal</dt><dd className="marca-font" style={{ fontFamily: fontFamilyOf(marca.fontePrincipal) ?? undefined }}>{marca.fontePrincipal}</dd></div>}
        {marca.fonteSecundaria && <div className="marca-kv"><dt>Fonte secundária</dt><dd style={{ fontFamily: fontFamilyOf(marca.fonteSecundaria) ?? undefined }}>{marca.fonteSecundaria}</dd></div>}
        {marca.edicao.filter((e) => /tamanho/i.test(e.nome)).map((f, i) => (
          <div key={`${f.nome}-${i}`} className="marca-kv"><dt>{f.nome}</dt><dd>{f.valor}</dd></div>
        ))}
        {marca.contato.telefone && <div className="marca-kv"><dt>Telefone</dt><dd><a href={tel(marca.contato.telefone)}>{marca.contato.telefone}</a></dd></div>}
      </dl>
    </section>
  );
}

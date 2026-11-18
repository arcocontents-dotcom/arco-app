import Icon from './Icon';
import type { Marca } from '@/lib/marca';

/** Identidade visual do cliente (da página Marca do Notion), perto do relatório de entregas e atrasos. */
export default function MarcaPanel({ marca, clientName }: { marca: Marca; clientName: string }) {
  return (
    <section className="marca-panel rise" aria-label={`Identidade visual de ${clientName}`}>
      <div className="marca-head">
        <h2 className="label">Identidade visual</h2>
        <a className="link-btn ic-inline" href={marca.pagina} target="_blank" rel="noreferrer"><Icon name="link" size={12} />Marca no Notion</a>
      </div>
      {marca.cores.length > 0 && (
        <ul className="marca-cores" aria-label="Paleta de cores">
          {marca.cores.map((c) => (
            <li key={c.hex}>
              <span className="marca-sw" style={{ background: c.hex }} aria-hidden="true" />
              <span><b>{c.nome !== c.hex ? c.nome : ''}</b> <code>{c.hex}</code></span>
            </li>
          ))}
        </ul>
      )}
      <dl className="marca-fontes">
        {marca.fontePrincipal && <div className="marca-kv"><dt>Fonte principal</dt><dd className="marca-font" style={{ fontFamily: `'${marca.fontePrincipal}', var(--display)` }}>{marca.fontePrincipal}</dd></div>}
        {marca.fonteSecundaria && <div className="marca-kv"><dt>Fonte secundária</dt><dd style={{ fontFamily: `'${marca.fonteSecundaria}', var(--body)` }}>{marca.fonteSecundaria}</dd></div>}
        {[...marca.outrasFontes, ...marca.tamanhos].map((f, i) => (
          <div key={`${f.nome}-${i}`} className="marca-kv"><dt>{f.nome}</dt><dd>{f.valor}</dd></div>
        ))}
      </dl>
    </section>
  );
}

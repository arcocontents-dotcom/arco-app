'use client';

import { useEffect, useState, useTransition } from 'react';
import Icon from './Icon';
import { fontSpec, fontStyle } from '@/lib/marca-view';
import type { Marca } from '@/lib/marca';
import { atualizarMarcaAction, marcaAction } from '@/app/admin/clientes/marca-actions';

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const tel = (s: string) => `tel:+${(s.replace(/\D/g, '').replace(/^(?!55)/, '55')).slice(0, 13)}`;

/** Botão pequeno que copia um texto (código da cor, nome da fonte, telefone). */
function Copy({ value, label }: { value: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className={`bb-copy${ok ? ' ok' : ''}`}
      aria-label={`Copiar ${label}`}
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); } catch { /* sem permissão: ignora */ }
        setOk(true);
        setTimeout(() => setOk(false), 1400);
      }}
    >
      <Icon name={ok ? 'check' : 'copy'} size={12} />
      <span>{ok ? 'Copiado' : 'Copiar'}</span>
    </button>
  );
}

/** Fontes da marca carregadas do Google Fonts (quando existem lá) para mostrar a letra de verdade. */
function Fonts({ names }: { names: (string | null)[] }) {
  const hrefs = [...new Set(names.map((n) => fontSpec(n)?.href).filter((h): h is string => !!h))];
  return <>{hrefs.map((h) => <link key={h} rel="stylesheet" href={h} precedence="default" />)}</>;
}

/**
 * Marca do cliente: paleta (quadradinhos com o código e botão de copiar), fontes, dados e links.
 * Vem da cópia guardada no cliente (abre na hora); "Atualizar do Notion" lê a página Marca de novo.
 */
export default function BrandBoard({ clientId, clientName, initial }: { clientId: string; clientName: string; initial: Marca | null }) {
  const [marca, setMarca] = useState<Marca | null>(initial);
  const [loading, setLoading] = useState(!initial);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setMarca(initial);
    if (initial) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    marcaAction(clientId).then((r) => { if (alive) { setMarca(r.marca); setLoading(false); } }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [clientId, initial]);

  const refresh = () =>
    start(async () => {
      setErr(null);
      const r = await atualizarMarcaAction(clientId);
      if (r.marca) setMarca(r.marca);
      else setErr('Não consegui ler a página Marca agora. Confira se ela existe em Gestão → cliente → Bastidores → Marca.');
    });

  const head = (
    <div className="bb-head">
      <div>
        <p className="label">Identidade visual</p>
        <p className="bb-title">{clientName}</p>
      </div>
      <div className="bb-actions">
        <button type="button" className="link-btn ic-inline" disabled={pending} onClick={refresh}><Icon name="undo" size={12} />{pending ? 'Atualizando…' : 'Atualizar do Notion'}</button>
        {marca?.pagina && <a className="link-btn ic-inline" href={marca.pagina} target="_blank" rel="noreferrer"><Icon name="external" size={12} />Abrir no Notion</a>}
      </div>
    </div>
  );

  if (loading) {
    return (
      <section className="bb" aria-label="Marca" aria-busy="true">
        {head}
        <div className="bb-sk"><i /><i /><i /><i /></div>
        <p className="hint">Buscando a marca no Notion…</p>
      </section>
    );
  }
  if (!marca) {
    return (
      <section className="bb" aria-label="Marca">
        {head}
        <p className="hint" style={{ margin: 0 }}>
          Ainda não tem marca de {clientName}. Preencha no Notion em <b>Gestão → {clientName} → Bastidores → Marca</b> (paleta de cores e fontes) e toque em <b>Atualizar do Notion</b>.
        </p>
        {err && <p className="error" role="alert">{err}</p>}
      </section>
    );
  }

  const fontes = [
    marca.fontePrincipal && { papel: 'Fonte principal', uso: 'Títulos', nome: marca.fontePrincipal, main: true },
    marca.fonteSecundaria && { papel: 'Fonte secundária', uso: 'Textos e apoio', nome: marca.fonteSecundaria },
    ...marca.outrasFontes.map((f) => ({ papel: f.nome, uso: '', nome: f.valor })),
    marca.fonteInstagram && { papel: 'Fonte do Instagram', uso: 'Stories e legendas', nome: marca.fonteInstagram }
  ].filter(Boolean) as { papel: string; uso: string; nome: string; main?: boolean }[];
  const k = marca.contato;

  return (
    <section className="bb" aria-label="Marca">
      <Fonts names={fontes.map((f) => f.nome)} />
      {head}

      <div className="bb-block">
        <h3 className="bb-t">Paleta de cores</h3>
        {marca.cores.length ? (
          <ul className="bb-pal">
            {marca.cores.map((c, i) => (
              <li key={`${c.hex}-${i}`}>
                <span className="bb-sw" style={{ background: c.hex }} aria-hidden="true" />
                <span className="bb-cname">{c.nome !== c.hex ? c.nome : 'Cor'}</span>
                <span className="bb-code">
                  <input readOnly value={c.hex.toUpperCase()} aria-label={`Código da cor ${c.nome}`} onFocus={(e) => e.currentTarget.select()} />
                  <Copy value={c.hex.toUpperCase()} label={`a cor ${c.nome} ${c.hex}`} />
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="hint" style={{ margin: 0 }}>A paleta ainda não foi preenchida no Notion.</p>}
      </div>

      <div className="bb-block">
        <h3 className="bb-t">Fontes</h3>
        {fontes.length ? (
          <ul className="bb-fonts">
            {fontes.map((f, i) => (
              <li key={`${f.nome}-${i}`} className={f.main ? 'main' : ''}>
                <span className="bb-aa" style={fontStyle(f.nome)} aria-hidden="true">Aa</span>
                <div className="bb-finfo">
                  <small>{f.papel}{f.uso ? ` · ${f.uso}` : ''}</small>
                  <strong style={fontStyle(f.nome)}>{f.nome}</strong>
                  <span className="bb-sample" style={fontStyle(f.nome)}>ABCDEFG abcdefg 0123456789</span>
                </div>
                <Copy value={f.nome} label={`o nome da fonte ${f.nome}`} />
              </li>
            ))}
          </ul>
        ) : <p className="hint" style={{ margin: 0 }}>As fontes ainda não foram preenchidas no Notion.</p>}
        {marca.edicao.length > 0 && (
          <dl className="bb-edit">
            {marca.edicao.map((e, i) => <div key={`${e.nome}-${i}`}><dt>{e.nome}</dt><dd>{e.valor}</dd></div>)}
          </dl>
        )}
      </div>

      {(k.telefone || k.endereco || k.whatsapp || k.maps) && (
        <div className="bb-block">
          <h3 className="bb-t">Dados do cliente</h3>
          <ul className="bb-contact">
            {k.telefone && <li><span className="bb-ic"><Icon name="phone" size={15} /></span><div><small>Telefone</small><a href={tel(k.telefone)}>{k.telefone}</a></div><Copy value={k.telefone} label="o telefone" /></li>}
            {k.whatsapp && <li><span className="bb-ic"><Icon name="send" size={15} /></span><div><small>WhatsApp</small><a href={/^https?:/.test(k.whatsapp) ? k.whatsapp : `https://wa.me/${k.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">Abrir conversa</a></div></li>}
            {k.endereco && <li><span className="bb-ic"><Icon name="pin" size={15} /></span><div><small>Endereço</small><a href={k.maps ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(k.endereco)}`} target="_blank" rel="noreferrer">{k.endereco}</a></div><Copy value={k.endereco} label="o endereço" /></li>}
            {!k.endereco && k.maps && <li><span className="bb-ic"><Icon name="pin" size={15} /></span><div><small>Localização</small><a href={k.maps} target="_blank" rel="noreferrer">Abrir no Maps</a></div></li>}
          </ul>
        </div>
      )}

      {(marca.arquivos.length > 0 || marca.referencias.length > 0) && (
        <div className="bb-block bb-links">
          {marca.arquivos.length > 0 && (
            <div>
              <h3 className="bb-t">Arquivos e links</h3>
              <ul>{marca.arquivos.map((a, i) => <li key={`${a.url}-${i}`}><a href={a.url ?? a.valor} target="_blank" rel="noreferrer"><b>{a.nome}</b><span>{host(a.url ?? a.valor)}</span></a></li>)}</ul>
            </div>
          )}
          {marca.referencias.length > 0 && (
            <div>
              <h3 className="bb-t">Referências que o cliente gosta</h3>
              <ul>{marca.referencias.map((a, i) => <li key={`${a.url}-${i}`}><a href={a.url ?? a.valor} target="_blank" rel="noreferrer"><b>{a.nome}</b><span>{host(a.url ?? a.valor)}</span></a></li>)}</ul>
            </div>
          )}
        </div>
      )}
      {err && <p className="error" role="alert">{err}</p>}
    </section>
  );
}

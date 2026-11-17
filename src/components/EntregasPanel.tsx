import Icon from './Icon';
import type { EntregaMes, Entrega } from '@/lib/contrato';

const TYPES: { k: Entrega; label: string; color: string }[] = [
  { k: 'reels', label: 'Reels', color: '#d9730d' },
  { k: 'post', label: 'Posts', color: '#0b6e99' },
  { k: 'story', label: 'Stories', color: '#dfab01' }
];

function Ring({ done, prod, total, color }: { done: number; prod: number; total: number; color: string }) {
  const R = 30;
  const C = 2 * Math.PI * R;
  const base = Math.max(total, 1);
  const a = Math.min(done / base, 1);
  const b = Math.min(prod / base, 1 - a);
  return (
    <svg viewBox="0 0 76 76" width="76" height="76" aria-hidden="true" className="ent-ring">
      <circle cx="38" cy="38" r={R} fill="none" stroke="#efede9" strokeWidth="7" />
      {b > 0 && (
        <circle cx="38" cy="38" r={R} fill="none" stroke={color} strokeOpacity="0.28" strokeWidth="7"
          strokeDasharray={`${b * C} ${C}`} strokeDashoffset={-a * C} transform="rotate(-90 38 38)" strokeLinecap="butt" />
      )}
      {a > 0 && (
        <circle className="ent-arc" cx="38" cy="38" r={R} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${a * C} ${C}`} transform="rotate(-90 38 38)" strokeLinecap={a >= 1 ? 'butt' : 'round'} />
      )}
    </svg>
  );
}

/** Lateral do Planejamento: o combinado com a marca no mês e quanto já foi postado. */
export default function EntregasPanel({ data, monthLabel, clientName }: { data: EntregaMes; monthLabel: string; clientName: string }) {
  const c = data.combinado;
  // meta do mês = combinado + o que ficou atrasado dos meses anteriores
  const meta = (k: Entrega) => (c?.[k] ?? 0) + (data.atrasados?.[k] ?? 0);
  const rows = TYPES.filter((t) => meta(t.k) > 0 || data.postados[t.k] > 0);
  const total = c ? TYPES.reduce((s, t) => s + meta(t.k), 0) : 0;
  const done = TYPES.reduce((s, t) => s + Math.min(data.postados[t.k], c ? meta(t.k) : data.postados[t.k]), 0);
  const falta = Math.max(0, total - done);
  const late = TYPES.reduce((s, t) => s + (data.atrasados?.[t.k] ?? 0), 0);
  return (
    <div role="complementary" className="ent rise" aria-label={`Entregas de ${monthLabel}`} style={{ ['--d' as string]: '140ms' }}>
      <div className="ent-head">
        <span className="label">Entregas · {monthLabel}</span>
        {c && (
          <>
            <strong className="ent-big">{done}<small>/{total}</small></strong>
            <span className="ent-sub">{total === 0 ? 'Nada combinado para o mês' : falta === 0 ? 'Mês completo ✓' : `Falta${falta > 1 ? 'm' : ''} ${falta} para fechar o mês`}</span>
            <div className="ent-bar" aria-hidden="true"><span style={{ width: `${total ? Math.min(100, (done / total) * 100) : 0}%` }} /></div>
            {late > 0 && (
              <span className="ent-late" role="status">
                <Icon name="clock" size={12} />{late} atrasado{late > 1 ? 's' : ''}{data.atrasadosDe?.length ? ` de ${data.atrasadosDe.join(', ')}` : ''} somado{late > 1 ? 's' : ''} a este mês
              </span>
            )}
          </>
        )}
      </div>

      {c ? (
        <ul className="ent-list">
          {rows.map((t) => {
            const target = meta(t.k);
            const lateK = data.atrasados?.[t.k] ?? 0;
            const p = data.postados[t.k];
            const prod = data.emProducao[t.k];
            const left = target - p;
            return (
              <li key={t.k}>
                <div className="ent-ring-wrap">
                  <Ring done={p} prod={prod} total={target || p} color={t.color} />
                  <span className="ent-num"><b>{p}</b>/{target}</span>
                </div>
                <div className="ent-info">
                  <strong><i style={{ background: t.color }} />{t.label}</strong>
                  <span>{left > 0 ? `Falta${left > 1 ? 'm' : ''} ${left}` : left === 0 ? 'Completo ✓' : `+${-left} além do combinado`}</span>
                  {lateK > 0 && <small className="ent-late-s">{c[t.k]} do mês + {lateK} atrasado{lateK > 1 ? 's' : ''}</small>}
                  {prod > 0 && <small>{prod} em produção</small>}
                </div>
              </li>
            );
          })}
          {!rows.length && <li className="ent-empty">Nada combinado para este mês.</li>}
        </ul>
      ) : (
        <div className="ent-setup">
          <p>Não achei o <b>Combinado com a marca</b> de {clientName}.</p>
          <p className="hint">Na página do cliente na Gestão, crie um toggle <b>Combinado com a marca</b> com as linhas <code>Reels mensal: 4</code>, <code>Post mensal: 2</code>, <code>Story mensal: 3</code>.</p>
        </div>
      )}

      <p className="ent-foot">
        Conta o que já foi <b>postado</b> com “Referente ao mês” = {monthLabel.split(' ')[0]}. O anel claro é o que está lançado e ainda em produção. Todo mês começa do zero; o que faltou postar no mês anterior entra aqui como atrasado até ser postado.
        {data.pagina && <> <a href={data.pagina.replace('https://www.notion.so/', 'notion://www.notion.so/')} className="ic-inline"><Icon name="external" size={11} />Combinado no Notion</a></>}
      </p>
    </div>
  );
}

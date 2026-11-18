'use client';

import { useEffect, useState } from 'react';
import { marcaAction } from '@/app/admin/clientes/marca-actions';
import type { Marca } from '@/lib/marca';
import ClientMarca from './ClientMarca';
import MarcaPanel from './MarcaPanel';

/** Carrega a Marca do Notion depois que a página abre (não atrasa nem derruba a página). */
export default function MarcaLoader({ clientId, clientName, variant }: { clientId: string; clientName: string; variant: 'full' | 'compact' }) {
  const [state, setState] = useState<{ loading: boolean; marca: Marca | null }>({ loading: true, marca: null });
  useEffect(() => {
    let alive = true;
    setState({ loading: true, marca: null });
    marcaAction(clientId)
      .then((r) => alive && setState({ loading: false, marca: r.marca }))
      .catch(() => alive && setState({ loading: false, marca: null }));
    return () => { alive = false; };
  }, [clientId]);
  if (state.loading) {
    return variant === 'full' ? (
      <section className="cmarca cmarca-loading" aria-label="Marca" aria-busy="true">
        <div className="cmarca-head"><h2 className="label">Marca</h2><span className="hint">Buscando no Notion…</span></div>
        <div className="sk sk-pal" /><div className="sk sk-type" />
      </section>
    ) : null;
  }
  if (variant === 'compact') return state.marca ? <MarcaPanel marca={state.marca} clientName={clientName} /> : null;
  return <ClientMarca marca={state.marca} clientName={clientName} />;
}

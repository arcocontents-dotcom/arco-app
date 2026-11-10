'use client';

import { useRef } from 'react';

export default function DashFilters({ month, client, type, clients }: {
  month: string;
  client: string;
  type: string;
  clients: { id: string; name: string }[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const go = () => form.current?.requestSubmit();
  return (
    <form ref={form} method="get" action="/admin/gestao/dashboard" className="dash-filters">
      <input type="hidden" name="m" value={month} />
      <select name="c" className="select" aria-label="Cliente" defaultValue={client} onChange={go}>
        <option value="">Todos os clientes</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select name="t" className="select" aria-label="Formato" defaultValue={type} onChange={go}>
        <option value="">Todos os formatos</option>
        <option value="Reels">Reels</option>
        <option value="Post">Post e carrossel</option>
        <option value="Story">Story</option>
      </select>
      <noscript><button className="btn small" type="submit">Ver</button></noscript>
    </form>
  );
}

import { redirect } from 'next/navigation';
import { requireViewer } from '@/lib/access';

export default async function Home() {
  const v = await requireViewer();
  if (v.role === 'admin') redirect('/admin');
  if (v.clients.length === 1) redirect(`/c/${v.clients[0].id}`);
  return (
    <main className="shell">
      <header className="topbar">
        <img src="/logo-black.png" alt="Arco Contents" className="logo" />
      </header>
      <div className="page-head">
        <p className="label">Escolha a marca</p>
        <h1 className="display lg">Suas páginas</h1>
      </div>
      <div className="list">
        {v.clients.map((c, i) => (
          <a key={c.id} href={`/c/${c.id}`} className="row-item rise" style={{ ['--d' as string]: `${i * 70}ms` }}>
            <div className="row-body"><span className="serif-title">{c.name}</span></div>
            <span aria-hidden>→</span>
          </a>
        ))}
      </div>
    </main>
  );
}

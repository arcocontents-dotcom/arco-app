'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="shell" style={{ justifyContent: 'center', padding: 24, gap: 18 }}>
      <p className="label">Algo saiu do lugar</p>
      <h1 className="display lg">Tente de novo</h1>
      <p className="hint">Não conseguimos carregar agora. Se continuar, avise a Arco.</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" onClick={() => reset()}>Recarregar</button>
        <a className="btn outline" href="/">Início</a>
      </div>
    </main>
  );
}

// Limite simples de tentativas (por instância do servidor). Segura robôs e cliques repetidos
// sem precisar de banco: cada chave só pode N vezes dentro da janela.
const g = globalThis as unknown as { __arcoHits?: Map<string, number[]> };
const hits = (g.__arcoHits ??= new Map<string, number[]>());

export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return true;
}

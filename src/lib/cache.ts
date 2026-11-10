import 'server-only';

// Cache curtinho em memória (por instância do servidor). Leve e previsível:
// escritas feitas pelo app limpam o cache na hora; edições feitas direto no Notion
// aparecem em até alguns segundos.
type Entry = { at: number; ttl: number; value: Promise<unknown> };
const store = new Map<string, Entry>();

export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < hit.ttl) return hit.value as Promise<T>;
  const value = fn().catch((e) => {
    store.delete(key);
    throw e;
  });
  store.set(key, { at: now, ttl: ttlMs, value });
  if (store.size > 500) {
    for (const [k, v] of store) if (now - v.at > v.ttl) store.delete(k);
  }
  return value;
}

export function invalidate(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}

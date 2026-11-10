/** Só aceita destinos internos do app (evita mandar a pessoa para outro site). */
export function safeNext(n: unknown): string {
  const s = typeof n === 'string' ? n : '';
  return /^\/c\/[A-Za-z0-9-]{32,36}(\?v=(mes|semana|feed))?$/.test(s) ? s : '/';
}

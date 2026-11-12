import 'server-only';
import { env } from './env';

/**
 * Proteção contra pedidos forjados por outros sites (CSRF) nas rotas de API:
 * exige JSON e, quando o navegador informa a origem, que ela seja o próprio app.
 */
export function sameOrigin(req: Request): boolean {
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.toLowerCase().startsWith('application/json')) return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const self = new URL(req.url).origin;
  return origin === env.appUrl || origin === self;
}

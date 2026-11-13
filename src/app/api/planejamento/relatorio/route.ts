import { NextResponse } from 'next/server';
import { currentViewer } from '@/lib/access';
import { getClientFresh } from '@/lib/notion';
import { addDays, addMonths, parseDay } from '@/lib/domain';
import { planningReport } from '@/lib/planning';

// Dados do relatório mensal (só o admin). O PDF é montado no navegador.
export async function GET(req: Request) {
  const v = await currentViewer();
  if (!v || v.role !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  const url = new URL(req.url);
  const client = await getClientFresh(url.searchParams.get('c') ?? '');
  const day = parseDay(url.searchParams.get('m'));
  if (!client || !day) return NextResponse.json({ error: 'Cliente ou mês inválido' }, { status: 400 });
  if (!client.calName) return NextResponse.json({ error: 'Cliente sem ligação com o Calendário mensal' }, { status: 400 });
  const first = `${day.slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);
  const items = await planningReport(client.calName, first, last);
  if (typeof items === 'string') return NextResponse.json({ error: 'Não foi possível ler o Calendário mensal' }, { status: 502 });
  return NextResponse.json(
    {
      client: { name: client.name, instagram: client.instagram, logoUrl: client.logoUrl },
      first,
      last,
      items: items.map((i) => ({
        title: i.title, day: i.day, time: i.time, kind: i.kind, status: i.status,
        objetivo: i.objetivo, legenda: i.legenda, referencia: i.referencia, roteiro: i.roteiro
      }))
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

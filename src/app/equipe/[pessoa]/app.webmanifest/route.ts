import { TEAM, validTeamKey } from '@/lib/producao';

// App da equipe no celular: cada pessoa instala o próprio link (abre direto nas tarefas dela).
export async function GET(req: Request, { params }: { params: Promise<{ pessoa: string }> }) {
  const { pessoa } = await params;
  const k = new URL(req.url).searchParams.get('k');
  const person = TEAM.find((t) => t.toLowerCase() === decodeURIComponent(pessoa).toLowerCase()) ?? '';
  if (!validTeamKey(person, k)) return new Response('Not found', { status: 404 });
  const start = `/equipe/${person.toLowerCase()}?k=${encodeURIComponent(k!)}`;
  return Response.json(
    {
      id: `/equipe/${person.toLowerCase()}`,
      name: `Arco Equipe · ${person}`,
      short_name: 'Arco Equipe',
      description: 'Tarefas da semana da equipe Arco Contents.',
      start_url: start,
      scope: '/equipe/',
      display: 'standalone',
      background_color: '#F6F5F2',
      theme_color: '#111111',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'private, max-age=3600' } }
  );
}

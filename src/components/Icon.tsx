// Ícones próprios da Arco, desenhados em traço fino e animados com CSS (globals.css → "ícones").
// A animação dispara quando o botão/link que contém o ícone recebe hover, foco ou fica ativo.

export type IconName =
  | 'calendar' | 'grid' | 'users' | 'chart' | 'feed' | 'week' | 'month' | 'plus' | 'eye' | 'logout'
  | 'search' | 'bell' | 'download' | 'check' | 'pencil' | 'x' | 'send' | 'link' | 'chat' | 'left'
  | 'right' | 'copy' | 'image' | 'video' | 'trash' | 'clock' | 'inbox' | 'undo' | 'command';

const P = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
};

function paths(name: IconName) {
  switch (name) {
    case 'calendar':
      return (<>
        <rect x="3.5" y="5.5" width="17" height="15" rx="1.5" />
        <path d="M3.5 10h17" />
        <g className="a-hop"><path d="M8 3v4M16 3v4" /></g>
        <path className="a-pop" d="M8 14h2M14 14h2M8 17h2" />
      </>);
    case 'grid':
      return (<>
        <rect className="a-q1" x="4" y="4" width="6.5" height="6.5" rx="1" />
        <rect className="a-q2" x="13.5" y="4" width="6.5" height="6.5" rx="1" />
        <rect className="a-q3" x="4" y="13.5" width="6.5" height="6.5" rx="1" />
        <rect className="a-q4" x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
      </>);
    case 'users':
      return (<>
        <circle cx="9" cy="8.5" r="3.2" />
        <path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
        <g className="a-slide"><circle cx="16.5" cy="9" r="2.5" /><path d="M16.5 14.2c2.1.2 3.6 1.7 4 4.3" /></g>
      </>);
    case 'chart':
      return (<>
        <circle cx="12" cy="12" r="8" opacity=".35" />
        <path className="a-arc" d="M12 4a8 8 0 1 1-7.6 10.5" pathLength={1} />
        <path d="M12 8.5V12l2.5 1.5" />
      </>);
    case 'feed':
      return (<>
        {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => (
          <rect key={`${r}${c}`} className={`a-w a-w${r + c}`} x={4 + c * 5.7} y={4 + r * 5.7} width="4.6" height="4.6" rx=".6" />
        )))}
      </>);
    case 'week':
      return (<>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path key={i} className={`a-w a-w${i % 4}`} d={`M${4.5 + i * 2.5} ${i === 2 ? 7 : 10}v${i === 2 ? 10 : 7}`} />
        ))}
      </>);
    case 'month':
      return (<>
        <rect x="3.5" y="4.5" width="17" height="16" rx="1.5" />
        <path d="M3.5 9h17M9.2 9v11.5M14.8 9v11.5M3.5 14.7h17" />
        <rect className="a-pop" x="10.2" y="10" width="3.6" height="3.7" fill="currentColor" stroke="none" />
      </>);
    case 'plus':
      return <g className="a-spin"><path d="M12 5v14M5 12h14" /></g>;
    case 'eye':
      return (<>
        <g className="a-blink">
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        </g>
      </>);
    case 'logout':
      return (<>
        <path d="M10 4.5H5.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H10" />
        <g className="a-nudge"><path d="M14 8l4 4-4 4M18 12H9" /></g>
      </>);
    case 'search':
      return (<g className="a-wiggle"><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></g>);
    case 'bell':
      return (<>
        <g className="a-swing">
          <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15Z" />
        </g>
        <path className="a-clap" d="M10 20.5a2 2 0 0 0 4 0" />
      </>);
    case 'download':
      return (<>
        <g className="a-drop"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /></g>
        <path d="M4.5 19.5h15" />
      </>);
    case 'check':
      return <path className="a-draw" d="M5 12.5 10 17.5 19.5 7" pathLength={1} strokeWidth={2} />;
    case 'pencil':
      return (<g className="a-write"><path d="M15.5 4.5l4 4L9 19H5v-4Z" /><path d="M13.5 6.5l4 4" /></g>);
    case 'x':
      return <g className="a-spin"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></g>;
    case 'send':
      return (<g className="a-fly"><path d="M20.5 3.5 3.5 10.5l7 3 3 7Z" /><path d="M20.5 3.5 10.5 13.5" /></g>);
    case 'link':
      return (<g className="a-tilt">
        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
      </g>);
    case 'chat':
      return (<>
        <path d="M4.5 18.5 5.6 15A7.5 7.5 0 1 1 9 18.3Z" />
        <g className="a-dots"><circle cx="9" cy="11.5" r=".6" fill="currentColor" /><circle cx="12" cy="11.5" r=".6" fill="currentColor" /><circle cx="15" cy="11.5" r=".6" fill="currentColor" /></g>
      </>);
    case 'left':
      return <g className="a-back"><path d="M19 12H5M11 6l-6 6 6 6" /></g>;
    case 'right':
      return <g className="a-nudge"><path d="M5 12h14M13 6l6 6-6 6" /></g>;
    case 'copy':
      return (<>
        <rect x="8.5" y="8.5" width="11" height="11" rx="1.2" />
        <g className="a-lift"><path d="M15.5 8.5V5.7a1.2 1.2 0 0 0-1.2-1.2H5.7a1.2 1.2 0 0 0-1.2 1.2v8.6a1.2 1.2 0 0 0 1.2 1.2h2.8" /></g>
      </>);
    case 'image':
      return (<>
        <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
        <circle className="a-pop" cx="9" cy="9.5" r="1.6" />
        <path className="a-hop" d="m4 17 5-5 4 4 2.5-2.5L20 18" />
      </>);
    case 'video':
      return (<>
        <rect x="3.5" y="6" width="12.5" height="12" rx="1.5" />
        <path className="a-nudge" d="m16 10.5 4.5-2.5v8L16 13.5" />
      </>);
    case 'trash':
      return (<>
        <g className="a-lid"><path d="M4.5 7h15M9.5 7V4.5h5V7" /></g>
        <path d="M6.5 7l1 13h9l1-13M10.5 11v5M13.5 11v5" />
      </>);
    case 'clock':
      return (<>
        <circle cx="12" cy="12" r="8" />
        <g className="a-hand"><path d="M12 7.5V12l3 2" /></g>
      </>);
    case 'inbox':
      return (<>
        <path d="M3.5 13.5 6 5.5h12l2.5 8v5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z" />
        <path d="M3.5 13.5h5l1 2h5l1-2h5" />
        <path className="a-drop" d="M12 3v6M9.8 6.8 12 9l2.2-2.2" />
      </>);
    case 'undo':
      return <g className="a-back"><path d="M9 7 4.5 11.5 9 16" /><path d="M4.5 11.5H15a4.5 4.5 0 0 1 0 9h-2" /></g>;
    case 'command':
      return (<g className="a-spin-slow">
        <path d="M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9Zm0 0h6m-6 0v6m6-6V6.5A2.5 2.5 0 1 1 17.5 9H15Zm0 0v6m0 0h2.5a2.5 2.5 0 1 1-2.5 2.5V15Zm0 0H9m0 0v2.5A2.5 2.5 0 1 1 6.5 15H9Z" />
      </g>);
  }
}

export default function Icon({ name, size = 18, className = '', title }: { name: IconName; size?: number; className?: string; title?: string }) {
  return (
    <svg
      className={`ic ic-${name} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      {...P}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      {paths(name)}
    </svg>
  );
}

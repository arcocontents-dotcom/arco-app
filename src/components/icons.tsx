import Icon from './Icon';
export const CheckIcon = ({ color = 'currentColor', size = 18, className }: { color?: string; size?: number; className?: string }) => (
  <svg className={`ic ${className ?? ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline className="a-draw" points="5 12.5 10 17 19 7" pathLength={1} />
  </svg>
);
export const XIcon = ({ color = 'currentColor', size = 16 }: { color?: string; size?: number }) => (
  <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
    <g className="a-spin"><path d="M6 6l12 12M18 6 6 18" /></g>
  </svg>
);
export const ArrowLeft = ({ size = 18 }: { size?: number }) => <Icon name="left" size={size} />;
export const ArrowRight = ({ size = 18 }: { size?: number }) => <Icon name="right" size={size} />;
export const PlayIcon = ({ size = 18, color = '#fff' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
    <polygon points="8 5 19 12 8 19 8 5" />
  </svg>
);
export const StackIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinejoin="round" aria-hidden="true">
    <rect x="7" y="7" width="13" height="13" rx="1" />
    <path d="M4 16V5a1 1 0 0 1 1-1h11" />
  </svg>
);

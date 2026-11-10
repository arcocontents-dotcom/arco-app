import type { ContentRecord } from '@/lib/notion';
import { contentThumb, cssUrl } from '@/lib/view';
import { dayLabel } from '@/lib/domain';
import { ArrowRight, PlayIcon } from './icons';

export default function ContentRow({ c, href, delay = 0 }: { c: ContentRecord; href: string; delay?: number }) {
  const tall = c.type === 'Reels' || c.type === 'Story';
  return (
    <a href={href} className="row-item rise" style={{ ['--d' as string]: `${delay}ms` }}>
      <div className={`thumb${tall ? ' tall' : ''}`} style={cssUrl(contentThumb(c))}>
        {tall && !contentThumb(c) && <PlayIcon size={14} />}
      </div>
      <div className="row-body">
        <span className="label">{c.day ? dayLabel(c.day) : 'Sem data'}{c.time ? ` · ${c.time}` : ''} · {c.type}</span>
        <span className="serif-title">{c.title}</span>
        <span className={`status s-${c.status}`}>{c.status}</span>
      </div>
      <ArrowRight size={16} />
    </a>
  );
}

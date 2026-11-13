'use client';

import { useEffect, useRef, useState } from 'react';

export interface Opt {
  name: string;
  color: string;
}

/** Etiqueta colorida igual à do Notion. */
export function Tag({ name, color, onRemove }: { name: string; color?: string; onRemove?: () => void }) {
  return (
    <span className={`ntag nc-${color ?? 'default'}`}>
      {name}
      {onRemove && (
        <button type="button" aria-label={`Tirar ${name}`} onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>
      )}
    </span>
  );
}

/**
 * Seletor no estilo Notion: mostra a etiqueta escolhida; ao clicar abre a lista
 * com busca e todas as opções coloridas. Só deixa escolher opções que já existem.
 */
export default function TagSelect({
  label, options, value, onChange, multiple = false, disabled = false
}: {
  label: string;
  options: Opt[];
  value: string | string[] | null;
  onChange: (v: string | null | string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const selected = multiple ? ((value as string[]) ?? []) : value ? [value as string] : [];
  const colorOf = (n: string) => options.find((o) => o.name === n)?.color ?? 'default';
  const list = options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function choose(n: string) {
    if (multiple) {
      const next = selected.includes(n) ? selected.filter((x) => x !== n) : [...selected, n];
      onChange(next);
    } else {
      onChange(selected[0] === n ? null : n);
      setOpen(false);
    }
    setQ('');
  }

  return (
    <div className="tsel" ref={box}>
      <button
        type="button"
        className="tsel-value"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {selected.length ? selected.map((n) => <Tag key={n} name={n} color={colorOf(n)} />) : <span className="tsel-empty">Vazio</span>}
      </button>
      {open && (
        <div className="tsel-pop" role="listbox" aria-label={label} aria-multiselectable={multiple || undefined}>
          <div className="tsel-current">
            {selected.map((n) => <Tag key={n} name={n} color={colorOf(n)} onRemove={() => choose(n)} />)}
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar opção…" aria-label={`Procurar em ${label}`}
              onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) { e.preventDefault(); choose(list[0].name); } if (e.key === 'Escape') setOpen(false); }} />
          </div>
          <p className="tsel-hint">Selecione uma opção</p>
          <ul>
            {list.map((o) => (
              <li key={o.name}>
                <button type="button" role="option" aria-selected={selected.includes(o.name)} onClick={() => choose(o.name)}>
                  <span className="tsel-grip" aria-hidden="true">⋮⋮</span>
                  <Tag name={o.name} color={o.color} />
                  {selected.includes(o.name) && <span className="tsel-check" aria-hidden="true">✓</span>}
                </button>
              </li>
            ))}
            {!list.length && <li className="tsel-none">Nenhuma opção com esse nome</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

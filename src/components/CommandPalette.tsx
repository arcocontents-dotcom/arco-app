'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon, { type IconName } from './Icon';

interface C { id: string; name: string; logo: string | null }
interface Item { key: string; label: string; hint: string; href: string; icon: IconName; words: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function CommandPalette({ clients, current }: { clients: C[]; current: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const [mac, setMac] = useState(true);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const cur = clients.find((c) => c.id === current) ?? null;
    const base: Item[] = [
      ...(cur ? [{ key: 'new-here', label: `Novo conteúdo · ${cur.name}`, hint: 'Criar', href: `/admin/conteudo/novo?c=${cur.id}`, icon: 'plus' as const, words: 'novo conteudo post reels story criar' }] : []),
      { key: 'cal', label: 'Calendário', hint: 'Ir para', href: '/admin', icon: 'calendar', words: 'calendario mes' },
      { key: 'pend', label: 'Pendências', hint: 'Ir para', href: '/admin/pendencias', icon: 'bell', words: 'pendencias atrasados ajustes reprovados alertas' },
      { key: 'gest', label: 'Gestão · Clientes', hint: 'Ir para', href: '/admin/gestao', icon: 'grid', words: 'gestao clientes todos' },
      { key: 'dash', label: 'Dashboard de produção', hint: 'Ir para', href: '/admin/gestao/dashboard', icon: 'chart', words: 'dashboard producao relatorio pdf porcentagem' },
      { key: 'newc', label: 'Novo cliente', hint: 'Criar', href: '/admin/clientes/novo', icon: 'users', words: 'novo cliente cadastrar' }
    ];
    for (const c of clients) {
      base.push(
        { key: `cal-${c.id}`, label: c.name, hint: 'Calendário', href: `/admin?c=${c.id}`, icon: 'calendar', words: `${c.name} calendario` },
        { key: `new-${c.id}`, label: `Novo conteúdo · ${c.name}`, hint: 'Criar', href: `/admin/conteudo/novo?c=${c.id}`, icon: 'plus', words: `${c.name} novo conteudo` },
        { key: `man-${c.id}`, label: `Gerenciar ${c.name}`, hint: 'Acessos e dados', href: `/admin/clientes/${c.id}`, icon: 'users', words: `${c.name} gerenciar acesso link logo instagram` },
        { key: `see-${c.id}`, label: `Ver como ${c.name}`, hint: 'Visão do cliente', href: `/c/${c.id}`, icon: 'eye', words: `${c.name} ver cliente aprovacao feed` }
      );
    }
    return base;
  }, [clients, current]);

  const list = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    const found = terms.length ? items.filter((i) => terms.every((t) => norm(`${i.label} ${i.words}`).includes(t))) : items.filter((i) => !/^(new|man|see)-/.test(i.key));
    return found.slice(0, 9);
  }, [q, items]);

  const go = (i: Item | undefined) => {
    if (!i) return;
    setOpen(false);
    router.push(i.href);
  };

  return (
    <>
      <button type="button" className="cmd-btn" onClick={() => setOpen(true)} aria-label="Buscar (atalho Command K)">
        <Icon name="search" size={16} />
        <span className="cmd-text">Buscar</span>
        <kbd>{mac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
      {open && (
        <div className="cmd-overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="cmd" role="dialog" aria-modal="true" aria-label="Buscar">
            <div className="cmd-input">
              <Icon name="search" size={18} />
              <input
                ref={input}
                value={q}
                placeholder="Buscar cliente ou ação…"
                aria-label="Buscar cliente ou ação"
                onChange={(e) => { setQ(e.target.value); setSel(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, list.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
                  if (e.key === 'Enter') { e.preventDefault(); go(list[sel]); }
                  if (e.key === 'Escape') setOpen(false);
                }}
              />
              <kbd>esc</kbd>
            </div>
            <ul className="cmd-list" role="listbox">
              {list.map((i, n) => (
                <li key={i.key} role="option" aria-selected={n === sel}>
                  <button type="button" onMouseEnter={() => setSel(n)} onClick={() => go(i)}>
                    <Icon name={i.icon} />
                    <span className="cmd-label">{i.label}</span>
                    <span className="cmd-hint">{i.hint}</span>
                  </button>
                </li>
              ))}
              {!list.length && <li className="cmd-empty">Nada encontrado.</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

'use client';

import Icon from './Icon';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { submitReview, togglePosted } from '@/app/actions/review';
import { CheckIcon, XIcon } from './icons';
import type { DecisionStatus, GeneralStatus, ItemStatus } from '@/lib/domain';

const NOTE_MAX = 280;

export interface PanelItem {
  key: string;
  label: string;
  status: ItemStatus;
  note: string;
  /** Mídia grande mostrada acima da aprovação deste item (vídeo, capa, legenda…). */
  media?: ReactNode;
  /** O que o cliente precisa fazer antes de aprovar: assistir ao vídeo ou passar todas as artes. */
  mustSee?: 'play' | 'swipe' | null;
}

const MUST_SEE_TEXT = { play: 'Assista ao vídeo antes de aprovar.', swipe: 'Passe todas as artes do carrossel antes de aprovar.' };

/** "Capa", "Capa e Legenda", "Vídeo, Capa e Legenda" */
const joinPt = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

type Draft = Record<string, { status: DecisionStatus | null; note: string }>;

const STATUS_TEXT: Record<string, string> = {
  Pendente: 'Pendente',
  Aprovado: 'Aprovado',
  Ajuste: 'Ajuste pedido',
  Reprovado: 'Reprovado'
};

export default function ReviewPanel({
  contentId,
  items,
  canApprove,
  isAdmin,
  status,
  answeredBy
}: {
  contentId: string;
  items: PanelItem[];
  canApprove: boolean;
  isAdmin: boolean;
  status: GeneralStatus;
  answeredBy: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<GeneralStatus>(status);
  const answered = items.every((i) => i.status !== 'Pendente');
  const [editing, setEditing] = useState(!answered);
  const [draft, setDraft] = useState<Draft>(() =>
    Object.fromEntries(items.map((i) => [i.key, { status: i.status === 'Pendente' ? null : i.status, note: i.note }]))
  );

  const posted = current === 'Postado';
  const locked = posted || !canApprove;
  // O que o cliente já viu de verdade (vídeo tocado / carrossel até o fim).
  const [seen, setSeen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.key, !i.mustSee || i.status !== 'Pendente']))
  );
  const [warn, setWarn] = useState<Record<string, string>>({});
  const [missingMsg, setMissingMsg] = useState<string | null>(null);
  const [leaveTo, setLeaveTo] = useState<{ href: string } | { form: HTMLFormElement } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const blocks = useRef<Record<string, HTMLDivElement | null>>({});
  const markSeen = useCallback((key: string) => {
    setSeen((v) => (v[key] ? v : { ...v, [key]: true }));
    setWarn((w) => (w[key] ? { ...w, [key]: '' } : w));
  }, []);

  const set = (key: string, patch: Partial<Draft[string]>) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  const toggle = (key: string, s: DecisionStatus) => {
    const it = items.find((i) => i.key === key)!;
    if (s === 'Aprovado' && draft[key].status !== 'Aprovado' && it.mustSee && !seen[key] && !isAdmin) {
      setWarn((w) => ({ ...w, [key]: MUST_SEE_TEXT[it.mustSee!] }));
      return;
    }
    setMissingMsg(null);
    set(key, { status: draft[key].status === s ? null : s });
  };

  const decided = items.filter((i) => draft[i.key].status).length;
  const missingNote = items.find((i) => draft[i.key].status === 'Ajuste' && !draft[i.key].note.trim());
  const ready = decided === items.length && !missingNote;
  const missing = items.filter((i) => !draft[i.key].status);
  // Enquanto o cliente está respondendo, não deixa sair sem enviar.
  const guard = canApprove && !isAdmin && editing && !locked && !pending;

  useEffect(() => {
    if (!guard) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo({ href: url.pathname + url.search });
    };
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      if (!f.closest('.review-stack')) {
        e.preventDefault();
        setLeaveTo({ form: f });
      }
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, [guard]);

  function goToFirstMissing() {
    const first = missing[0] ?? missingNote;
    if (!first) return;
    blocks.current[first.key]?.querySelector('.approval-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlash(first.key);
    setTimeout(() => setFlash(null), 1400);
  }

  function leave() {
    const to = leaveTo;
    setLeaveTo(null);
    if (!to) return;
    window.onbeforeunload = null;
    if ('href' in to) {
      setEditing(false);
      setTimeout(() => router.push(to.href), 40);
    } else {
      setEditing(false);
      setTimeout(() => to.form.submit(), 40);
    }
  }

  const helper = useMemo(() => {
    if (missingNote) return `Escreva o ajuste de ${missingNote.label}.`;
    if (ready) return 'Tudo certo. Pode enviar.';
    return 'Veja e responda cada item: aprovar, ajustar ou reprovar.';
  }, [missingNote, ready]);

  function send() {
    if (pending) return;
    if (!ready) {
      setMissingMsg(
        missing.length
          ? `Falta olhar e responder: ${joinPt(missing.map((i) => i.label))}.`
          : `Escreva o ajuste de ${missingNote!.label}.`
      );
      goToFirstMissing();
      return;
    }
    setMissingMsg(null);
    setError(null);
    const payload = Object.fromEntries(items.map((i) => [i.key, { status: draft[i.key].status!, note: draft[i.key].note }]));
    start(async () => {
      const r = await submitReview(contentId, payload);
      if (!r.ok) return setError(r.error);
      setCurrent(r.status);
      setEditing(false);
      router.refresh();
    });
  }

  function markPosted(next: boolean) {
    setError(null);
    start(async () => {
      const r = await togglePosted(contentId, next);
      if (!r.ok) return setError(r.error);
      setCurrent(r.status);
      router.refresh();
    });
  }

  const counts = {
    ok: items.filter((i) => draft[i.key].status === 'Aprovado').length,
    adj: items.filter((i) => draft[i.key].status === 'Ajuste').length,
    rej: items.filter((i) => draft[i.key].status === 'Reprovado').length
  };

  return (
    <section aria-label={canApprove ? 'Sua aprovação' : 'Status'} className="review-stack">

      {!canApprove && !isAdmin && (
        <p className="hint" style={{ padding: '8px 0' }}>Seu acesso é só de visualização. Quem aprova recebe o mesmo link.</p>
      )}

      {items.map((it, idx) => {
        const d = draft[it.key];
        const shown = editing && !locked ? d.status : (it.status === 'Pendente' ? null : it.status);
        const statusLabel = shown ? STATUS_TEXT[shown] : 'Pendente';
        const statusClass = shown ? `s-${shown}` : 's-Pendente';
        const editable = editing && !locked;
        const showNote = editable && (d.status === 'Ajuste' || d.status === 'Reprovado');
        const savedNote = !editable && it.note && (it.status === 'Ajuste' || it.status === 'Reprovado');
        return (
          <div
            key={it.key}
            ref={(el) => { blocks.current[it.key] = el; }}
            className={`review-block rise${flash === it.key ? ' flash' : ''}`}
            style={{ ['--d' as string]: `${120 + idx * 110}ms` }}
            onPlayCapture={() => it.mustSee === 'play' && markSeen(it.key)}
            onClickCapture={(e) => {
              if (it.mustSee === 'play' && (e.target as Element).closest('.frame-916')) markSeen(it.key);
            }}
            onScrollCapture={(e) => {
              const el = e.target as HTMLElement;
              if (it.mustSee === 'swipe' && el.classList?.contains('track') && el.scrollLeft + el.clientWidth >= el.scrollWidth - 8) markSeen(it.key);
            }}
          >
            {items.length > 1 && (
              <div className="block-title">
                <span className="num">{String(idx + 1).padStart(2, '0')}</span>
                <span className="label strong">{it.label}</span>
              </div>
            )}
            {it.media}
          <div className="approval-row">
            <div className="approval-head">
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="display md">{it.label}</span>
                <span className={`status ${statusClass}`}>{statusLabel}</span>
              </div>
              {editable && (
                <>
                  <button
                    type="button"
                    className="adj-btn rej"
                    aria-pressed={d.status === 'Reprovado'}
                    aria-label={`Reprovar ${it.label}`}
                    onClick={() => toggle(it.key, 'Reprovado')}
                    style={{ width: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <XIcon />
                  </button>
                  <button type="button" className="adj-btn" aria-pressed={d.status === 'Ajuste'} onClick={() => toggle(it.key, 'Ajuste')}>
                    <Icon name="pencil" size={14} />Ajustar
                  </button>
                  <button
                    type="button"
                    className="check"
                    aria-pressed={d.status === 'Aprovado'}
                    aria-label={d.status === 'Aprovado' ? `Desmarcar aprovação de ${it.label}` : `Aprovar ${it.label}`}
                    onClick={() => toggle(it.key, 'Aprovado')}
                  >
                    {d.status === 'Aprovado' ? <CheckIcon className="pop" color="#fff" /> : <CheckIcon color="#A9A6A1" />}
                  </button>
                </>
              )}
            </div>
            {editable && warn[it.key] && (
              <p role="alert" className="see-warn rise"><Icon name={it.mustSee === 'play' ? 'video' : 'image'} size={16} className="ic-play" />{warn[it.key]}</p>
            )}
            {showNote && (
              <div className="field rise" style={{ paddingTop: 14 }}>
                <label htmlFor={`n-${it.key}`} className="label">
                  {d.status === 'Ajuste' ? `O que ajustar em ${it.label.toLowerCase()}?` : 'Motivo (opcional)'}
                </label>
                <textarea
                  id={`n-${it.key}`}
                  className="textarea boxed"
                  rows={3}
                  maxLength={NOTE_MAX}
                  value={d.note}
                  onChange={(e) => set(it.key, { note: e.target.value.slice(0, NOTE_MAX) })}
                  placeholder={d.status === 'Ajuste' ? 'Escreva aqui o ajuste…' : 'Se quiser, conte o porquê…'}
                />
                <span className="hint" style={{ alignSelf: 'flex-end' }}>{d.note.length} / {NOTE_MAX}</span>
              </div>
            )}
            {savedNote && <p className="hint" style={{ paddingTop: 10, whiteSpace: 'pre-wrap' }}>“{it.note}”</p>}
          </div>
          </div>
        );
      })}

      {error && <p role="alert" className="error" style={{ paddingTop: 14 }}>{error}</p>}

      {editing && !locked && (
        <div className="rise" style={{ padding: '24px 0 8px', display: 'flex', flexDirection: 'column', gap: 12, ['--d' as string]: '620ms' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="label">Respondidos</span>
            <span className="label">{decided} de {items.length}</span>
          </div>
          <div className="progress"><i style={{ width: `${Math.round((decided / items.length) * 100)}%` }} /></div>
          {missingMsg && (
            <p role="alert" className="missing-warn rise"><Icon name="bell" size={16} className="ic-play" />{missingMsg}</p>
          )}
          <button type="button" className={`btn block${ready ? '' : ' not-ready'}`} onClick={send} disabled={pending} data-ready={ready ? "sim" : "nao"}>
            <Icon name="send" size={16} className={pending ? 'ic-play' : ''} />{pending ? 'Enviando…' : isAdmin ? 'Salvar respostas' : 'Enviar para a Arco'}
          </button>
          <p className="hint" style={{ textAlign: 'center' }}>{helper}</p>
          {answered && (
            <button type="button" className="link-btn" onClick={() => setEditing(false)} style={{ alignSelf: 'center' }}>Cancelar</button>
          )}
        </div>
      )}

      {!editing && !posted && (
        <div className="done-card rise" style={{ marginTop: 24 }}>
          <Icon name="check" size={30} className="ic-play done-ic" />
          <span className="label" style={{ color: '#bdbab4' }}>Respondido{answeredBy ? ` por ${answeredBy}` : ''}</span>
          <span className="display" style={{ fontSize: 26 }}>
            {current === 'Aprovado' ? 'Tudo aprovado' : current === 'Reprovado' ? 'Reprovado' : current === 'Ajustes' ? 'Ajustes pedidos' : 'Enviado'}
          </span>
          <span style={{ fontSize: 13, color: '#d9d6d1' }}>
            {counts.ok} aprovado(s) · {counts.adj} ajuste(s) · {counts.rej} reprovado(s). Atualizado no Notion, na pasta do cliente.
          </span>
          {canApprove && (
            <button type="button" className="link-btn" style={{ color: '#fff', alignSelf: 'flex-start' }} onClick={() => setEditing(true)}>
              Editar respostas
            </button>
          )}
        </div>
      )}

      {posted && (
        <div className="done-card rise" style={{ marginTop: 24 }}>
          <Icon name="send" size={28} className="ic-play done-ic" />
          <span className="label" style={{ color: '#bdbab4' }}>Publicado</span>
          <span className="display" style={{ fontSize: 26 }}>Conteúdo postado</span>
        </div>
      )}

      {leaveTo && createPortal(
        <div className="leave-overlay" role="dialog" aria-modal="true" aria-labelledby="leave-t" onMouseDown={(e) => e.target === e.currentTarget && setLeaveTo(null)}>
          <div className="leave-box">
            <Icon name="bell" size={28} className="ic-play" />
            <h2 id="leave-t" className="display" style={{ fontSize: 26, margin: 0 }}>Você ainda não terminou</h2>
            <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.5 }}>
              {missing.length
                ? <>Falta olhar e responder: <strong style={{ color: 'var(--ink)' }}>{joinPt(missing.map((i) => i.label))}</strong>. Suas respostas só chegam na Arco quando você tocar em Enviar.</>
                : <>Você respondeu tudo, mas ainda não enviou. Suas respostas só chegam na Arco quando você tocar em Enviar.</>}
            </p>
            <button type="button" className="btn block" autoFocus onClick={() => { setLeaveTo(null); if (ready) document.querySelector<HTMLButtonElement>('.review-stack .btn.block')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); else goToFirstMissing(); }}>
              Continuar revisando
            </button>
            <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={leave}>Sair sem enviar</button>
          </div>
        </div>
      , document.body)}

      {isAdmin && (
        <div style={{ paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" className={`btn block ${posted ? 'outline' : ''}`} onClick={() => markPosted(!posted)} disabled={pending}>
            <Icon name={posted ? 'undo' : 'send'} size={16} />{posted ? 'Desmarcar postado' : 'Marcar como postado'}
          </button>
          <p className="hint" style={{ textAlign: 'center' }}>Só o administrador vê esta opção.</p>
        </div>
      )}
    </section>
  );
}

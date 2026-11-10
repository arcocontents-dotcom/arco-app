'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitReview, togglePosted } from '@/app/actions/review';
import { CheckIcon, XIcon } from './icons';
import type { DecisionStatus, GeneralStatus, ItemStatus } from '@/lib/domain';

const NOTE_MAX = 280;

export interface PanelItem {
  key: string;
  label: string;
  status: ItemStatus;
  note: string;
}

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

  const set = (key: string, patch: Partial<Draft[string]>) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  const toggle = (key: string, s: DecisionStatus) => set(key, { status: draft[key].status === s ? null : s });

  const decided = items.filter((i) => draft[i.key].status).length;
  const missingNote = items.find((i) => draft[i.key].status === 'Ajuste' && !draft[i.key].note.trim());
  const ready = decided === items.length && !missingNote;

  const helper = useMemo(() => {
    if (missingNote) return `Escreva o ajuste de ${missingNote.label}.`;
    if (ready) return 'Tudo certo. Pode enviar.';
    return 'Aprove, peça ajuste ou reprove cada item.';
  }, [missingNote, ready]);

  function send() {
    if (!ready || pending) return;
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
    <section aria-labelledby="aprov">
      <h2 id="aprov" className="label rise" style={{ ['--d' as string]: '320ms', marginBottom: 4 }}>
        {canApprove ? 'Sua aprovação' : 'Status'}
      </h2>

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
          <div key={it.key} className="approval-row rise" style={{ ['--d' as string]: `${380 + idx * 90}ms` }}>
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
                    Ajustar
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
          <button type="button" className="btn block" onClick={send} disabled={!ready || pending} aria-disabled={!ready || pending}>
            {pending ? 'Enviando…' : isAdmin ? 'Salvar respostas' : 'Enviar para a Arco'}
          </button>
          <p className="hint" style={{ textAlign: 'center' }}>{helper}</p>
          {answered && (
            <button type="button" className="link-btn" onClick={() => setEditing(false)} style={{ alignSelf: 'center' }}>Cancelar</button>
          )}
        </div>
      )}

      {!editing && !posted && (
        <div className="done-card rise" style={{ marginTop: 24 }}>
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
          <span className="label" style={{ color: '#bdbab4' }}>Publicado</span>
          <span className="display" style={{ fontSize: 26 }}>Conteúdo postado</span>
        </div>
      )}

      {isAdmin && (
        <div style={{ paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" className={`btn block ${posted ? 'outline' : ''}`} onClick={() => markPosted(!posted)} disabled={pending}>
            {posted ? 'Desmarcar postado' : 'Marcar como postado'}
          </button>
          <p className="hint" style={{ textAlign: 'center' }}>Só o administrador vê esta opção.</p>
        </div>
      )}
    </section>
  );
}

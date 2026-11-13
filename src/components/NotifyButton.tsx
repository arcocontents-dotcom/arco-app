'use client';

import { useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Icon from './Icon';
import { formatPhone } from '@/lib/domain';
import { notifyContentAction, notifyInfoAction, type NotifyInfo } from '@/app/admin/actions';

type Info = Extract<NotifyInfo, { ok: true }>;

const digits = (p: string) => p.replace(/\D/g, '');
const isPhoneDevice = () =>
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * "Avisar cliente" de UM conteúdo: WhatsApp direto no número do cliente, Google Mensagens (SMS)
 * ou aviso no app. A mensagem já vai pronta com o nome do post e o link direto dele.
 */
export default function NotifyButton({
  contentId,
  clientId,
  title,
  compact = false,
  block = false
}: {
  contentId: string;
  clientId: string;
  title: string;
  compact?: boolean;
  block?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, startLoad] = useTransition();
  const [pushing, startPush] = useTransition();

  const openMenu = () => {
    setOpen(true);
    setNote(null);
    setError(null);
    startLoad(async () => {
      const r = await notifyInfoAction(contentId);
      if (r.ok) setInfo(r);
      else setError(r.error);
    });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const sms = async () => {
    if (!info) return;
    if (isPhoneDevice()) {
      window.location.href = `sms:${info.phone}?body=${encodeURIComponent(info.message)}`;
      return;
    }
    // No computador: copia a mensagem e abre o Google Mensagens para a web.
    const ok = await copy(info.message);
    window.open('https://messages.google.com/web/conversations/new', '_blank', 'noopener');
    setNote({ ok, text: ok ? `Mensagem copiada. Escolha ${info.clientName} e cole (⌘V).` : 'Copie a mensagem abaixo e cole no Google Mensagens.' });
  };

  const push = () =>
    startPush(async () => {
      const r = await notifyContentAction(contentId);
      setNote(r.ok ? { ok: true, text: `Aviso enviado · ${r.sent} aparelho${r.sent > 1 ? 's' : ''}` } : { ok: false, text: r.error ?? 'Não deu certo.' });
    });

  const trigger = compact ? (
    <button type="button" className="card-notify" onClick={openMenu} aria-label={`Avisar cliente sobre ${title}`} title="Avisar cliente sobre este conteúdo">
      <Icon name="bell" size={14} />
    </button>
  ) : (
    <button type="button" className={`btn outline${block ? ' block' : ' small'}`} onClick={openMenu} title={`Avisar o cliente sobre "${title}"`}>
      <Icon name="bell" size={16} />Avisar cliente
    </button>
  );

  return (
    <>
      {trigger}
      {open &&
        createPortal(
          <div className="leave-overlay" role="dialog" aria-modal="true" aria-label="Avisar cliente" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
            <div className="leave-box notify-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span className="label">Avisar cliente · {title}</span>
                <button type="button" className="icon-btn" aria-label="Fechar" onClick={() => setOpen(false)}><Icon name="x" /></button>
              </div>

              {loading && !info && !error && (
                <div className="report-working"><span className="spinner" aria-hidden="true" /><p style={{ margin: 0 }}>Preparando a mensagem…</p></div>
              )}
              {error && <p className="error" role="alert">{error}</p>}

              {info && (
                <>
                  {info.draft && <p className="error" role="alert">É rascunho: o cliente ainda não vê. Mude para Aguardando antes de avisar.</p>}
                  {!info.phone && (
                    <p className="hint" style={{ margin: 0 }}>
                      Sem celular cadastrado para {info.clientName}.{' '}
                      <Link href={`/admin/clientes/${clientId}#phone`} className="link-btn">Cadastrar celular</Link>
                    </p>
                  )}
                  <div className="notify-opts">
                    <a
                      className="notify-opt"
                      href={`https://wa.me/${info.phone ? digits(info.phone) : ''}?text=${encodeURIComponent(info.message)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="notify-ic wa"><Icon name="chat" size={18} /></span>
                      <span><strong>WhatsApp</strong><small>{info.phone ? `Direto para ${formatPhone(info.phone)}` : 'Você escolhe o contato'}</small></span>
                    </a>
                    <button type="button" className="notify-opt" onClick={sms} disabled={!info.phone} title={info.phone ? undefined : 'Cadastre o celular do cliente'}>
                      <span className="notify-ic gm"><Icon name="send" size={18} /></span>
                      <span><strong>Google Mensagens</strong><small>{info.phone ? 'SMS / RCS com a mensagem pronta' : 'Precisa do celular cadastrado'}</small></span>
                    </button>
                    <button type="button" className="notify-opt" onClick={push} disabled={pushing || !info.devices || info.draft}>
                      <span className="notify-ic app"><Icon name="bell" size={18} className={pushing ? 'ic-play' : ''} /></span>
                      <span>
                        <strong>{pushing ? 'Avisando…' : 'Aviso no app'}</strong>
                        <small>{info.devices ? `${info.devices} aparelho${info.devices > 1 ? 's' : ''} com avisos ativos` : 'O cliente ainda não ativou os avisos'}</small>
                      </span>
                    </button>
                  </div>
                  {note && <p className={note.ok ? 'hint ic-inline' : 'error'} role="status" style={{ margin: 0 }}>{note.ok && <Icon name="check" size={14} className="ic-play" />}{note.text}</p>}
                  <pre className="report-msg">{info.message}</pre>
                  <button
                    type="button"
                    className="btn outline small"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={async () => setNote((await copy(info.message)) ? { ok: true, text: 'Mensagem copiada.' } : { ok: false, text: 'Não deu para copiar.' })}
                  >
                    <Icon name="copy" size={15} />Copiar mensagem
                  </button>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

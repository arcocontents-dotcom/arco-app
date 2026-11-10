'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteContentAction, saveContentAction, type ContentPayload } from '@/app/admin/actions';
import type { ContentType } from '@/lib/domain';
import { ArrowLeft, ArrowRight, XIcon } from './icons';
import { compressVideo } from './compressVideo';

const TYPES: ContentType[] = ['Reels', 'Post', 'Carrossel', 'Story'];
const CAPTION_MAX = 2200;
const VIDEO_MAX_MB = 2000;
const SMALL_ENOUGH_MB = 60;
const VIDEO_TYPES = ['video/mp4', 'video/quicktime'];

function put(url: string, body: Blob | FormData, method: 'PUT' | 'POST', contentType: string | null, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method, url);
    if (contentType) x.setRequestHeader('Content-Type', contentType);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`Falha no envio (${x.status})`)));
    x.onerror = () => reject(new Error('Falha de conexão no envio'));
    x.send(body);
  });
}

/** Reduz a imagem para no máximo 2160px e JPEG 88%: leve, sem perder qualidade visível. */
async function compress(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Use JPG, PNG ou WEBP.');
  const bmp = await createImageBitmap(file);
  const max = 2160;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
  if (!blob) throw new Error('Não foi possível preparar a imagem.');
  return blob;
}

async function uploadImage(file: File, onProgress: (p: number) => void): Promise<string> {
  const blob = await compress(file);
  const res = await fetch('/api/upload/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: 'image/jpeg' })
  });
  const j = (await res.json()) as { uploadURL?: string; publicUrl?: string; error?: string };
  if (!res.ok || !j.uploadURL || !j.publicUrl) throw new Error(j.error ?? 'Envio indisponível.');
  await put(j.uploadURL, blob, 'PUT', 'image/jpeg', onProgress);
  return j.publicUrl;
}

async function uploadVideo(
  file: File,
  onProgress: (p: number) => void,
  onStage: (s: string) => void
): Promise<string> {
  if (!VIDEO_TYPES.includes(file.type)) throw new Error('Envie o vídeo em MP4 ou MOV.');
  if (file.size > VIDEO_MAX_MB * 1024 * 1024) throw new Error(`O vídeo pode ter até ${VIDEO_MAX_MB / 1000} GB.`);
  let blob: Blob = file;
  if (file.size > SMALL_ENOUGH_MB * 1024 * 1024) {
    onStage('Deixando o vídeo leve');
    blob = await compressVideo(file, onProgress);
    onProgress(0);
  }
  onStage('Enviando');
  const res = await fetch('/api/upload/video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: blob.type || file.type })
  });
  const j = (await res.json()) as { mode?: 'stream' | 'file'; uploadURL?: string; url?: string; error?: string };
  if (!res.ok || !j.uploadURL || !j.url) throw new Error(j.error ?? 'Envio indisponível.');
  if (j.mode === 'stream') {
    const fd = new FormData();
    fd.append('file', blob);
    await put(j.uploadURL, fd, 'POST', null, onProgress);
  } else {
    await put(j.uploadURL, blob, 'PUT', blob.type || file.type, onProgress);
  }
  return j.url;
}

function useUploader() {
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState('Enviando');
  const [error, setError] = useState<string | null>(null);
  async function run<T>(fn: (p: (n: number) => void, s: (t: string) => void) => Promise<T>): Promise<T | null> {
    setError(null);
    setStage('Enviando');
    setProgress(0);
    try {
      return await fn((n) => setProgress(n), setStage);
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setProgress(null);
    }
  }
  return { progress, stage, error, run };
}

function Picker({
  accept, label, tall, onFile, multiple
}: { accept: string; label: string; tall?: boolean; onFile: (f: File[]) => void; multiple?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={`drop${tall ? ' tall' : ''}`} onClick={() => ref.current?.click()}>
        <span style={{ fontSize: 20 }}>+</span>
        {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFile(files);
        }}
      />
    </>
  );
}

export interface ContentFormProps {
  clients: { id: string; name: string }[];
  initial: Omit<ContentPayload, 'publish' | 'resetApprovals'> & { status?: string };
  videoThumb?: string | null;
}

export default function ContentForm({ clients, initial, videoThumb }: ContentFormProps) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [reset, setReset] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const up = useUploader();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const editing = !!f.id;
  const answered = editing && initial.status && !['Rascunho', 'Aguardando'].includes(initial.status);

  function save(publish: boolean) {
    setError(null);
    start(async () => {
      const r = await saveContentAction({ ...f, publish, resetApprovals: reset });
      if (!r.ok) return setError(r.error);
      router.push(publish ? `/c/${f.clientId}/${r.id}` : `/admin?c=${f.clientId}&m=${f.day}`);
      router.refresh();
    });
  }

  function remove() {
    if (!f.id) return;
    start(async () => {
      const r = await deleteContentAction(f.id!);
      if (!r.ok) return setError(r.error);
      router.push(`/admin?c=${f.clientId}`);
      router.refresh();
    });
  }

  const moveArt = (i: number, d: number) => {
    const a = [...f.artUrls];
    const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    set('artUrls', a);
  };

  const busy = pending || up.progress !== null;

  return (
    <form className="form-grid" style={{ alignItems: 'start' }} onSubmit={(e) => e.preventDefault()}>
      <section className="panel rise" style={{ ['--d' as string]: '100ms' }}>
        <div className="field">
          <label className="label" htmlFor="cl">Cliente</label>
          <select id="cl" className="select" value={f.clientId} onChange={(e) => set('clientId', e.target.value)}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="ti">Título</label>
          <input id="ti" className="input" value={f.title} maxLength={200} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Antes e depois" />
        </div>
        <div style={{ display: 'flex', gap: 18 }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="dt">Data</label>
            <input id="dt" type="date" className="input" value={f.day} onChange={(e) => set('day', e.target.value)} />
          </div>
          <div className="field" style={{ width: 120 }}>
            <label className="label" htmlFor="hr">Hora</label>
            <input id="hr" type="time" className="input" value={f.time} onChange={(e) => set('time', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <span className="label" id="tp">Formato</span>
          <div className="chip-row" role="group" aria-labelledby="tp">
            {TYPES.map((t) => (
              <button key={t} type="button" className="chip" aria-pressed={f.type === t} onClick={() => set('type', t)}>{t}</button>
            ))}
          </div>
        </div>
        {f.type !== 'Story' && (
          <div className="field">
            <label className="label" htmlFor="lg">Legenda</label>
            <textarea id="lg" className="textarea boxed" rows={8} maxLength={CAPTION_MAX} value={f.caption} onChange={(e) => set('caption', e.target.value)} />
            <span className="hint" style={{ alignSelf: 'flex-end' }}>{f.caption.length} / {CAPTION_MAX}</span>
          </div>
        )}
      </section>

      <section className="panel rise" style={{ ['--d' as string]: '160ms' }}>
        <h2 className="label">Mídia</h2>

        {(f.type === 'Reels' || f.type === 'Story') && (
          <div className="field">
            <span className="label">{f.type === 'Story' ? 'Vídeo do story (ou imagem abaixo)' : 'Vídeo'}</span>
            <div className="uploads">
              {f.videoUrl ? (
                <div className="upl tall" style={videoThumb ? { backgroundImage: `url(${videoThumb})` } : { background: '#2b2a28' }}>
                  {!videoThumb && !/cloudflarestream|videodelivery/.test(f.videoUrl) && (
                    <video src={`${f.videoUrl}#t=0.5`} muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  <span className="label" style={{ position: 'absolute', top: 8, left: 8, color: '#fff' }}>Vídeo enviado</span>
                  <div className="tools"><button type="button" onClick={() => set('videoUrl', '')} aria-label="Remover vídeo"><XIcon size={14} /></button></div>
                </div>
              ) : (
                <Picker accept="video/mp4,video/quicktime" tall label="Enviar vídeo" onFile={async ([file]) => {
                  const u = await up.run((p, st) => uploadVideo(file, p, st));
                  if (u) { set('videoUrl', u); if (f.type === 'Story') set('storyImageUrl', ''); }
                }} />
              )}
            </div>
            <p className="hint">MP4 ou MOV, até 2 GB. Vídeos grandes são comprimidos aqui mesmo, antes do envio, para abrir leve no celular do cliente. Use o Chrome no computador.</p>
          </div>
        )}

        {f.type === 'Reels' && (
          <div className="field">
            <span className="label">Capa</span>
            <div className="uploads">
              {f.coverUrl ? (
                <div className="upl tall" style={{ backgroundImage: `url(${f.coverUrl})` }}>
                  <div className="tools"><button type="button" onClick={() => set('coverUrl', '')} aria-label="Remover capa"><XIcon size={14} /></button></div>
                </div>
              ) : (
                <Picker accept="image/jpeg,image/png,image/webp" tall label="Enviar capa" onFile={async ([file]) => {
                  const u = await up.run((p) => uploadImage(file, p));
                  if (u) set('coverUrl', u);
                }} />
              )}
            </div>
          </div>
        )}

        {f.type === 'Story' && !f.videoUrl && (
          <div className="field">
            <span className="label">Imagem do story</span>
            <div className="uploads">
              {f.storyImageUrl ? (
                <div className="upl tall" style={{ backgroundImage: `url(${f.storyImageUrl})` }}>
                  <div className="tools"><button type="button" onClick={() => set('storyImageUrl', '')} aria-label="Remover imagem"><XIcon size={14} /></button></div>
                </div>
              ) : (
                <Picker accept="image/jpeg,image/png,image/webp" tall label="Enviar imagem" onFile={async ([file]) => {
                  const u = await up.run((p) => uploadImage(file, p));
                  if (u) set('storyImageUrl', u);
                }} />
              )}
            </div>
          </div>
        )}

        {(f.type === 'Post' || f.type === 'Carrossel') && (
          <div className="field">
            <span className="label">{f.type === 'Post' ? 'Arte' : 'Artes, na ordem do carrossel'}</span>
            <div className="uploads">
              {f.artUrls.map((u, i) => (
                <div key={u + i} className="upl" style={{ backgroundImage: `url(${u})` }}>
                  <span className="label" style={{ position: 'absolute', top: 6, left: 6, background: '#fff', padding: '2px 6px', color: '#111' }}>{i + 1}</span>
                  <div className="tools">
                    {f.type === 'Carrossel' && <button type="button" onClick={() => moveArt(i, -1)} aria-label={`Mover arte ${i + 1} para trás`}><ArrowLeft size={14} /></button>}
                    <button type="button" onClick={() => set('artUrls', f.artUrls.filter((_, k) => k !== i))} aria-label={`Remover arte ${i + 1}`}><XIcon size={14} /></button>
                    {f.type === 'Carrossel' && <button type="button" onClick={() => moveArt(i, 1)} aria-label={`Mover arte ${i + 1} para frente`}><ArrowRight size={14} /></button>}
                  </div>
                </div>
              ))}
              {(f.type === 'Carrossel' ? f.artUrls.length < 20 : f.artUrls.length < 1) && (
                <Picker accept="image/jpeg,image/png,image/webp" multiple={f.type === 'Carrossel'} label={f.type === 'Post' ? 'Enviar arte' : 'Adicionar artes'} onFile={async (files) => {
                  const list = f.type === 'Post' ? files.slice(0, 1) : files.slice(0, 20 - f.artUrls.length);
                  const added: string[] = [];
                  for (const file of list) {
                    const u = await up.run((p) => uploadImage(file, p));
                    if (u) added.push(u);
                  }
                  setF((x) => ({ ...x, artUrls: [...x.artUrls, ...added] }));
                }} />
              )}
            </div>
          </div>
        )}

        {up.progress !== null && (
          <div className="field">
            <span className="label">{up.stage}… {Math.round(up.progress * 100)}%</span>
            <span className="hint">Não feche esta aba até terminar.</span>
            <div className="bar"><i style={{ width: `${up.progress * 100}%` }} /></div>
          </div>
        )}
        {up.error && <p className="error" role="alert">{up.error}</p>}
      </section>

      <section className="panel rise" style={{ ['--d' as string]: '220ms', gridColumn: '1 / -1' }}>
        {answered && (
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
            <input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} />
            Pedir nova aprovação ao cliente (as respostas atuais são zeradas)
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" className="btn" disabled={busy} onClick={() => save(true)}>
            {pending ? 'Salvando…' : editing && !answered && initial.status !== 'Rascunho' ? 'Salvar' : 'Enviar para aprovação'}
          </button>
          <button type="button" className="btn outline" disabled={busy} onClick={() => save(false)}>Salvar como rascunho</button>
          <div style={{ flex: 1 }} />
          {editing && !confirmDel && (
            <button type="button" className="link-btn" onClick={() => setConfirmDel(true)} disabled={busy}>Excluir</button>
          )}
          {editing && confirmDel && (
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="hint">Mover para a lixeira do Notion?</span>
              <button type="button" className="btn small" onClick={remove} disabled={busy}>Sim, excluir</button>
              <button type="button" className="link-btn" onClick={() => setConfirmDel(false)}>Cancelar</button>
            </span>
          )}
        </div>
        <p className="hint">Rascunhos ficam só no painel. Ao enviar para aprovação, o conteúdo aparece para o cliente e no Notion.</p>
      </section>
    </form>
  );
}

'use client';

import { useState } from 'react';
import { compressVideo } from './compressVideo';

const VIDEO_MAX_MB = 2000;
const SMALL_ENOUGH_MB = 60;
const VIDEO_TYPES = ['video/mp4', 'video/quicktime'];

export function put(url: string, body: Blob | FormData, method: 'PUT' | 'POST', contentType: string | null, onProgress: (p: number) => void) {
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
export async function compress(file: File): Promise<Blob> {
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

export async function uploadImage(file: File, onProgress: (p: number) => void): Promise<string> {
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

export async function uploadVideo(
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

export function useUploader() {
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

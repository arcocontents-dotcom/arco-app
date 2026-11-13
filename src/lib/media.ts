import 'server-only';
import { AwsClient } from 'aws4fetch';
import { randomUUID } from 'node:crypto';
import { env } from './env';

// ---------- Vídeos: Cloudflare Stream (gera versões leves automaticamente) ----------

export async function createVideoUpload(): Promise<{ uploadURL: string; uid: string }> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.cfAccountId}/stream/direct_upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.cfStreamToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxDurationSeconds: 900, requireSignedURLs: false })
  });
  const json = (await res.json()) as { success: boolean; result?: { uploadURL: string; uid: string }; errors?: unknown };
  if (!res.ok || !json.success || !json.result) {
    console.error('[stream] falha', res.status, JSON.stringify(json.errors));
    throw new Error('Não foi possível iniciar o envio do vídeo');
  }
  return json.result;
}

function streamBase(): string {
  const code = env.cfStreamCustomerCode;
  return code ? `https://customer-${code}.cloudflarestream.com` : 'https://videodelivery.net';
}

export function videoWatchUrl(uid: string) {
  return `${streamBase()}/${uid}/watch`;
}

export function videoEmbedUrl(uid: string, poster?: string | null) {
  const p = new URLSearchParams({ preload: 'metadata', autoplay: 'true', letterboxColor: 'transparent' });
  if (poster) p.set('poster', poster);
  return `${streamBase()}/${uid}/iframe?${p.toString()}`;
}

export function videoThumbUrl(uid: string, height = 640) {
  return `${streamBase()}/${uid}/thumbnails/thumbnail.jpg?time=1s&height=${height}`;
}

// ---------- Imagens: Cloudflare R2 ----------

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov'
};

export function createImageUpload(contentType: string) {
  if (!contentType.startsWith('image/') || !EXT[contentType]) throw new Error('Formato de imagem não aceito');
  return createR2Upload(contentType);
}

export function createVideoFileUpload(contentType: string) {
  if (!contentType.startsWith('video/') || !EXT[contentType]) throw new Error('Envie o vídeo em MP4 ou MOV');
  return createR2Upload(contentType);
}

/** PDF do planejamento mensal: nome legível + código aleatório (impossível de adivinhar). */
export function createDocUpload(name: string) {
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'planejamento';
  return createR2Upload('application/pdf', `planejamentos/${slug}-${randomUUID().slice(0, 8)}.pdf`);
}

async function createR2Upload(contentType: string, fixedKey?: string): Promise<{ uploadURL: string; publicUrl: string }> {
  const ext = EXT[contentType];
  const now = new Date();
  const key = fixedKey ?? `midia/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
  const aws = new AwsClient({
    accessKeyId: env.r2AccessKeyId,
    secretAccessKey: env.r2SecretAccessKey,
    service: 's3',
    region: 'auto'
  });
  const target = new URL(`https://${env.cfAccountId}.r2.cloudflarestorage.com/${env.r2Bucket}/${key}`);
  target.searchParams.set('X-Amz-Expires', '600');
  const signed = await aws.sign(new Request(target, { method: 'PUT', headers: { 'Content-Type': contentType } }), {
    aws: { signQuery: true }
  });
  return { uploadURL: signed.url, publicUrl: `${env.r2PublicUrl}/${key}` };
}

/** Só aceitamos links de mídia vindos dos nossos próprios armazenamentos. */
export function isOwnMediaUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:') return false;
    const r2 = new URL(env.r2PublicUrl);
    if (url.host === r2.host) return true;
    return url.host.endsWith('.cloudflarestream.com') || url.host === 'videodelivery.net';
  } catch {
    return false;
  }
}

'use client';

/**
 * Comprime o vídeo no próprio navegador (grátis, sem servidor de vídeo):
 * reduz para 1080p em H.264 + AAC, com "fast start" para começar a tocar na hora.
 * Um Reels de 700 MB costuma virar algo entre 30 e 90 MB.
 */
export async function compressVideo(file: File, onProgress: (p: number) => void): Promise<Blob> {
  const mb = await import('mediabunny');
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('Este navegador não comprime vídeo. Use o Google Chrome ou o Edge no computador.');
  }
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('Não encontrei vídeo neste arquivo.');
  const w = track.displayWidth;
  const h = track.displayHeight;
  // Limita o lado menor a 1080 px (vertical: 1080x1920; horizontal: 1920x1080).
  const size = Math.min(w, h) > 1080 ? (w <= h ? { width: 1080 } : { height: 1080 }) : {};

  const codec = await mb.getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9'], { width: 1080, height: 1920 });
  if (!codec) throw new Error('Este navegador não comprime vídeo. Use o Google Chrome no computador.');

  const audioTrack = await input.getPrimaryAudioTrack();
  // AAC é o ideal (toca em tudo, inclusive iPhone). Se o navegador não codifica AAC, tenta Opus.
  const audioCodec = audioTrack ? await mb.getFirstEncodableAudioCodec(['aac', 'opus']) : null;
  // Se o áudio original já for AAC, copia sem recomprimir.
  const keepAudio = audioTrack && audioTrack.codec === 'aac';

  const output = new mb.Output({
    format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new mb.BufferTarget()
  });
  const conversion = await mb.Conversion.init({
    input,
    output,
    video: { ...size, codec, quality: mb.QUALITY_HIGH, forceTranscode: true },
    audio: keepAudio ? {} : audioCodec ? { codec: audioCodec, quality: mb.QUALITY_HIGH } : { discard: true }
  });
  if (audioTrack && conversion.discardedTracks.some((t) => t.track.isAudioTrack())) {
    throw new Error('Não foi possível manter o áudio deste vídeo neste navegador. Use o Google Chrome atualizado.');
  }
  if (!conversion.isValid) throw new Error('Não foi possível ler este vídeo. Exporte em MP4 (H.264) e tente de novo.');
  conversion.onProgress = (p) => onProgress(p);
  await conversion.execute();
  const buf = output.target.buffer;
  if (!buf) throw new Error('Falha ao comprimir o vídeo.');
  return new Blob([buf], { type: 'video/mp4' });
}

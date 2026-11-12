// Som curto e discreto de "tudo aprovado" (gerado na hora, sem arquivo de áudio).
// O contexto de áudio precisa nascer dentro do toque do usuário, por isso há duas etapas.

type Ctx = AudioContext;

export function prepareChime(): Ctx | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    void ctx.resume?.();
    return ctx;
  } catch {
    return null;
  }
}

function bell(ctx: Ctx, freq: number, at: number, gain: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
  g.connect(ctx.destination);
  // Nota principal + um harmônico bem baixo: soa como um sininho de vidro.
  for (const [mult, type, level] of [[1, 'sine', 1], [2.01, 'sine', 0.18], [3.98, 'triangle', 0.05]] as const) {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq * mult, at);
    og.gain.value = level;
    o.connect(og).connect(g);
    o.start(at);
    o.stop(at + 1.2);
  }
}

export function playChime(ctx: Ctx | null) {
  if (!ctx) return;
  try {
    const t = ctx.currentTime + 0.02;
    bell(ctx, 1046.5, t, 0.09); // dó
    bell(ctx, 1568.0, t + 0.11, 0.08); // sol
    bell(ctx, 2093.0, t + 0.22, 0.07); // dó (oitava acima)
    setTimeout(() => void ctx.close?.(), 2000);
  } catch {
    /* sem som, sem problema */
  }
}

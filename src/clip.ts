// Pure helpers for the user's recorded clips: trim the silence around
// the spoken word, normalize the level, and encode as WAV for storage.

/** Longest countdown clip kept: the countdown cues are one second apart. */
export const MAX_CLIP_SECONDS = 0.9;
/** Longest "work" / "rest" / "done" clip kept. */
export const MAX_CUE_SECONDS = 1.5;

const SILENCE = 0.04; // fraction of the peak below which a sample counts as silence
const PAD_SECONDS = 0.02;

/**
 * Cuts leading and trailing silence, caps the length at `maxSeconds` and
 * scales the peak to `target`. Returns null if the recording is silent.
 */
export function trimClip(
  samples: Float32Array,
  rate: number,
  maxSeconds = MAX_CLIP_SECONDS,
  target = 0.9,
): Float32Array | null {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak < 0.01) return null;

  const threshold = peak * SILENCE;
  let first = samples.findIndex((s) => Math.abs(s) > threshold);
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) <= threshold) last--;

  const pad = Math.round(PAD_SECONDS * rate);
  first = Math.max(0, first - pad);
  last = Math.min(samples.length - 1, last + pad, first + Math.round(maxSeconds * rate) - 1);

  const gain = target / peak;
  const out = samples.slice(first, last + 1).map((s) => s * gain);
  // Short fade-out so a clip cut at the length cap doesn't click.
  const fade = Math.min(out.length, Math.round(0.01 * rate));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return out;
}

/** 16-bit mono PCM WAV. */
export function encodeWav(samples: Float32Array, rate: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return bytes;
}

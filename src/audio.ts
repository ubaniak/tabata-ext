// Sounds are synthesized with Web Audio, so the extension ships no audio files.
import type { SoundKind } from './engine';

let ctx: AudioContext | null = null;

/** Must first be called from a user gesture (e.g. the Start click). */
export function unlockAudio(): void {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, duration: number, type: OscillatorType, gain: number, at = 0): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration);
}

/** Short tick for the 3-2-1 countdown. */
export function playCountdown(): void {
  tone(660, 0.12, 'sine', 0.4);
}

/** Played when a step starts. */
export function playTransition(kind: SoundKind): void {
  switch (kind) {
    case 'bell':
      // Inharmonic partials with a long decay read as a struck bell.
      tone(830, 1.4, 'sine', 0.5);
      tone(830 * 2.76, 0.9, 'sine', 0.15);
      tone(830 * 5.4, 0.5, 'sine', 0.06);
      break;
    case 'beep':
      tone(990, 0.35, 'square', 0.2);
      break;
    case 'whistle':
      tone(2100, 0.5, 'triangle', 0.35);
      tone(2300, 0.5, 'triangle', 0.15);
      break;
  }
}

/** Played once when the workout finishes. */
export function playFinish(kind: SoundKind): void {
  playTransition(kind);
  setTimeout(() => playTransition(kind), 450);
  setTimeout(() => playTransition(kind), 900);
}

import { describe, expect, it } from 'vitest';
import { MAX_CLIP_SECONDS, encodeWav, trimClip } from './clip';

const RATE = 1000;
const silence = (n: number) => new Float32Array(n);
const tone = (n: number, amp: number) => Float32Array.from({ length: n }, (_, i) => (i % 2 ? amp : -amp));
const concat = (...parts: Float32Array[]) => Float32Array.from(parts.flatMap((p) => [...p]));

describe('trimClip', () => {
  it('cuts the silence around the word, keeping a short pad', () => {
    const out = trimClip(concat(silence(300), tone(200, 0.5), silence(500)), RATE)!;
    // 200 samples of sound plus 20 ms of pad on each side.
    expect(out.length).toBe(240);
  });

  it('normalizes the peak', () => {
    const out = trimClip(concat(silence(100), tone(200, 0.2)), RATE)!;
    expect(Math.max(...out.map(Math.abs))).toBeCloseTo(0.9);
  });

  it('caps the length so the next cue is not overlapped', () => {
    const out = trimClip(tone(3000, 0.5), RATE)!;
    expect(out.length).toBe(MAX_CLIP_SECONDS * RATE);
  });

  it('returns null for a silent take', () => {
    expect(trimClip(silence(1000), RATE)).toBeNull();
  });
});

describe('encodeWav', () => {
  it('writes a 16-bit mono PCM header', () => {
    const wav = encodeWav(tone(10, 0.5), 48000);
    const view = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(40, true)).toBe(20);
    expect(wav.length).toBe(64);
  });
});

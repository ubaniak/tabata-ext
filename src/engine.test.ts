import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  IDLE_RUN,
  buildSteps,
  countdownDue,
  elapsed,
  formatTime,
  parseTime,
  pause,
  positionAt,
  start,
  totalTime,
  type Settings,
} from './engine';

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over });

describe('buildSteps', () => {
  it('builds prep, then alternating work/rest, dropping the last rest by default', () => {
    const steps = buildSteps(settings({ rounds: 2 }));
    expect(steps.map((s) => `${s.kind}${s.round}`)).toEqual(['prep1', 'work1', 'rest1', 'work2']);
  });

  it('keeps the last rest when includeLastRest is on', () => {
    const steps = buildSteps(settings({ rounds: 2, includeLastRest: true }));
    expect(steps.at(-1)).toEqual({ kind: 'rest', round: 2, duration: 10 });
  });

  it('skips zero-length prep and rest', () => {
    const steps = buildSteps(settings({ rounds: 2, prep: 0, rest: 0 }));
    expect(steps.map((s) => s.kind)).toEqual(['work', 'work']);
  });
});

describe('totalTime', () => {
  it('is 3:50 for a classic tabata without the last rest', () => {
    expect(totalTime(DEFAULT_SETTINGS)).toBe(230);
  });

  it('is 4:00 with the last rest', () => {
    expect(totalTime(settings({ includeLastRest: true }))).toBe(240);
  });
});

describe('run state', () => {
  it('accumulates elapsed time across pauses', () => {
    let run = start(IDLE_RUN, 1_000);
    expect(elapsed(run, 4_000)).toBe(3_000);
    run = pause(run, 4_000);
    expect(elapsed(run, 99_000)).toBe(3_000);
    run = start(run, 100_000);
    expect(elapsed(run, 102_500)).toBe(5_500);
  });

  it('ignores redundant start and pause', () => {
    const running = start(IDLE_RUN, 0);
    expect(start(running, 500)).toBe(running);
    expect(pause(IDLE_RUN, 500)).toBe(IDLE_RUN);
  });
});

describe('positionAt', () => {
  const steps = buildSteps(settings({ rounds: 2 })); // prep10 work20 rest10 work20

  it('starts in prep', () => {
    const p = positionAt(steps, 0);
    expect(p.step?.kind).toBe('prep');
    expect(p.remaining).toBe(10_000);
  });

  it('moves into work exactly at the boundary', () => {
    const p = positionAt(steps, 10_000);
    expect(p.step?.kind).toBe('work');
    expect(p.remaining).toBe(20_000);
    expect(p.completedRounds).toBe(0);
  });

  it('counts completed work intervals', () => {
    const p = positionAt(steps, 35_000);
    expect(p.step?.kind).toBe('rest');
    expect(p.completedRounds).toBe(1);
    expect(p.completedRests).toBe(0);
  });

  it('counts completed rest intervals', () => {
    const p = positionAt(steps, 40_000);
    expect(p.step?.kind).toBe('work');
    expect(p.completedRests).toBe(1);
  });

  it('finishes after the last step', () => {
    const p = positionAt(steps, 60_000);
    expect(p.done).toBe(true);
    expect(p.completedRounds).toBe(2);
    expect(p.completedRests).toBe(1);
  });
});

describe('formatTime / parseTime', () => {
  it('formats seconds as M:SS', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(230)).toBe('3:50');
    expect(formatTime(9.9)).toBe('0:09');
  });

  it('parses M:SS and bare seconds', () => {
    expect(parseTime('0:20')).toBe(20);
    expect(parseTime('1:05')).toBe(65);
    expect(parseTime('45')).toBe(45);
    expect(parseTime(' 2:00 ')).toBe(120);
  });

  it('rejects junk', () => {
    expect(parseTime('')).toBeNull();
    expect(parseTime('1:75')).toBeNull();
    expect(parseTime('abc')).toBeNull();
    expect(parseTime('-5')).toBeNull();
  });
});

describe('countdownDue', () => {
  const work = { kind: 'work', round: 1, duration: 20 } as const;
  const rest = { kind: 'rest', round: 1, duration: 10 } as const;

  it('fires on 3, 2, 1 in every mode', () => {
    expect(countdownDue('every', rest, 4, 3)).toBe(true);
    expect(countdownDue('every', rest, 2, 1)).toBe(true);
    expect(countdownDue('every', rest, 5, 4)).toBe(false);
  });

  it('does not fire twice for the same second', () => {
    expect(countdownDue('every', rest, 3, 3)).toBe(false);
  });

  it('only fires before work in work mode', () => {
    expect(countdownDue('work', rest, 4, 3)).toBe(false);
    expect(countdownDue('work', work, 4, 3)).toBe(true);
  });

  it('never fires when off', () => {
    expect(countdownDue('off', work, 4, 3)).toBe(false);
  });
});

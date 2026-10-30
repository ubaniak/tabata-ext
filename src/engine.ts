// Pure timer logic. Nothing here touches the clock, DOM, or chrome.* APIs:
// callers pass in "now" so every function is deterministic and testable.

export type SoundKind = 'bell' | 'beep' | 'whistle';
export type CountdownMode = 'every' | 'work' | 'off';
/** How the 3-2-1 countdown sounds: a spoken number or a short tick. */
export type CountdownStyle = 'voice' | 'mine' | 'beep';

export interface Settings {
  rounds: number;
  /** Seconds. */
  work: number;
  /** Seconds. */
  rest: number;
  /** Seconds of lead-in before the first work interval; 0 skips it. */
  prep: number;
  includeLastRest: boolean;
  sound: SoundKind;
  countdown: CountdownMode;
  countdownStyle: CountdownStyle;
  /** Ring a boxing bell three times as work starts and a buzzer as rest starts. */
  announce: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  rounds: 8,
  work: 20,
  rest: 10,
  prep: 10,
  includeLastRest: false,
  sound: 'bell',
  countdown: 'every',
  countdownStyle: 'voice',
  announce: true,
};

export type StepKind = 'prep' | 'work' | 'rest';

export interface Step {
  kind: StepKind;
  /** 1-based round number; prep belongs to round 1. */
  round: number;
  /** Seconds. */
  duration: number;
}

export function buildSteps(s: Settings): Step[] {
  const steps: Step[] = [];
  if (s.prep > 0) steps.push({ kind: 'prep', round: 1, duration: s.prep });
  for (let round = 1; round <= s.rounds; round++) {
    if (s.work > 0) steps.push({ kind: 'work', round, duration: s.work });
    const last = round === s.rounds;
    if (s.rest > 0 && (!last || s.includeLastRest)) {
      steps.push({ kind: 'rest', round, duration: s.rest });
    }
  }
  return steps;
}

/** Workout length in seconds, excluding prep. */
export function totalTime(s: Settings): number {
  return buildSteps(s)
    .filter((step) => step.kind !== 'prep')
    .reduce((sum, step) => sum + step.duration, 0);
}

export type RunStatus = 'idle' | 'running' | 'paused';

export interface RunState {
  status: RunStatus;
  /** Epoch ms when the current running stretch began; null unless running. */
  startedAt: number | null;
  /** Ms accumulated across earlier running stretches (before pauses). */
  banked: number;
}

export const IDLE_RUN: RunState = { status: 'idle', startedAt: null, banked: 0 };

export function start(run: RunState, now: number): RunState {
  if (run.status === 'running') return run;
  return { status: 'running', startedAt: now, banked: run.banked };
}

export function pause(run: RunState, now: number): RunState {
  if (run.status !== 'running') return run;
  return { status: 'paused', startedAt: null, banked: elapsed(run, now) };
}

export function elapsed(run: RunState, now: number): number {
  if (run.status === 'running' && run.startedAt !== null) {
    return run.banked + Math.max(0, now - run.startedAt);
  }
  return run.banked;
}

export interface Position {
  /** Index into steps; equals steps.length once finished. */
  index: number;
  step: Step | null;
  /** Ms left in the current step (0 when finished). */
  remaining: number;
  /** Work intervals fully completed. */
  completedRounds: number;
  /** Rest intervals fully completed. */
  completedRests: number;
  done: boolean;
}

export function positionAt(steps: Step[], elapsedMs: number): Position {
  let t = elapsedMs;
  let completedRounds = 0;
  let completedRests = 0;
  for (let i = 0; i < steps.length; i++) {
    const ms = steps[i].duration * 1000;
    if (t < ms) {
      return { index: i, step: steps[i], remaining: ms - t, completedRounds, completedRests, done: false };
    }
    t -= ms;
    if (steps[i].kind === 'work') completedRounds++;
    if (steps[i].kind === 'rest') completedRests++;
  }
  return { index: steps.length, step: null, remaining: 0, completedRounds, completedRests, done: true };
}

/** "M:SS" for whole seconds. */
export function formatTime(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Accepts "M:SS" or bare digits; returns seconds, or null if invalid. Bare
 * digits read like a microwave: one or two digits are seconds ("45", "90"),
 * and with three or more the last two are seconds and the rest minutes
 * ("100" is 1:00, "150" is 1:50, "190" is 1:90 = 2:30).
 */
export function parseTime(input: string): number | null {
  const trimmed = input.trim();
  const match = /^(?:(\d+):)?(\d+)$/.exec(trimmed);
  if (!match) return null;
  if (match[1]) {
    const seconds = Number(match[2]);
    if (seconds >= 60) return null;
    return Number(match[1]) * 60 + seconds;
  }
  const digits = match[2];
  if (digits.length <= 2) return Number(digits);
  return Number(digits.slice(0, -2)) * 60 + Number(digits.slice(-2));
}

/**
 * Whether a countdown beep is due as the display second changes from
 * `prevSecond` to `second` in the step before `next`. Beeps fire at 3, 2, 1
 * seconds left.
 */
export function countdownDue(
  mode: CountdownMode,
  next: Step | undefined,
  prevSecond: number,
  second: number,
): boolean {
  if (mode === 'off' || second === prevSecond || second < 1 || second > 3) return false;
  if (mode === 'work') return next?.kind === 'work';
  return true;
}

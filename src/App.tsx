import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  IDLE_RUN,
  buildSteps,
  countdownDue,
  elapsed,
  formatTime,
  pause,
  positionAt,
  start,
  totalTime,
  type RunState,
  type Settings,
  type Step,
} from './engine';
import { playAnnouncement, playCountdown, playFinish, playTransition, unlockAudio } from './audio';
import { setBadge } from './badge';
import { loadRun, loadSettings, saveRun, saveSettings } from './storage';
import { SettingsForm } from './SettingsForm';

const LABELS = { prep: 'Get ready', work: 'Work', rest: 'Rest' } as const;

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [run, setRun] = useState<RunState>(IDLE_RUN);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const steps = useMemo(() => buildSteps(settings), [settings]);

  useEffect(() => {
    void Promise.all([loadSettings(), loadRun()]).then(([s, r]) => {
      setSettings(s);
      setRun(r);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) void saveSettings(settings);
  }, [loaded, settings]);

  useEffect(() => {
    if (loaded) void saveRun(run);
  }, [loaded, run]);

  // Sound cues compare the current position with the previous tick's.
  // null means "no previous tick yet": take a silent reading so that reopening
  // the panel mid-workout doesn't replay a transition sound.
  const prev = useRef<{ index: number; second: number } | null>(null);
  const live = useRef({ run, steps, settings });
  live.current = { run, steps, settings };

  useEffect(() => {
    if (run.status !== 'running') return;
    let rafId = 0;
    let timeoutId = 0;

    const tick = () => {
      const t = Date.now();
      const { run, steps, settings } = live.current;
      const pos = positionAt(steps, elapsed(run, t));
      const second = Math.ceil(pos.remaining / 1000);
      const last = prev.current;

      if (last && pos.index !== last.index) {
        if (pos.done) playFinish(settings.sound);
        else {
          playTransition(settings.sound);
          if (settings.announce && pos.step) playAnnouncement(pos.step.kind);
        }
      } else if (last && countdownDue(settings.countdown, steps[pos.index + 1], last.second, second)) {
        playCountdown(second, settings.countdownStyle);
      }
      prev.current = { index: pos.index, second };
      setBadge(pos.step?.kind ?? null, second);
      setNow(t);

      if (pos.done) {
        setRun(pause(run, t));
        return;
      }
      // rAF stalls while the panel is hidden; fall back to a timer so cues still fire.
      if (document.hidden) timeoutId = window.setTimeout(tick, 250);
      else rafId = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, [run.status]);

  const pos = positionAt(steps, elapsed(run, now));

  const onStartPause = () => {
    const t = Date.now();
    if (run.status === 'running') {
      setRun(pause(run, t));
      return;
    }
    unlockAudio();
    if (run.status === 'idle' || pos.done) {
      // Fresh start: a fake "before the first step" reading makes the first
      // step's transition sound play.
      prev.current = { index: -1, second: Infinity };
      setRun(start(IDLE_RUN, t));
    } else {
      prev.current = null;
      setRun(start(run, t));
    }
  };

  const onReset = () => {
    prev.current = null;
    setRun(IDLE_RUN);
    setBadge(null, 0);
  };

  const idle = run.status === 'idle';
  const kind = idle ? null : pos.step?.kind ?? null;
  const clockSeconds = idle ? (steps[0]?.duration ?? 0) : Math.ceil(pos.remaining / 1000);
  const label = idle ? 'Ready' : pos.done ? 'Done' : pos.step ? LABELS[pos.step.kind] : '';
  const totalRests = steps.filter((step) => step.kind === 'rest').length;
  // Share of the current step still to go; the border around the clock shrinks with it.
  const left = !idle && pos.step ? pos.remaining / (pos.step.duration * 1000) : 1;

  return (
    <main className={`app phase-${pos.done && !idle ? 'done' : kind ?? 'idle'}`}>
      <section className="clock" aria-live="polite">
        <Ring left={left} />
        <div className="phase-label">
          {label}
          {run.status === 'paused' && !pos.done ? ' · paused' : ''}
        </div>
        <div className="time">{formatTime(clockSeconds)}</div>
        <RoundBoxes rounds={settings.rounds} current={idle ? null : pos.step} completed={pos.completedRounds} />
        <div className="counts">
          <span>
            Rounds <strong>{pos.completedRounds}/{settings.rounds}</strong>
          </span>
          <span>
            Rest <strong>{pos.completedRests}/{totalRests}</strong>
          </span>
        </div>
      </section>

      <div className="controls">
        <button className="primary" onClick={onStartPause} disabled={steps.length === 0}>
          {run.status === 'running' ? 'Pause' : run.status === 'paused' && !pos.done ? 'Resume' : 'Start'}
        </button>
        <button onClick={onReset} disabled={idle}>
          Reset
        </button>
      </div>

      <SettingsForm settings={settings} onChange={setSettings} disabled={!idle} total={formatTime(totalTime(settings))} />
    </main>
  );
}

/** Phase-coloured stroke over the clock's border that runs out with the step, anchored at top centre. */
function Ring({ left }: { left: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const observer = new ResizeObserver(() => {
      const box = svg.getBoundingClientRect();
      setSize({ w: box.width, h: box.height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const { w, h } = size;
  const r = 10;
  // Clockwise from top centre and back, so the stroke shrinks towards the top.
  const d =
    `M ${w / 2} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} ` +
    `H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;

  return (
    <svg ref={ref} className="ring" aria-hidden="true">
      {w > 0 && <path d={d} pathLength={100} strokeDasharray="100 100" strokeDashoffset={100 * (1 - left)} />}
    </svg>
  );
}

function RoundBoxes({
  rounds,
  current,
  completed,
}: {
  rounds: number;
  current: Step | null;
  completed: number;
}) {
  return (
    <ol className="rounds">
      {Array.from({ length: rounds }, (_, i) => {
        const round = i + 1;
        let state = 'todo';
        if (round <= completed) state = 'done';
        if (current && current.round === round && current.kind !== 'prep') state = current.kind;
        return (
          <li key={round} className={`round ${state}`}>
            {round}
          </li>
        );
      })}
    </ol>
  );
}

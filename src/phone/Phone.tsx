// The phone remote page, served from GitHub Pages. It mirrors the panel's
// timer and sends commands; all sound stays on the computer.
import { useEffect, useRef, useState } from 'react';
import { buildSteps, elapsed, formatTime, positionAt, type RunState, type Settings } from '../engine';
import { RemoteClient, type ClientStatus } from '../remote/client';
import { LIMITS, parsePhoneLink, type Pairing, type RemoteSettings } from '../remote/protocol';

const LABELS = { prep: 'Get ready', work: 'Work', rest: 'Rest' } as const;

const STATUS_TEXT: Record<ClientStatus, string> = {
  connecting: 'Connecting to your timer…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  unreachable: "Can't reach the timer. Check the side panel is open, your phone is on the same Wi-Fi, and you scanned its current code. Still trying.",
  busy: 'Someone else is controlling this timer.',
  denied: 'This code has expired. Scan the code in the side panel again.',
  kicked: 'You were disconnected from the timer. Scan the code in the side panel to connect again.',
};

interface Mirror {
  settings: Settings;
  run: RunState;
  offset: number;
}

export function Phone() {
  const [pairing, setPairing] = useState<Pairing | null>(() => parsePhoneLink(location.hash));
  const [status, setStatus] = useState<ClientStatus>('connecting');
  const [mirror, setMirror] = useState<Mirror | null>(null);
  const client = useRef<RemoteClient | null>(null);

  // Scanning a new code while the page is open only changes the hash.
  useEffect(() => {
    const onHash = () => setPairing(parsePhoneLink(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!pairing) return;
    setStatus('connecting');
    setMirror(null);
    const c = new RemoteClient(pairing, { onStatus: setStatus, onState: setMirror });
    client.current = c;
    return () => {
      c.destroy();
      client.current = null;
    };
  }, [pairing?.peerId, pairing?.secret]);

  useWakeLock(status === 'connected');

  if (!pairing) {
    return (
      <main className="app phone">
        <h1 className="phone-title">Tabata Remote</h1>
        <p className="phone-note">Open the Tabata Timer side panel on your computer, click <b>Connect phone</b>, and scan the code with your phone's camera.</p>
      </main>
    );
  }

  const stopped = status === 'busy' || status === 'denied' || status === 'kicked';
  return (
    <main className="app phone">
      <div className={`phone-status ${status}`} role="status">
        {STATUS_TEXT[status]}
        {status === 'busy' && (
          <button className="link" onClick={() => client.current?.retryNow()}>
            Try again
          </button>
        )}
      </div>
      {mirror && !stopped && <Controls mirror={mirror} live={status === 'connected'} send={(m) => client.current?.send(m)} />}
    </main>
  );
}

function Controls({
  mirror,
  live,
  send,
}: {
  mirror: Mirror;
  live: boolean;
  send: RemoteClient['send'];
}) {
  const { run, offset } = mirror;
  // Show taps straight away; the panel's next state replaces this.
  const [draft, setDraft] = useState<Settings | null>(null);
  const settings = draft ?? mirror.settings;
  useEffect(() => setDraft(null), [mirror]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (run.status !== 'running') return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [run.status]);

  const steps = buildSteps(settings);
  const pos = positionAt(steps, elapsed(run, now + offset));
  const idle = run.status === 'idle';
  const kind = idle ? null : pos.step?.kind ?? null;
  const seconds = idle ? (steps[0]?.duration ?? 0) : Math.ceil(pos.remaining / 1000);
  const label = idle ? 'Ready' : pos.done ? 'Done' : pos.step ? LABELS[pos.step.kind] : '';
  const round = pos.step?.kind === 'prep' ? 0 : pos.done ? settings.rounds : pos.step?.round ?? 0;

  const change = (key: keyof RemoteSettings, value: number) => {
    const { min, max } = LIMITS[key];
    const next = { ...settings, [key]: Math.min(max, Math.max(min, value)) };
    setDraft(next);
    send({ type: 'settings', settings: { rounds: next.rounds, work: next.work, rest: next.rest, prep: next.prep } });
  };

  return (
    <div className={`phase-${pos.done && !idle ? 'done' : kind ?? 'idle'} phone-body`}>
      <section className="clock">
        <div className="phase-label">
          {label}
          {run.status === 'paused' && !pos.done ? ' · paused' : ''}
        </div>
        <div className="time">{formatTime(seconds)}</div>
        <div className="counts">
          <span>
            Round <strong>{round}/{settings.rounds}</strong>
          </span>
        </div>
      </section>

      <div className="controls">
        <button
          className="primary"
          disabled={!live || steps.length === 0}
          onClick={() => send({ type: run.status === 'running' ? 'pause' : 'start' })}
        >
          {run.status === 'running' ? 'Pause' : run.status === 'paused' && !pos.done ? 'Resume' : 'Start'}
        </button>
        <button disabled={!live || idle} onClick={() => send({ type: 'reset' })}>
          Reset
        </button>
      </div>

      <fieldset className="settings phone-settings" disabled={!live || !idle}>
        <Stepper label="Rounds" value={settings.rounds} text={String(settings.rounds)} step={1} onChange={(v) => change('rounds', v)} />
        <Stepper label="Work" value={settings.work} text={formatTime(settings.work)} step={5} onChange={(v) => change('work', v)} />
        <Stepper label="Rest" value={settings.rest} text={formatTime(settings.rest)} step={5} onChange={(v) => change('rest', v)} />
        <Stepper label="Get ready" value={settings.prep} text={formatTime(settings.prep)} step={5} onChange={(v) => change('prep', v)} />
        {!idle && <p className="phone-note">Reset the timer to change times.</p>}
      </fieldset>
    </div>
  );
}

function Stepper({
  label,
  value,
  text,
  step,
  onChange,
}: {
  label: string;
  value: number;
  text: string;
  step: number;
  onChange: (value: number) => void;
}) {
  // Snap to the step so 22s goes to 25s, not 27s.
  const down = value % step ? value - (value % step) : value - step;
  const up = value - (value % step) + step;
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <button aria-label={`Less ${label.toLowerCase()}`} onClick={() => onChange(down)}>
        −
      </button>
      <span className="stepper-value">{text}</span>
      <button aria-label={`More ${label.toLowerCase()}`} onClick={() => onChange(up)}>
        +
      </button>
    </div>
  );
}

/** Keeps the phone's screen on while connected, where the browser allows it. */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (l) => {
          if (cancelled) void l.release();
          else lock = l;
        },
        () => {},
      );
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release();
    };
  }, [on]);
}

import { useEffect, useState } from 'react';
import {
  formatTime,
  parseTime,
  type CountdownMode,
  type CountdownStyle,
  type Settings,
  type SoundKind,
} from './engine';
import { openRecorder } from './voiceStore';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  disabled: boolean;
  total: string;
}

export function SettingsForm({ settings, onChange, disabled, total }: Props) {
  const update = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  return (
    <fieldset className="settings" disabled={disabled}>
      <label>
        <span>Rounds</span>
        <NumberField value={settings.rounds} min={1} max={99} onCommit={(rounds) => update({ rounds })} />
      </label>
      <label>
        <span>Work</span>
        <TimeField seconds={settings.work} min={1} onCommit={(work) => update({ work })} />
      </label>
      <label>
        <span>Rest</span>
        <TimeField seconds={settings.rest} min={0} onCommit={(rest) => update({ rest })} />
      </label>
      <label>
        <span>Prep</span>
        <TimeField seconds={settings.prep} min={0} onCommit={(prep) => update({ prep })} />
      </label>
      <label className="toggle">
        <span>Include last rest</span>
        <input
          type="checkbox"
          checked={settings.includeLastRest}
          onChange={(e) => update({ includeLastRest: e.target.checked })}
        />
      </label>
      <label>
        <span>Sound</span>
        <select value={settings.sound} onChange={(e) => update({ sound: e.target.value as SoundKind })}>
          <option value="bell">Bell</option>
          <option value="beep">Beep</option>
          <option value="whistle">Whistle</option>
        </select>
      </label>
      <label>
        <span>Countdown</span>
        <select value={settings.countdown} onChange={(e) => update({ countdown: e.target.value as CountdownMode })}>
          <option value="every">Every transition</option>
          <option value="work">Before work only</option>
          <option value="off">Off</option>
        </select>
      </label>
      <label>
        <span>Countdown sound</span>
        <select
          value={settings.countdownStyle}
          onChange={(e) => update({ countdownStyle: e.target.value as CountdownStyle })}
          disabled={settings.countdown === 'off'}
        >
          <option value="voice">Voice (3, 2, 1)</option>
          <option value="mine">My voice</option>
          <option value="beep">Beep</option>
        </select>
      </label>
      {settings.countdownStyle === 'mine' && (
        <button type="button" className="record-link" onClick={openRecorder}>
          Record my voice…
        </button>
      )}
      <label className="toggle">
        <span>Work bell / rest buzzer</span>
        <input type="checkbox" checked={settings.announce} onChange={(e) => update({ announce: e.target.checked })} />
      </label>
      <div className="total">
        <span>Total workout time</span>
        <strong>{total}</strong>
      </div>
    </fieldset>
  );
}

/** Free-text field that commits on blur/Enter and reverts if the input is invalid. */
function DraftField({
  value,
  parse,
  onCommit,
  inputMode,
}: {
  value: string;
  parse: (raw: string) => number | null;
  onCommit: (n: number) => void;
  inputMode: 'numeric' | 'text';
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const n = parse(draft);
    if (n === null) setDraft(value);
    else onCommit(n);
  };

  return (
    <input
      type="text"
      inputMode={inputMode}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function TimeField({ seconds, min, onCommit }: { seconds: number; min: number; onCommit: (n: number) => void }) {
  return (
    <DraftField
      value={formatTime(seconds)}
      inputMode="text"
      onCommit={onCommit}
      parse={(raw) => {
        const n = parseTime(raw);
        return n !== null && n >= min && n <= 59 * 60 + 59 ? n : null;
      }}
    />
  );
}

function NumberField({ value, min, max, onCommit }: { value: number; min: number; max: number; onCommit: (n: number) => void }) {
  return (
    <DraftField
      value={String(value)}
      inputMode="numeric"
      onCommit={onCommit}
      parse={(raw) => {
        const n = Number(raw.trim());
        return Number.isInteger(n) && n >= min && n <= max ? n : null;
      }}
    />
  );
}

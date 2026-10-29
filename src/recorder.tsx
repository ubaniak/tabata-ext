// Recorder page: records the user saying "three", "two", "one" for the
// countdown, plus "work", "rest" and "done". It runs in a normal tab because Chrome doesn't show the
// microphone prompt inside the side panel.
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MAX_CLIP_SECONDS, MAX_CUE_SECONDS, encodeWav, trimClip } from './clip';
import { loadClips, saveClips, type ClipName, type VoiceClips } from './voiceStore';
import './styles.css';

type Take = { name: ClipName; word: string; recordMs: number; maxSeconds: number };
const countdown = (name: ClipName, word: string): Take => ({ name, word, recordMs: 1500, maxSeconds: MAX_CLIP_SECONDS });
const cue = (name: ClipName, word: string): Take => ({ name, word, recordMs: 2000, maxSeconds: MAX_CUE_SECONDS });
const COUNTDOWN = [countdown(3, 'Three'), countdown(2, 'Two'), countdown(1, 'One')];
const CUES = [cue('work', 'Work'), cue('rest', 'Rest'), cue('done', 'Done')];

function Recorder() {
  const [clips, setClips] = useState<VoiceClips>({});
  const [recording, setRecording] = useState<ClipName | null>(null);
  const [error, setError] = useState('');
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    void loadClips().then(setClips);
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const update = async (next: VoiceClips) => {
    setClips(next);
    try {
      await saveClips(next);
    } catch (err) {
      setError(`Couldn't save the recording: ${String(err)}`);
    }
  };

  const record = async ({ name, recordMs, maxSeconds }: Take) => {
    setError('');
    try {
      stream.current ??= await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError('Microphone access was blocked. Allow it from the icon in the address bar, then try again.');
      return;
    }
    setRecording(name);
    try {
      const blob = await capture(stream.current, recordMs);
      const url = await toClip(blob, maxSeconds);
      if (!url) setError("Didn't hear anything. Try again a little closer to the mic.");
      else await update({ ...clips, [name]: url });
    } catch (err) {
      setError(`Recording failed: ${String(err)}`);
    } finally {
      setRecording(null);
    }
  };

  const remove = (name: ClipName) => {
    const next = { ...clips };
    delete next[name];
    void update(next);
  };

  const takes = (list: Take[]) => (
    <ol className="takes">
      {list.map((take) => (
        <li key={take.name}>
          <span className="word">{take.word}</span>
          <button className="primary" onClick={() => void record(take)} disabled={recording !== null}>
            {recording === take.name ? 'Recording…' : clips[take.name] ? 'Re-record' : 'Record'}
          </button>
          <button onClick={() => void new Audio(clips[take.name]).play()} disabled={!clips[take.name]}>
            Play
          </button>
          <button onClick={() => remove(take.name)} disabled={!clips[take.name] || recording !== null}>
            Delete
          </button>
        </li>
      ))}
    </ol>
  );

  return (
    <main className="app recorder">
      <h1>Record your voice</h1>
      <p className="hint">
        Press Record, then say the word straight away. Silence before and after is trimmed off. Recordings save
        as you go and play in the timer when <strong>Countdown sound</strong> is set to <strong>My voice</strong>.
      </p>
      <h2>Countdown</h2>
      {takes(COUNTDOWN)}
      <button onClick={() => void playAll(clips)} disabled={!COUNTDOWN.some((t) => clips[t.name])}>
        Play 3, 2, 1
      </button>
      <h2>Work, rest and done</h2>
      <p className="hint">
        Work and Rest play after the work bell / rest buzzer when <strong>Work bell / rest buzzer</strong> is on. Done plays
        after the end chime.
      </p>
      {takes(CUES)}
      {error && <p className="error">{error}</p>}
      <p className="hint">
        A word you haven't recorded uses the built-in voice (or just the chime, for Done). You can close this tab
        when you're finished.
      </p>
    </main>
  );
}

function capture(stream: MediaStream, ms: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType }));
    rec.onerror = () => reject(new Error('MediaRecorder error'));
    rec.start();
    setTimeout(() => rec.stop(), ms);
  });
}

/** Decodes the take, trims it and returns a WAV data URL, or null if it was silent. */
async function toClip(blob: Blob, maxSeconds: number): Promise<string | null> {
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const trimmed = trimClip(buffer.getChannelData(0), buffer.sampleRate, maxSeconds);
    if (!trimmed) return null;
    const wav = new Blob([encodeWav(trimmed, buffer.sampleRate)], { type: 'audio/wav' });
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(wav);
    });
  } finally {
    void ctx.close();
  }
}

/** Plays the recorded words a second apart, like the timer does. */
async function playAll(clips: VoiceClips): Promise<void> {
  for (const { name } of COUNTDOWN) {
    if (clips[name]) void new Audio(clips[name]).play();
    await new Promise((r) => setTimeout(r, 1000));
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Recorder />
  </StrictMode>,
);

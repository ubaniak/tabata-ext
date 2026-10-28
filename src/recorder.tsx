// Recorder page: records the user saying "three", "two", "one" for the
// countdown. It runs in a normal tab because Chrome doesn't show the
// microphone prompt inside the side panel.
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { encodeWav, trimClip } from './clip';
import { loadClips, saveClips, type VoiceClips } from './voiceStore';
import './styles.css';

const RECORD_MS = 1500;
const WORDS: [number, string][] = [
  [3, 'Three'],
  [2, 'Two'],
  [1, 'One'],
];

function Recorder() {
  const [clips, setClips] = useState<VoiceClips>({});
  const [recording, setRecording] = useState<number | null>(null);
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

  const record = async (second: number) => {
    setError('');
    try {
      stream.current ??= await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError('Microphone access was blocked. Allow it from the icon in the address bar, then try again.');
      return;
    }
    setRecording(second);
    try {
      const blob = await capture(stream.current, RECORD_MS);
      const url = await toClip(blob);
      if (!url) setError("Didn't hear anything. Try again a little closer to the mic.");
      else await update({ ...clips, [second]: url });
    } catch (err) {
      setError(`Recording failed: ${String(err)}`);
    } finally {
      setRecording(null);
    }
  };

  const remove = (second: number) => {
    const next = { ...clips };
    delete next[second];
    void update(next);
  };

  return (
    <main className="app recorder">
      <h1>Record your countdown</h1>
      <p className="hint">
        Press Record, then say the word straight away. Each take is 1.5 seconds; silence before and after is
        trimmed off. Recordings save as you go and play in the timer when <strong>Countdown sound</strong> is
        set to <strong>My voice</strong>.
      </p>
      <ol className="takes">
        {WORDS.map(([second, word]) => (
          <li key={second}>
            <span className="word">{word}</span>
            <button className="primary" onClick={() => void record(second)} disabled={recording !== null}>
              {recording === second ? 'Recording…' : clips[second] ? 'Re-record' : 'Record'}
            </button>
            <button onClick={() => void new Audio(clips[second]).play()} disabled={!clips[second]}>
              Play
            </button>
            <button onClick={() => remove(second)} disabled={!clips[second] || recording !== null}>
              Delete
            </button>
          </li>
        ))}
      </ol>
      <button onClick={() => void playAll(clips)} disabled={!WORDS.some(([s]) => clips[s])}>
        Play 3, 2, 1
      </button>
      {error && <p className="error">{error}</p>}
      <p className="hint">A word you haven't recorded uses the built-in voice. You can close this tab when you're done.</p>
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
async function toClip(blob: Blob): Promise<string | null> {
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const trimmed = trimClip(buffer.getChannelData(0), buffer.sampleRate);
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
  for (const [second] of WORDS) {
    if (clips[second]) void new Audio(clips[second]).play();
    await new Promise((r) => setTimeout(r, 1000));
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Recorder />
  </StrictMode>,
);

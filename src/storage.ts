// Settings sync across the user's Chrome profile; the in-progress run lives in
// session storage so it survives the side panel being closed and reopened
// (time keeps counting, since the run stores wall-clock timestamps). The phone
// remote's pairing lives there too, so full screen keeps the same code and phone.
//
// Outside the extension (e.g. `npm run dev` in a normal tab) chrome.storage is
// missing, so fall back to localStorage.
import { DEFAULT_SETTINGS, IDLE_RUN, type RunState, type Settings } from './engine';
import type { Gate } from './remote/protocol';

const hasChromeStorage = typeof chrome !== 'undefined' && !!chrome.storage;

async function get<T>(area: 'sync' | 'session', key: string, fallback: T): Promise<T> {
  try {
    if (hasChromeStorage) {
      const result = await chrome.storage[area].get(key);
      return (result[key] as T | undefined) ?? fallback;
    }
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function set(area: 'sync' | 'session', key: string, value: unknown): Promise<void> {
  try {
    if (hasChromeStorage) {
      await chrome.storage[area].set({ [key]: value });
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Storage is best effort; the timer keeps working in memory.
  }
}

export async function loadSettings(): Promise<Settings> {
  const stored = await get<Partial<Settings>>('sync', 'settings', {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export const saveSettings = (s: Settings) => set('sync', 'settings', s);

export const loadRun = () => get<RunState>('session', 'run', IDLE_RUN);

export const saveRun = (r: RunState) => set('session', 'run', r);

export const loadRemote = () => get<Gate | null>('session', 'remote', null);

export const saveRemote = (g: Gate | null) => set('session', 'remote', g);

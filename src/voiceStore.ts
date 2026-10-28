// The user's own countdown recordings, as WAV data URLs keyed by second
// (3, 2, 1). They live in chrome.storage.local: sync storage is too small for
// audio. Outside the extension, fall back to localStorage.
export type VoiceClips = Partial<Record<number, string>>;

const KEY = 'voiceClips';
const hasChromeStorage = typeof chrome !== 'undefined' && !!chrome.storage;

export async function loadClips(): Promise<VoiceClips> {
  try {
    if (hasChromeStorage) return ((await chrome.storage.local.get(KEY))[KEY] as VoiceClips | undefined) ?? {};
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as VoiceClips;
  } catch {
    return {};
  }
}

export async function saveClips(clips: VoiceClips): Promise<void> {
  if (hasChromeStorage) await chrome.storage.local.set({ [KEY]: clips });
  else localStorage.setItem(KEY, JSON.stringify(clips));
}

/** Calls `onChange` when the clips are re-recorded, e.g. from the recorder tab. */
export function watchClips(onChange: (clips: VoiceClips) => void): () => void {
  if (hasChromeStorage) {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && KEY in changes) onChange((changes[KEY].newValue as VoiceClips | undefined) ?? {});
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
  const listener = (e: StorageEvent) => {
    if (e.key === KEY) onChange(JSON.parse(e.newValue ?? '{}') as VoiceClips);
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}

/** Opens the recorder page in a tab; the side panel can't show the mic prompt. */
export function openRecorder(): void {
  if (typeof chrome !== 'undefined' && chrome.tabs) void chrome.tabs.create({ url: chrome.runtime.getURL('recorder.html') });
  else window.open('recorder.html', '_blank');
}

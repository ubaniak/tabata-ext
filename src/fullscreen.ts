// Full screen mode: the timer moves out of the side panel into its own
// full screen window (same page, `?view=full`), and back again on exit. Only
// one copy of the timer is open at a time, so sounds never play twice; the
// run picks up where it was because it lives in session storage.
//
// The side panel can't go full screen itself, so outside the extension
// (`npm run dev`) the page uses the Fullscreen API on itself instead.

const params = new URLSearchParams(location.search);

export const isFullView = params.get('view') === 'full';

const hasWindows = typeof chrome !== 'undefined' && !!chrome.windows;

export async function enterFullScreen(): Promise<void> {
  if (!hasWindows) {
    await document.documentElement.requestFullscreen?.().catch(() => {});
    return;
  }
  const current = await chrome.windows.getCurrent();
  const url = chrome.runtime.getURL(`sidepanel.html?view=full&from=${current.id}`);
  await chrome.windows.create({ url, state: 'fullscreen', focused: true });
  window.close();
}

export async function exitFullScreen(): Promise<void> {
  if (!hasWindows) {
    if (document.fullscreenElement) await document.exitFullscreen();
    return;
  }
  // Reopen the side panel in the window full screen was entered from.
  const from = Number(params.get('from'));
  if (chrome.sidePanel && Number.isInteger(from)) {
    await chrome.sidePanel.open({ windowId: from }).catch(() => {});
  }
  window.close();
}

/** Tracks the Fullscreen API state for the dev fallback. */
export function onFullscreenChange(listener: (full: boolean) => void): () => void {
  const handler = () => listener(!!document.fullscreenElement);
  document.addEventListener('fullscreenchange', handler);
  return () => document.removeEventListener('fullscreenchange', handler);
}

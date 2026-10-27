// Mirrors the countdown onto the toolbar icon. No-op outside the extension.
import type { StepKind } from './engine';

const COLORS: Record<StepKind, string> = {
  prep: '#d9a400',
  work: '#1f9d55',
  rest: '#d64545',
};

let last = '';

export function setBadge(kind: StepKind | null, secondsLeft: number): void {
  if (typeof chrome === 'undefined' || !chrome.action) return;
  const text = kind ? String(secondsLeft) : '';
  const key = `${kind}:${text}`;
  if (key === last) return;
  last = key;
  void chrome.action.setBadgeText({ text });
  if (kind) void chrome.action.setBadgeBackgroundColor({ color: COLORS[kind] });
}

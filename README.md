# tabata-ext

Tabata interval timer as a Chrome extension (Manifest V3). The timer runs in
Chrome's side panel, so it keeps going while you switch tabs.

## Develop

```sh
npm install
npm test          # engine unit tests (Vitest)
npm run dev       # UI in a normal tab at /sidepanel.html (no chrome.* APIs)
npm run build     # outputs dist/
```

## Load in Chrome

1. `npm run build`
2. Open `chrome://extensions`, enable **Developer mode**
3. **Load unpacked** → pick `dist/`
4. Click the extension's toolbar icon to open the side panel

After code changes, rebuild and hit the reload icon on the extension card.

## Layout

| Path | Role |
|------|------|
| `public/manifest.json` | MV3 manifest (permissions: `sidePanel`, `storage`) |
| `public/background.js` | Service worker; opens the side panel on toolbar click |
| `src/engine.ts` | Pure timer logic: steps, positions, run state, parsing |
| `src/App.tsx` | Clock, round boxes, controls, tick loop and sound cues |
| `src/SettingsForm.tsx` | Rounds / work / rest / prep / sound / countdown |
| `src/audio.ts` | Web Audio synthesized bell, beep, whistle, countdown |
| `src/badge.ts` | Toolbar badge with seconds left, colored by phase |
| `src/storage.ts` | `chrome.storage.sync` settings, `chrome.storage.session` run |

The timer is timestamp-based: state is `startedAt` + time banked across pauses,
and the current phase is computed from `Date.now()`. Closing and reopening the
panel mid-workout picks up where the clock says you are; sounds only play
while the panel is open.

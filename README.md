# tabata-ext

Tabata interval timer as a Chrome extension (Manifest V3). The timer runs in
Chrome's side panel, so it keeps going while you switch tabs.

## Install

The extension isn't on the Chrome Web Store yet, so install it from a release.
Requires Chrome 116 or newer.

1. Go to the [latest release](https://github.com/ubaniak/tabata-ext/releases/latest)
   and download `tabata-ext-vX.Y.Z.zip`.
2. Unzip it somewhere you'll keep it. Chrome loads the extension from this
   folder, so don't delete or move it afterwards.
3. Open `chrome://extensions` and turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped folder (the one containing
   `manifest.json`).
5. Optional: click the puzzle-piece icon in the toolbar and pin **Tabata Timer**.
6. Click the extension's toolbar icon to open the timer in the side panel.

Click **Full screen** to move the timer into a full screen window so you can
read it from across the room. Space starts and pauses; Esc (or **Exit full
screen**) goes back to the side panel. The workout keeps running throughout.

### Updating

Download the new release zip, unzip it over the old folder, then click the
reload icon on the extension's card in `chrome://extensions`. Reusing the same
folder keeps your settings: Chrome ties an unpacked extension's identity (and
its saved settings) to the folder path, so loading from a new folder starts
fresh.

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
| `src/audio.ts` | Web Audio synthesized bell, beep, whistle and finishing tiger roar; plays voice clips |
| `public/voice/` | Spoken "three / two / one" countdown and "work / rest" clips |
| `scripts/gen-voice.py` | Regenerates the voice clips with Kokoro TTS |
| `src/fullscreen.ts` | Moves the timer into its own full screen window and back |
| `src/badge.ts` | Toolbar badge with seconds left, colored by phase |
| `src/storage.ts` | `chrome.storage.sync` settings, `chrome.storage.session` run |

The timer is timestamp-based: state is `startedAt` + time banked across pauses,
and the current phase is computed from `Date.now()`. Closing and reopening the
panel mid-workout picks up where the clock says you are; sounds only play
while the panel is open.

## Credits

The spoken countdown and announcements were generated with [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M)
(Apache-2.0) via [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx),
voice `af_heart`. See `scripts/gen-voice.py` to change the voice.

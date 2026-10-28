"""Generate the spoken countdown and phase clips in public/voice/ with Kokoro TTS.

Kokoro (https://github.com/thewh1teagle/kokoro-onnx) is an open-weight
neural TTS model released under Apache-2.0, so the generated clips can ship
with the extension. Run this only when changing the voice or wording; the
clips are committed.

Setup (needs Python 3.10-3.13 and ffmpeg):
    pip install kokoro-onnx soundfile
    curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
    curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

Usage:
    python scripts/gen-voice.py --models <dir with the two files> [--voice af_heart]

Keep the virtualenv at a short path: the bundled espeak-ng truncates its data
path at ~160 characters and fails with "Error processing file .../phontab".
"""

import argparse
import subprocess
import tempfile
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

CLIPS = {"three": "Three!", "two": "Two!", "one": "One!", "work": "Work!", "rest": "Rest!"}
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "voice"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", type=Path, required=True)
    parser.add_argument("--voice", default="af_heart")
    parser.add_argument("--speed", type=float, default=1.1)
    args = parser.parse_args()

    kokoro = Kokoro(str(args.models / "kokoro-v1.0.onnx"), str(args.models / "voices-v1.0.bin"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for name, text in CLIPS.items():
        samples, rate = kokoro.create(text, voice=args.voice, speed=args.speed, lang="en-us")
        with tempfile.NamedTemporaryFile(suffix=".wav") as wav:
            sf.write(wav.name, samples, rate)
            out = OUT_DIR / f"{name}.mp3"
            # Strip leading/trailing silence so the word lands on the beat,
            # then encode as small mono MP3.
            subprocess.run(
                [
                    "ffmpeg", "-y", "-loglevel", "error", "-i", wav.name,
                    "-af",
                    "silenceremove=start_periods=1:start_threshold=-45dB,"
                    "areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse",
                    "-ac", "1", "-b:a", "64k", str(out),
                ],
                check=True,
            )
        print(f"wrote {out.relative_to(OUT_DIR.parent.parent)}")


if __name__ == "__main__":
    main()

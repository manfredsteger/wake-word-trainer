#!/usr/bin/env python3
"""
Record real voice samples for wake word training.

Each family member says the wake word 20 times. These real recordings get
mixed with the TTS samples and significantly improve recognition accuracy
for those specific speakers.

Usage:
    python record.py "Hey Dobbi" --person Manfred --times 20
    python record.py "Hey Dobbi" --person Katja   --times 20
    python record.py "Hey Dobbi" --person Lena    --times 20

Then train:
    python train.py "Hey Dobbi" --samples 500 --steps 5000
"""

import argparse
import sys
import time
from pathlib import Path

import numpy as np
import scipy.io.wavfile

BASE_DIR = Path(__file__).parent.resolve()
OUTPUT_DIR = BASE_DIR / "output"
SAMPLE_RATE = 16000


def trim_silence(audio: np.ndarray, threshold: float = 0.012) -> np.ndarray:
    """Remove leading and trailing silence."""
    abs_audio = np.abs(audio.astype(np.float32)) / 32768.0
    above = np.where(abs_audio > threshold)[0]
    if len(above) == 0:
        return audio
    start = max(0, above[0] - int(0.05 * SAMPLE_RATE))
    end = min(len(audio), above[-1] + int(0.15 * SAMPLE_RATE))
    return audio[start:end]


def record_sample(duration: float) -> np.ndarray:
    try:
        import sounddevice as sd
    except ImportError:
        sys.exit("ERROR: sounddevice not installed.\n  Run: pip install sounddevice")
    audio = sd.rec(int(duration * SAMPLE_RATE), samplerate=SAMPLE_RATE,
                   channels=1, dtype="int16")
    sd.wait()
    return audio.flatten()


def main():
    parser = argparse.ArgumentParser(
        description="Record real voice samples for wake word training"
    )
    parser.add_argument("wake_word", help='Wake word, e.g. "Hey Dobbi"')
    parser.add_argument("--person", required=True,
                        help="Speaker name, e.g. Manfred")
    parser.add_argument("--times", type=int, default=20,
                        help="Number of recordings per session (default: 20)")
    parser.add_argument("--duration", type=float, default=2.5,
                        help="Max recording window in seconds (default: 2.5)")
    args = parser.parse_args()

    model_name = (args.wake_word.lower()
                  .replace(" ", "_").replace(",", "").replace("!", "").replace(".", ""))

    out_dir = OUTPUT_DIR / model_name / "positive_train"
    out_dir.mkdir(parents=True, exist_ok=True)

    person_slug = args.person.lower().replace(" ", "_")
    existing = list(out_dir.glob(f"real_{person_slug}_*.wav"))
    start_idx = len(existing)

    print(f"""
╔══════════════════════════════════════════════════╗
║          Wake Word Sample Recorder               ║
╚══════════════════════════════════════════════════╝
  Wake word : "{args.wake_word}"
  Speaker   : {args.person}
  Target    : {args.times} recordings
  Already   : {start_idx} recordings for {args.person}
  Output    : {out_dir}

  Tips:
  • Speak at natural volume, ~30-50 cm from mic
  • Vary your tone slightly (tired, excited, quiet)
  • Don't worry about being perfect — variety helps!
  • Press Ctrl+C to stop early and keep what's saved
""")

    saved = 0
    i = start_idx

    while saved < args.times:
        print(f"  [{saved + 1}/{args.times}] Press Enter when ready...", end="", flush=True)
        try:
            input()
        except (EOFError, KeyboardInterrupt):
            break

        print("  3...", end="", flush=True)
        time.sleep(0.7)
        print(" 2...", end="", flush=True)
        time.sleep(0.7)
        print(" 1...", end="", flush=True)
        time.sleep(0.6)
        print(f'  → "{args.wake_word}"', flush=True)

        try:
            audio = record_sample(args.duration)
        except Exception as e:
            print(f"  ⚠ Recording failed: {e}\n")
            continue

        clipped = trim_silence(audio)
        duration_s = len(clipped) / SAMPLE_RATE
        rms = np.sqrt(np.mean(clipped.astype(np.float32) ** 2)) / 32768.0

        if rms < 0.004:
            print("  ⚠ No audio detected — check your microphone and try again.\n")
            continue

        out_path = out_dir / f"real_{person_slug}_{i + 1:03d}.wav"
        scipy.io.wavfile.write(str(out_path), SAMPLE_RATE, clipped)
        print(f"  ✓ {out_path.name}  ({duration_s:.2f}s)\n")
        saved += 1
        i += 1

    print(f"""
  Done! {saved} new recordings saved for {args.person}.
  Total for {args.person}: {start_idx + saved}

  Next: record other family members, then start training:
    python train.py "{args.wake_word}" --samples 500 --steps 5000
""")


if __name__ == "__main__":
    main()

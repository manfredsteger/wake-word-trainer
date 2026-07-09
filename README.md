# Wake Word Trainer for Home Assistant

Train a custom wake word model (`.onnx`) for the [Wyoming openWakeWord](https://github.com/rhasspy/wyoming-openwakeword) Home Assistant add-on — locally, no cloud, no GPU required.

**Supported platforms:**
- macOS (Apple Silicon M1/M2/M3/M4) — native, uses built-in `say` TTS
- Linux ARM64 / x86_64 — via Docker, uses [Piper TTS](https://github.com/rhasspy/piper) (904 voices)

---

## Quick Start — Docker (recommended)

```bash
# Build the image (one time, ~5 min)
docker compose build

# Train "Hey Dobbi" — quick test (500 samples, ~1-2 h on CPU)
docker compose run trainer "Hey Dobbi"

# Production quality (2000 samples, 25000 steps — ~13 GB downloads, several hours)
docker compose run trainer "Hey Dobbi" --full

# Custom sample/step counts
docker compose run trainer "Hey Jarvis" --samples 1000 --steps 10000
```

The trained model lands in `./output/hey_dobbi.onnx` (or `hey_jarvis.onnx`, etc.).

**First run downloads:**
- Piper TTS voice models: ~60 MB each × 6 voices (cached in `./piper-voices/`)
- MIT Room Impulse Responses: ~50 MB (cached in `./data/`)
- AudioSet background clips: ~500 clips (cached in `./data/`)
- openWakeWord validation features: ~400 MB (cached in `./data/`)
- ACAV100M negative features: ~11 GB (`--full` mode only, cached in `./data/`)

Subsequent runs reuse cached data.

---

## Quick Start — macOS Native (Apple Silicon)

```bash
# One-time setup
chmod +x setup.sh && ./setup.sh

# Activate venv, then train
source .venv/bin/activate
python train.py "Hey Dobbi"
python train.py "Hey Dobbi" --full     # production quality
python train.py "Hey Jarvis" --samples 1000 --steps 10000
```

**Requirements:** macOS 12+, Apple Silicon (M1–M4), [Homebrew](https://brew.sh), ffmpeg (`brew install ffmpeg`)

---

## Installing the Model in Home Assistant

1. Copy the `.onnx` file to your HA host:
   ```bash
   scp output/hey_dobbi.onnx homeassistant:/share/openwakeword/
   ```
2. In Home Assistant: **Settings → Add-ons → Wyoming openWakeWord → Restart**
3. **Settings → Voice Assistants → [your assistant] → Wake word → Hey Dobbi**

---

## Training Parameters

| Flag | Default | Description |
|------|---------|-------------|
| `--samples` | 500 | TTS clips generated (more = better, slower) |
| `--steps` | 3000 | Training gradient steps |
| `--full` | off | Production mode: 2000 samples, 25k steps, +11 GB download |

**Recommended for real use:** `--samples 500 --steps 5000` or `--full`

The quick default (500 samples, 3000 steps) produces a working model in ~1-2 hours.  
`--full` mode takes several hours but yields significantly better accuracy.

---

## How It Works

1. **TTS generation** — Synthesises the wake word in many voices, speeds, and pitches using Piper TTS (Docker) or macOS `say` (native)
2. **Augmentation** — Adds room acoustics (MIT RIRs) and background noise (AudioSet, MUSAN) to each clip
3. **Feature extraction** — openWakeWord's frozen embedding model converts audio to mel features
4. **DNN training** — A small DNN (~32 units) learns to distinguish wake word from everything else
5. **Export** — Model exported as `.onnx` for Wyoming openWakeWord

---

## Compatibility Notes (Why the Patches Exist)

openWakeWord was written in 2022 against older package versions. Several fixes are required:

| Package | Issue | Fix |
|---------|-------|-----|
| `torchaudio 2.x` | Removed legacy `load`/`info` API | `soundfile`-based shim |
| `datasets 5.x` | Requires `torchcodec` (not on Python 3.13) | Pinned to `2.21.0` |
| `scipy 1.15` | Removed `scipy.special.sph_harm` | Try/except shim in `acoustics` |
| `pronouncing 0.2` | Dead `pkg_resources` import | Removed the import |
| `piper` macOS binary | Upstream ships x86_64 in the ARM64 tarball | Use Linux binary in Docker |

All patches are applied automatically (Docker: at build time, macOS: by `setup.sh`).

---

## Project Structure

```
wake-word-trainer/
├── train.py                  # Main training script
├── setup.sh                  # macOS native setup
├── requirements.txt          # Python dependencies
├── Dockerfile                # Linux/Docker build with Piper TTS
├── docker-compose.yml        # Docker Compose runner
├── patches/
│   └── patch_oww_data.py     # torchaudio shim for openWakeWord
├── piper-sample-generator/
│   └── generate_samples.py   # Stub (openWakeWord import compatibility)
├── data/                     # Downloaded datasets (git-ignored)
├── output/                   # Trained models (git-ignored)
└── piper-voices/             # Piper voice models (git-ignored)
```

---

## Troubleshooting

**`piper: command not found`** — Docker: rebuild image. Native Linux: download from [piper releases](https://github.com/rhasspy/piper/releases).

**`No piper voice models could be downloaded`** — Check network access. Voice models download from HuggingFace on first run.

**Training accuracy is low** — Use `--full` mode or increase `--samples` and `--steps`. At least 500 samples and 5000 steps are recommended for real use.

**macOS: `say` voice not found** — The `Eddy (Englisch (USA))` style voices require macOS 14+. The script auto-detects installed voices and falls back to Samantha/Alex if needed.

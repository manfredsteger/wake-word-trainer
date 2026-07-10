#!/usr/bin/env python3
"""
Wake Word Trainer for Home Assistant — macOS ARM (Apple Silicon / MPS)

Uses macOS built-in TTS voices + ffmpeg for sample generation.
No Linux dependencies, no Docker, no API keys needed.

Usage:
    python train.py "Hey Dobbi"
    python train.py "Hey Jarvis" --samples 500 --steps 5000
    python train.py "Hey Dobbi"  --full        # production quality
"""

import argparse
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
import threading
import uuid
from pathlib import Path

import numpy as np
import scipy.io.wavfile
import torch
import yaml
from tqdm import tqdm

BASE_DIR = Path(__file__).parent.resolve()
MODELS_DIR = BASE_DIR / "models"
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "output"

_IS_LINUX = sys.platform == "linux"

HF_FEATURES_URL = (
    "https://huggingface.co/datasets/davidscripka/openwakeword_features"
    "/resolve/main/openwakeword_features_ACAV100M_2000_hrs_16bit.npy"
)
HF_VALIDATION_URL = (
    "https://huggingface.co/datasets/davidscripka/openwakeword_features"
    "/resolve/main/validation_set_features.npy"
)

# English voices built into macOS — varied accents & tones
MACOS_VOICES = [
    "Samantha",       # US female (clear, neutral)
    "Alex",           # US male (default)
    "Fred",           # US male (old)
    "Albert",         # US male (nasal)
    "Daniel",         # GB male
    "Karen",          # AU female
    "Moira",          # IE female
    "Tessa",          # ZA female
    "Rishi",          # IN male
    "Aman",           # IN male
    "Eddy (Englisch (USA))",
    "Flo (Englisch (USA))",
    "Reed (Englisch (USA))",
    "Rocko (Englisch (USA))",
    "Sandy (Englisch (USA))",
    "Shelley (Englisch (USA))",
    "Grandma (Englisch (USA))",
    "Grandpa (Englisch (USA))",
    "Eddy (Englisch (UK))",
    "Reed (Englisch (UK))",
    "Rocko (Englisch (UK))",
    "Sandy (Englisch (UK))",
    "Shelley (Englisch (UK))",
]

# Speech rates (words per minute)
RATES = [140, 160, 180, 200, 220, 240]

# Pitch shifts in semitones (applied by ffmpeg after TTS)
PITCH_SHIFTS = [-2, -1, 0, 1, 2]

# Piper TTS speed variation (atempo filter multipliers)
RATE_FACTORS = [0.85, 0.9, 0.95, 1.0, 1.05, 1.1]

# Piper voice models downloaded from rhasspy/piper-voices on HuggingFace
PIPER_VOICES_DIR = BASE_DIR / "piper-voices"
PIPER_VOICE_MODELS = [
    ("en_US-lessac-medium",      "en/en_US/lessac/medium"),
    ("en_US-ryan-medium",        "en/en_US/ryan/medium"),
    ("en_US-amy-medium",         "en/en_US/amy/medium"),
    ("en_US-joe-medium",         "en/en_US/joe/medium"),
    ("en_GB-jenny_dioco-medium", "en/en_GB/jenny_dioco/medium"),
    ("en_GB-alan-medium",        "en/en_GB/alan/medium"),
]


# ── Device ────────────────────────────────────────────────────────────────────

def get_device() -> str:
    if torch.cuda.is_available():
        return "cuda:0"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


# ── MPS patch ─────────────────────────────────────────────────────────────────

def patch_openwakeword_mps():
    try:
        import openwakeword
        train_file = Path(openwakeword.__file__).parent / "train.py"
        content = train_file.read_text()

        old = "torch.device('cuda:0' if torch.cuda.is_available() else 'cpu')"
        new = (
            "torch.device(\n"
            "            'cuda:0' if torch.cuda.is_available()\n"
            "            else 'mps' if (hasattr(torch.backends, 'mps') and torch.backends.mps.is_available())\n"
            "            else 'cpu'\n"
            "        )"
        )
        if old in content:
            content = content.replace(old, new)
            train_file.write_text(content)
            print("  ✓ Patched openWakeWord for Apple MPS")
        else:
            print("  ✓ openWakeWord MPS patch: already applied or different version")
    except Exception as e:
        print(f"  ⚠ MPS patch skipped: {e}")


# ── Piper TTS (Linux / Docker) ────────────────────────────────────────────────

def find_piper() -> str:
    for candidate in ["/usr/local/piper/piper", str(BASE_DIR / "piper" / "piper"), "piper"]:
        if Path(candidate).is_file() or shutil.which(candidate):
            return candidate
    sys.exit("ERROR: piper binary not found. See README for installation instructions.")


def download_piper_voices() -> list[str]:
    """Download Piper voice models from HuggingFace on first run."""
    from huggingface_hub import hf_hub_download
    PIPER_VOICES_DIR.mkdir(parents=True, exist_ok=True)
    available = []
    for model_name, hf_subpath in PIPER_VOICE_MODELS:
        onnx_file = PIPER_VOICES_DIR / f"{model_name}.onnx"
        json_file = PIPER_VOICES_DIR / f"{model_name}.onnx.json"
        try:
            if not onnx_file.exists():
                print(f"    Downloading voice: {model_name} (~60 MB)...")
                src = hf_hub_download("rhasspy/piper-voices",
                                      f"{hf_subpath}/{model_name}.onnx",
                                      repo_type="dataset")
                shutil.copy(src, onnx_file)
                src_cfg = hf_hub_download("rhasspy/piper-voices",
                                          f"{hf_subpath}/{model_name}.onnx.json",
                                          repo_type="dataset")
                shutil.copy(src_cfg, json_file)
            available.append(str(onnx_file))
        except Exception as e:
            tqdm.write(f"    ⚠ Skipped {model_name}: {e}")
    if not available:
        sys.exit("ERROR: No piper voice models could be downloaded. Check network access.")
    return available


def piper_to_wav(text: str, model_path: str, rate_factor: float, pitch_shift: int,
                 output_wav: Path, piper: str, ffmpeg: str):
    """Piper TTS → 16kHz mono WAV with speed and pitch variation."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        raw_wav = tmp.name
    try:
        subprocess.run(
            f"echo {shlex.quote(text)} | {shlex.quote(piper)} "
            f"--model {shlex.quote(model_path)} --output_file {shlex.quote(raw_wav)}",
            shell=True, check=True, capture_output=True,
        )
        if rate_factor == 1.0 and pitch_shift == 0:
            af = "aresample=16000"
        elif pitch_shift == 0:
            af = f"atempo={rate_factor:.3f},aresample=16000"
        else:
            factor = 2 ** (pitch_shift / 12) * rate_factor
            src_rate = int(16000 * factor)
            af = f"asetrate={src_rate},aresample=16000"
        subprocess.run(
            [ffmpeg, "-y", "-i", raw_wav,
             "-af", af, "-ar", "16000", "-ac", "1",
             "-acodec", "pcm_s16le", str(output_wav)],
            check=True, capture_output=True,
        )
    finally:
        try:
            os.unlink(raw_wav)
        except OSError:
            pass


# ── TTS sample generation ─────────────────────────────────────────────────────

def find_ffmpeg() -> str:
    for candidate in ["ffmpeg", "/opt/homebrew/bin/ffmpeg",
                      "/opt/homebrew/Caskroom/miniconda/base/bin/ffmpeg",
                      "/usr/local/bin/ffmpeg"]:
        if shutil.which(candidate):
            return candidate
    sys.exit("ERROR: ffmpeg not found. Install with: brew install ffmpeg")


def say_to_wav(text: str, voice: str, rate: int, pitch_shift: int,
               output_wav: Path, ffmpeg: str):
    """macOS say → AIFF → ffmpeg → 16kHz mono WAV with optional pitch shift."""
    with tempfile.NamedTemporaryFile(suffix=".aiff", delete=False) as tmp:
        aiff_path = tmp.name

    try:
        # Step 1: TTS → AIFF
        subprocess.run(
            ["say", "-v", voice, "-r", str(rate), "-o", aiff_path, text],
            check=True, capture_output=True,
        )

        # Step 2: AIFF → 16kHz mono WAV (+ optional pitch shift)
        if pitch_shift == 0:
            audio_filter = "aresample=16000"
        else:
            # pitch shift in semitones: multiply sample rate
            factor = 2 ** (pitch_shift / 12)
            src_rate = int(16000 * factor)
            audio_filter = f"asetrate={src_rate},aresample=16000"

        subprocess.run(
            [ffmpeg, "-y", "-i", aiff_path,
             "-af", audio_filter,
             "-ar", "16000", "-ac", "1",
             "-acodec", "pcm_s16le", str(output_wav)],
            check=True, capture_output=True,
        )
    finally:
        os.unlink(aiff_path)


def get_available_voices() -> list[str]:
    """Filter to only voices actually installed on this Mac."""
    result = subprocess.run(["say", "-v", "?"], capture_output=True, text=True)
    installed = result.stdout + result.stderr
    available = []
    for v in MACOS_VOICES:
        # Match by first word of voice name (handles locale suffixes)
        search = v.split()[0]
        if search.lower() in installed.lower():
            available.append(v)
    return available if available else ["Samantha"]


def generate_samples(
    wake_word: str,
    output_dir: Path,
    n_samples: int,
    val_split: float = 0.1,
) -> tuple[Path, Path]:
    """Generate TTS samples. Uses Piper TTS on Linux/Docker, macOS say on macOS."""
    ffmpeg = find_ffmpeg()

    train_dir = output_dir / "positive_train"
    test_dir = output_dir / "positive_test"
    train_dir.mkdir(parents=True, exist_ok=True)
    test_dir.mkdir(parents=True, exist_ok=True)

    existing_train = len(list(train_dir.glob("*.wav")))
    existing_test = len(list(test_dir.glob("*.wav")))
    if existing_train + existing_test >= n_samples:
        print(f"  ✓ {existing_train + existing_test} samples already exist, skipping")
        return train_dir, test_dir

    n_val = max(int(n_samples * val_split), min(20, n_samples // 5))

    text_variants = [
        wake_word,
        wake_word + ".",
        wake_word + "!",
        wake_word + ", please",
        wake_word.lower(),
    ]

    failed = 0

    if _IS_LINUX:
        piper_bin = find_piper()
        voice_models = download_piper_voices()
        print(f"  Using {len(voice_models)} Piper voices × {len(RATE_FACTORS)} speeds × {len(PITCH_SHIFTS)} pitches")
        combos = [
            (voice_models[i % len(voice_models)],
             RATE_FACTORS[i % len(RATE_FACTORS)],
             PITCH_SHIFTS[i % len(PITCH_SHIFTS)],
             text_variants[i % len(text_variants)])
            for i in range(n_samples)
        ]
        for idx, (model, rate_factor, pitch, text) in enumerate(tqdm(combos, desc="Generating TTS (Piper)")):
            dest_dir = test_dir if idx < n_val else train_dir
            out_wav = dest_dir / f"{uuid.uuid4().hex}.wav"
            try:
                piper_to_wav(text, model, rate_factor, pitch, out_wav, piper_bin, ffmpeg)
            except subprocess.CalledProcessError as e:
                failed += 1
                tqdm.write(f"  ⚠ Skipped sample {idx}: {e}")
    else:
        voices = get_available_voices()
        print(f"  Using {len(voices)} macOS voices × {len(RATES)} speeds × {len(PITCH_SHIFTS)} pitches")
        combos = [
            (voices[i % len(voices)],
             RATES[i % len(RATES)],
             PITCH_SHIFTS[i % len(PITCH_SHIFTS)],
             text_variants[i % len(text_variants)])
            for i in range(n_samples)
        ]
        for idx, (voice, rate, pitch, text) in enumerate(tqdm(combos, desc="Generating TTS")):
            dest_dir = test_dir if idx < n_val else train_dir
            out_wav = dest_dir / f"{uuid.uuid4().hex}.wav"
            try:
                say_to_wav(text, voice, rate, pitch, out_wav, ffmpeg)
            except subprocess.CalledProcessError:
                failed += 1
                tqdm.write(f"  ⚠ Skipped sample {idx} (voice '{voice}' not available?)")

    good = len(list(train_dir.glob("*.wav")))
    print(f"  ✓ {good} training + {len(list(test_dir.glob('*.wav')))} validation WAVs"
          + (f" ({failed} failed)" if failed else ""))
    return train_dir, test_dir


# ── Augmentation data ─────────────────────────────────────────────────────────

def _audio_to_16k_int16(audio_entry: dict) -> np.ndarray | None:
    """Convert a HuggingFace audio dict to 16kHz mono int16 numpy array.
    Works with datasets 2.x where entries have 'array' + 'sampling_rate' keys."""
    try:
        arr = np.array(audio_entry["array"], dtype=np.float32)
        sr = int(audio_entry.get("sampling_rate", 16000))

        if sr != 16000:
            import torchaudio
            waveform = torch.from_numpy(arr).unsqueeze(0)
            waveform = torchaudio.functional.resample(waveform, sr, 16000)
            arr = waveform.squeeze().numpy()

        if arr.ndim > 1:
            arr = arr.mean(axis=0)

        # Normalise to int16 range
        peak = np.abs(arr).max()
        if peak > 0:
            arr = arr / peak
        return (arr * 32767).astype(np.int16)
    except Exception:
        return None


def download_background_data(full_mode: bool):
    import datasets as hf_datasets

    rir_dir = DATA_DIR / "mit_rirs"
    if not rir_dir.exists():
        print("  Downloading MIT Room Impulse Responses (~50 MB)...")
        rir_dir.mkdir(parents=True)
        # Use trust_remote_code=False and no Audio cast to avoid torchcodec
        ds = hf_datasets.load_dataset(
            "davidscripka/MIT_environmental_impulse_responses",
            split="train", streaming=True,
        )
        ok = 0
        for row in tqdm(ds, desc="RIRs"):
            audio = row.get("audio", {})
            arr = _audio_to_16k_int16(audio)
            if arr is not None:
                name = (Path(audio.get("path", "")).name or f"{uuid.uuid4().hex}.wav")
                if not name.endswith(".wav"):
                    name = Path(name).stem + ".wav"
                scipy.io.wavfile.write(str(rir_dir / name), 16000, arr)
                ok += 1
        print(f"  ✓ RIRs: {ok} files")
    else:
        print(f"  ✓ RIRs present ({len(list(rir_dir.glob('*.wav')))} files)")

    audioset_dir = DATA_DIR / "audioset_16k"
    if not audioset_dir.exists():
        # Download ~500 clips from AudioSet balanced train via HuggingFace datasets
        n_clips = 2000 if full_mode else 500
        print(f"  Downloading AudioSet background noise ({n_clips} clips)...")
        audioset_dir.mkdir(parents=True)
        ds = hf_datasets.load_dataset(
            "agkphysics/AudioSet", "balanced",
            split="train", streaming=True, trust_remote_code=True,
        )
        ok = 0
        for i, row in enumerate(tqdm(ds, total=n_clips, desc="AudioSet")):
            if ok >= n_clips:
                break
            arr = _audio_to_16k_int16(row["audio"])
            if arr is not None:
                name = f"{row.get('video_id', uuid.uuid4().hex)}.wav"
                scipy.io.wavfile.write(str(audioset_dir / name), 16000, arr)
                ok += 1
        print(f"  ✓ AudioSet: {ok} files")
    else:
        print(f"  ✓ AudioSet present ({len(list(audioset_dir.glob('*.wav')))} files)")

    # MUSAN: music/speech/noise dataset designed for augmentation
    musan_dir = DATA_DIR / "musan"
    if not musan_dir.exists() or not any(musan_dir.rglob("*.wav")):
        n_clips = 200 if full_mode else 80
        print(f"  Downloading MUSAN music/noise ({n_clips} clips)...")
        musan_dir.mkdir(parents=True, exist_ok=True)
        try:
            ds = hf_datasets.load_dataset(
                "DynamicSuperb/BackgroundMusicAdding_MUSAN",
                split="train", streaming=True,
            )
            ok = 0
            for i, row in enumerate(tqdm(ds, total=n_clips, desc="MUSAN")):
                if ok >= n_clips:
                    break
                audio = row.get("audio", row.get("background", {}))
                if not isinstance(audio, dict):
                    continue
                arr = _audio_to_16k_int16(audio)
                if arr is not None:
                    scipy.io.wavfile.write(str(musan_dir / f"{uuid.uuid4().hex}.wav"), 16000, arr)
                    ok += 1
            print(f"  ✓ MUSAN: {ok} files")
        except Exception as e:
            print(f"  ⚠ MUSAN download failed ({e}), using AudioSet only")
    else:
        print(f"  ✓ MUSAN present ({len(list(musan_dir.rglob('*.wav')))} files)")


def download_feature_data(full_mode: bool) -> str:
    import urllib.request

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    val_path = DATA_DIR / "validation_set_features.npy"
    if not val_path.exists():
        print("  Downloading validation features (~400 MB)...")
        urllib.request.urlretrieve(HF_VALIDATION_URL, val_path, _progress_hook("Val features"))
    else:
        print(f"  ✓ Validation features: {val_path.stat().st_size // 1024 // 1024} MB")

    if full_mode:
        acav_path = DATA_DIR / "openwakeword_features_ACAV100M_2000_hrs_16bit.npy"
        if not acav_path.exists():
            print("  Downloading ACAV100M negative features (~11 GB, one-time)...")
            urllib.request.urlretrieve(HF_FEATURES_URL, acav_path, _progress_hook("ACAV100M"))
        else:
            print(f"  ✓ ACAV100M: {acav_path.stat().st_size // 1024 // 1024 // 1024} GB")
        return str(acav_path)
    else:
        print("  (Quick mode: validation set used as negatives — use --full for production quality)")
        return str(val_path)


def _progress_hook(label: str):
    last = [0]
    def hook(count, block_size, total_size):
        if total_size <= 0:
            return
        pct = min(count * block_size * 100 // total_size, 100)
        if pct - last[0] >= 10:
            print(f"    {label}: {pct}%", end="\r", flush=True)
            last[0] = pct
    return hook


# ── Training config ───────────────────────────────────────────────────────────

def make_config(wake_word: str, negative_features_path: str,
                full_mode: bool, steps: int, n_samples: int) -> tuple[Path, str]:
    model_name = (wake_word.lower()
                  .replace(" ", "_")
                  .replace(",", "")
                  .replace("!", "")
                  .replace(".", ""))

    config = {
        "model_name": model_name,
        "target_phrase": [wake_word],
        "custom_negative_phrases": [],
        "n_samples": n_samples,
        "n_samples_val": max(int(n_samples * 0.1), 50),
        "tts_batch_size": 50,
        "augmentation_batch_size": 16,
        "piper_sample_generator_path": str(BASE_DIR / "piper-sample-generator"),  # not used
        "output_dir": str(OUTPUT_DIR),
        "rir_paths": [str(DATA_DIR / "mit_rirs")],
        "background_paths": [
            p for p in [
                str(DATA_DIR / "audioset_16k"),
                str(DATA_DIR / "musan"),
                str(DATA_DIR / "custom_background"),
            ] if list(Path(p).rglob("*.wav"))
        ],
        "background_paths_duplication_rate": [1] * 2,
        "false_positive_validation_data_path": str(DATA_DIR / "validation_set_features.npy"),
        "augmentation_rounds": 2 if full_mode else 1,
        "feature_data_files": {
            "negative_features": negative_features_path,
        },
        "batch_n_per_class": {
            "negative_features": 512 if full_mode else 256,
            "adversarial_negative": 50,
            "positive": 50,
        },
        "model_type": "dnn",
        "layer_size": 32,
        "steps": steps,
        "max_negative_weight": 1000 if full_mode else 500,
        "target_false_positives_per_hour": 0.5,
        "target_accuracy": 0.5,
        "target_recall": 0.2,
    }

    config_path = BASE_DIR / f"{model_name}.yaml"
    with open(config_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False)

    return config_path, model_name


# ── In-process augmentation + training ───────────────────────────────────────

def _apply_torchaudio_shims():
    """Patch torchaudio I/O for Python 3.13 / torchaudio 2.x (torchcodec not available)."""
    import soundfile as sf
    import torchaudio as ta

    def _load(path, *a, **kw):
        data, sr = sf.read(str(path), always_2d=True)
        return torch.from_numpy(data.T.copy()).float(), sr

    class _Meta:
        def __init__(self, p):
            i = sf.info(str(p))
            self.num_channels = i.channels
            self.sample_rate = i.samplerate
            self.num_frames = i.frames

    ta.load = _load
    ta.info = lambda p, *a, **kw: _Meta(p)
    if not hasattr(ta, "set_audio_backend"):
        ta.set_audio_backend = lambda *a, **kw: None


def _run_augment_and_train(config_path: Path, model_name: str, model_dir: Path,
                            steps: int, wake_word: str):
    """Run openWakeWord augmentation + training in-process with all compatibility patches."""
    import sys as _sys
    import os as _os

    # Add piper-sample-generator stub so openWakeWord's train.py import works
    stub_dir = str(BASE_DIR / "piper-sample-generator")
    if stub_dir not in _sys.path:
        _sys.path.insert(0, stub_dir)

    # Apply torchaudio shims BEFORE any openWakeWord imports
    _apply_torchaudio_shims()

    # Now import openWakeWord internals (patches are already in effect)
    import yaml as _yaml
    import numpy as np
    import scipy.io.wavfile
    from pathlib import Path as P

    sys_oww = str(BASE_DIR / "openWakeWord")
    if sys_oww not in _sys.path:
        _sys.path.insert(0, sys_oww)

    import openwakeword
    import openwakeword.utils
    from openwakeword.data import augment_clips
    from openwakeword.utils import compute_features_from_generator
    from openwakeword.train import Model

    config = _yaml.safe_load(open(config_path).read())

    # Resolve paths
    pos_train_dir = P(config["output_dir"]) / model_name / "positive_train"
    pos_test_dir  = P(config["output_dir"]) / model_name / "positive_test"
    neg_train_dir = P(config["output_dir"]) / model_name / "negative_train"
    neg_test_dir  = P(config["output_dir"]) / model_name / "negative_test"
    feature_dir   = P(config["output_dir"]) / model_name

    # Create negative dirs (empty — we have no custom negative phrases)
    neg_train_dir.mkdir(parents=True, exist_ok=True)
    neg_test_dir.mkdir(parents=True, exist_ok=True)

    rir_paths = [e.path for d in config["rir_paths"] for e in _os.scandir(d)]
    background_paths = []
    for bg_path in config["background_paths"]:
        try:
            background_paths.extend([e.path for e in _os.scandir(bg_path)])
        except FileNotFoundError:
            pass
    if not background_paths:
        sys.exit("ERROR: No background audio found. Run step 3 first.")

    # Determine clip duration from samples
    pos_clips_test = list(pos_test_dir.glob("*.wav"))
    durations = []
    for p in pos_clips_test[:50]:
        sr, d = scipy.io.wavfile.read(str(p))
        durations.append(len(d))
    total_length = max(32000, int(round(np.median(durations) / 1000) * 1000) + 12000)
    if abs(total_length - 32000) <= 4000:
        total_length = 32000

    batch_size = config.get("augmentation_batch_size", 16)
    rounds     = config.get("augmentation_rounds", 1)
    n_cpus     = max(1, (_os.cpu_count() or 2) // 2)

    def _feat_file(name):
        return str(feature_dir / name)

    # ── Step A: Augmentation → feature extraction ─────────────────────────────
    if not (feature_dir / "positive_features_train.npy").exists():
        print("  Step A: Augmenting clips + extracting features...")

        pos_train_clips = [str(p) for p in pos_train_dir.glob("*.wav")] * rounds
        pos_test_clips  = [str(p) for p in pos_test_dir.glob("*.wav")]  * rounds
        neg_train_clips = [str(p) for p in neg_train_dir.glob("*.wav")] * rounds
        neg_test_clips  = [str(p) for p in neg_test_dir.glob("*.wav")]  * rounds

        compute_features_from_generator(
            augment_clips(pos_train_clips, total_length=total_length, batch_size=batch_size,
                          background_clip_paths=background_paths, RIR_paths=rir_paths),
            n_total=len(pos_train_clips), clip_duration=total_length,
            output_file=_feat_file("positive_features_train.npy"),
            device="cpu", ncpu=n_cpus)

        compute_features_from_generator(
            augment_clips(pos_test_clips, total_length=total_length, batch_size=batch_size,
                          background_clip_paths=background_paths, RIR_paths=rir_paths),
            n_total=len(pos_test_clips), clip_duration=total_length,
            output_file=_feat_file("positive_features_test.npy"),
            device="cpu", ncpu=n_cpus)

        # Negative clips (empty if no custom_negative_phrases — fine, skip)
        if neg_train_clips:
            compute_features_from_generator(
                augment_clips(neg_train_clips, total_length=total_length, batch_size=batch_size,
                              background_clip_paths=background_paths, RIR_paths=rir_paths),
                n_total=len(neg_train_clips), clip_duration=total_length,
                output_file=_feat_file("negative_features_train.npy"),
                device="cpu", ncpu=n_cpus)
            compute_features_from_generator(
                augment_clips(neg_test_clips, total_length=total_length, batch_size=batch_size,
                              background_clip_paths=background_paths, RIR_paths=rir_paths),
                n_total=len(neg_test_clips), clip_duration=total_length,
                output_file=_feat_file("negative_features_test.npy"),
                device="cpu", ncpu=n_cpus)

        print("  ✓ Feature extraction done")
    else:
        print("  ✓ Features already present, skipping augmentation")

    # ── Step B: Train DNN ─────────────────────────────────────────────────────
    print(f"  Step B: Training DNN ({steps} steps)...")
    from openwakeword.data import mmap_batch_generator

    input_shape = np.load(_feat_file("positive_features_test.npy")).shape[1:]
    seconds_per_example = 1280 * input_shape[0] / 16000

    oww_model = Model(
        n_classes=1,
        input_shape=input_shape,
        model_type=config.get("model_type", "dnn"),
        layer_dim=config.get("layer_size", 32),
        seconds_per_example=seconds_per_example,
    )

    # Shape-reshape transform for background negative features
    def _reshape(x, n=input_shape[0]):
        if n != x.shape[1]:
            x = np.vstack(x)
            x = np.array([x[i:i+n, :] for i in range(0, x.shape[0]-n, n)])
        return x

    # Feature data files: main negatives from config + our positive clips
    feat_files = dict(config["feature_data_files"])
    feat_files["positive"] = _feat_file("positive_features_train.npy")

    data_transforms  = {k: _reshape for k in feat_files}
    label_transforms = {}
    for k in feat_files:
        label_transforms[k] = (lambda x: [1]*len(x)) if k == "positive" else (lambda x: [0]*len(x))

    # Adversarial negatives (only if we have any negative clips)
    has_adv_neg = (feature_dir / "negative_features_train.npy").exists()
    if has_adv_neg:
        feat_files["adversarial_negative"] = _feat_file("negative_features_train.npy")
        label_transforms["adversarial_negative"] = lambda x: [0]*len(x)

    batch_n = {k: v for k, v in config["batch_n_per_class"].items()
               if k != "adversarial_negative" or has_adv_neg}

    batch_gen = mmap_batch_generator(
        feat_files,
        n_per_class=batch_n,
        data_transform_funcs=data_transforms,
        label_transform_funcs=label_transforms,
    )

    class _IterDS(torch.utils.data.IterableDataset):
        def __iter__(self): return batch_gen

    X_train = torch.utils.data.DataLoader(
        _IterDS(), batch_size=None, num_workers=0
    )

    # False-positive validation data
    X_val_fp_arr = np.load(config["false_positive_validation_data_path"])
    X_val_fp_arr = np.array([X_val_fp_arr[i:i+input_shape[0]]
                              for i in range(0, X_val_fp_arr.shape[0]-input_shape[0], 1)])
    X_val_fp_lbl = np.zeros(X_val_fp_arr.shape[0], dtype=np.float32)
    X_val_fp = torch.utils.data.DataLoader(
        torch.utils.data.TensorDataset(
            torch.from_numpy(X_val_fp_arr), torch.from_numpy(X_val_fp_lbl)),
        batch_size=len(X_val_fp_lbl),
    )

    # Combined val set: pos + neg (use empty array if no adversarial negatives)
    val_pos = np.load(_feat_file("positive_features_test.npy"))
    if has_adv_neg:
        val_neg = np.load(_feat_file("negative_features_test.npy"))
    else:
        val_neg = np.zeros((0,) + val_pos.shape[1:], dtype=val_pos.dtype)

    val_labels = np.hstack((
        np.ones(val_pos.shape[0]), np.zeros(val_neg.shape[0])
    )).astype(np.float32)
    val_data = np.vstack((val_pos, val_neg)) if val_neg.shape[0] > 0 else val_pos
    X_val = torch.utils.data.DataLoader(
        torch.utils.data.TensorDataset(
            torch.from_numpy(val_data), torch.from_numpy(val_labels)),
        batch_size=len(val_labels),
    )

    best_model = oww_model.auto_train(
        X_train=X_train,
        X_val=X_val,
        false_positive_val_data=X_val_fp,
        steps=steps,
        max_negative_weight=config.get("max_negative_weight", 500),
        target_fp_per_hour=config.get("target_false_positives_per_hour", 0.5),
    )

    oww_model.export_model(
        model=best_model,
        model_name=model_name,
        output_dir=str(OUTPUT_DIR),
    )

    onnx_files = list(OUTPUT_DIR.glob(f"{model_name}*.onnx"))
    mf = onnx_files[0] if onnx_files else feature_dir / f"{model_name}.onnx"
    print(f"""
╔══════════════════════════════════════════════════╗
║                 Training Complete!               ║
╚══════════════════════════════════════════════════╝
  Model : {mf}
  Size  : {mf.stat().st_size // 1024 if mf.exists() else '?'} KB

  To install in Home Assistant:
  → Copy .onnx to /share/openwakeword/ on your HA host
  → Restart Wyoming openWakeWord add-on
  → Settings → Voice Assistants → Wake word → "{wake_word}"
""")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Wake word trainer for Home Assistant (macOS ARM / Apple Silicon)"
    )
    parser.add_argument("wake_word", nargs="?", default=None,
                        help='Wake word, e.g. "Hey Dobbi"')
    parser.add_argument("--samples", type=int, default=500,
                        help="TTS samples to generate (default: 500)")
    parser.add_argument("--steps", type=int, default=3000,
                        help="Training steps (default: 3000)")
    parser.add_argument("--full", action="store_true",
                        help="Production mode: 2000 samples, 25k steps, +11 GB downloads")
    parser.add_argument("--prefetch", action="store_true",
                        help="Download all training data (~13 GB) without training")
    args = parser.parse_args()

    if args.prefetch:
        print("""
╔══════════════════════════════════════════════════╗
║         Pre-fetching All Training Data           ║
╚══════════════════════════════════════════════════╝
  Downloads (cached in ./data/ — only once):
    • MIT Room Impulse Responses      ~50 MB
    • AudioSet background clips       ~500 clips
    • MUSAN music/noise               ~200 clips
    • Validation features             ~400 MB
    • ACAV100M negative features      ~11 GB
""")
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        print("[1/2] Downloading background / augmentation data...")
        download_background_data(full_mode=True)
        print("\n[2/2] Downloading negative feature data...")
        download_feature_data(full_mode=True)
        print("""
╔══════════════════════════════════════════════════╗
║              All data ready!                     ║
╚══════════════════════════════════════════════════╝
  Run training with:
    python train.py "Hey Dobbi" --full
    make train WORD="Hey Dobbi" FULL=1
""")
        return

    if not args.wake_word:
        parser.error("wake_word is required (or use --prefetch to just download data)")

    n_samples = (2000 if args.full else args.samples) if args.samples == 500 else args.samples
    steps = (25000 if args.full else args.steps) if args.steps == 3000 else args.steps

    device = get_device()

    tts_backend = "Piper TTS (Linux/Docker)" if _IS_LINUX else "macOS say"
    print(f"""
╔══════════════════════════════════════════════════╗
║       Wake Word Trainer for Home Assistant       ║
╚══════════════════════════════════════════════════╝
  Wake word : "{args.wake_word}"
  Samples   : {n_samples}
  Steps     : {steps}
  Device    : {device}
  TTS       : {tts_backend}
  Mode      : {"FULL (production)" if args.full else "QUICK (test)"}
""")

    if not _IS_LINUX:
        print("[1/5] Patching openWakeWord for Apple Silicon MPS...")
        patch_openwakeword_mps()
    else:
        print("[1/5] Linux/Docker mode — skipping MPS patch")

    model_name = (args.wake_word.lower()
                  .replace(" ", "_").replace(",", "").replace("!", "").replace(".", ""))
    model_dir = OUTPUT_DIR / model_name
    model_dir.mkdir(parents=True, exist_ok=True)

    # Start downloads in background threads so they run in parallel with TTS
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _bg_errors: list[Exception] = []

    def _bg_download():
        try:
            download_background_data(args.full)
        except Exception as e:
            _bg_errors.append(e)

    def _feat_download():
        try:
            download_feature_data(args.full)
        except Exception as e:
            _bg_errors.append(e)

    bg_thread = threading.Thread(target=_bg_download, daemon=True)
    feat_thread = threading.Thread(target=_feat_download, daemon=True)
    bg_thread.start()
    feat_thread.start()

    tts_desc = "Piper TTS voices" if _IS_LINUX else "macOS voices"
    print(f"\n[2/5] Generating {n_samples} TTS samples with {tts_desc}...")
    print("      (downloads running in background — will wait before training)")
    generate_samples(args.wake_word, model_dir, n_samples)

    print("\n[3/5] Waiting for background / augmentation data...")
    bg_thread.join()

    print("\n[4/5] Waiting for negative training features...")
    feat_thread.join()

    if _bg_errors:
        print(f"  ⚠ Download warning: {_bg_errors[0]}")

    negative_features_path = str(
        DATA_DIR / ("openwakeword_features_ACAV100M_2000_hrs_16bit.npy"
                    if args.full else "validation_set_features.npy")
    )

    config_path, model_name = make_config(
        args.wake_word, negative_features_path, args.full, steps, n_samples
    )
    print(f"\n  ✓ Config: {config_path}")

    os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"

    print(f"\n[5/5] Training model ({steps} steps on {device})...")
    _run_augment_and_train(config_path, model_name, model_dir, steps, args.wake_word)

    onnx_files = list(OUTPUT_DIR.glob(f"**/{model_name}*.onnx"))
    model_file = onnx_files[0] if onnx_files else model_dir

    print(f"""
╔══════════════════════════════════════════════════╗
║                 Training Complete!               ║
╚══════════════════════════════════════════════════╝
  Model : {model_file}

  To install in Home Assistant:
  → Copy .onnx file to /share/openwakeword/ on your HA host
  → Restart the Wyoming openWakeWord add-on
  → Settings → Voice Assistants → Wake word → select "{args.wake_word}"
""")


if __name__ == "__main__":
    main()

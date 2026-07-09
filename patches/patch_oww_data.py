#!/usr/bin/env python3
"""Apply torchaudio compatibility shim to openWakeWord/openwakeword/data.py.

torchaudio 2.x removed the legacy I/O API. This patch replaces it with
a soundfile-based implementation that works on Python 3.11+ / 3.13+.
"""
import pathlib, sys

oww_data = pathlib.Path("openWakeWord/openwakeword/data.py")
if not oww_data.exists():
    print(f"  SKIP: {oww_data} not found (cwd={pathlib.Path.cwd()})")
    sys.exit(0)

text = oww_data.read_text()

SHIM = """\
import soundfile as _sf
import torchaudio as _torchaudio
def _torchaudio_load_compat(path, *args, **kwargs):
    data, sr = _sf.read(str(path), always_2d=True)
    return torch.from_numpy(data.T.copy()).float(), sr
class _AudioMetaData:
    def __init__(self, p):
        info = _sf.info(str(p))
        self.num_channels = info.channels; self.sample_rate = info.samplerate; self.num_frames = info.frames
def _torchaudio_info_compat(path, *args, **kwargs):
    return _AudioMetaData(path)
_torchaudio.load = _torchaudio_load_compat
_torchaudio.info = _torchaudio_info_compat
if not hasattr(_torchaudio, 'set_audio_backend'):
    _torchaudio.set_audio_backend = lambda *a, **kw: None
import torch_audiomentations  # imported AFTER shim is applied
"""

if "import soundfile as _sf" in text:
    print("  OK: openWakeWord data.py already patched")
elif "import torch\n" in text:
    text = text.replace("import torch\n", "import torch\n" + SHIM + "\n", 1)
    oww_data.write_text(text)
    print("  OK: Patched openWakeWord/openwakeword/data.py")
else:
    print("  WARN: Could not find 'import torch' in data.py — patch not applied")
    sys.exit(1)

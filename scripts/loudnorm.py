"""Normaliza el loudness del MP4 renderizado (dos pasadas, video copiado sin recodificar).

Objetivo -14 LUFS / -1.5 dBTP (estándar de Shorts/Reels/TikTok).

Uso:
    python scripts/loudnorm.py out/video-raw.mp4 out/video.mp4
"""

import json
import re
import subprocess
import sys

TARGET = "I=-14:TP=-1.5:LRA=11"
src, dst = sys.argv[1], sys.argv[2]

probe = subprocess.run(
    ["ffmpeg", "-hide_banner", "-nostats", "-i", src, "-vn", "-af", f"loudnorm={TARGET}:print_format=json", "-f", "null", "-"],
    capture_output=True,
    text=True,
).stderr
m = json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", probe, re.S).group(0))
print("medido:", {k: m[k] for k in ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")})

af = (
    f"loudnorm={TARGET}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
    f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
)
subprocess.run(
    ["ffmpeg", "-v", "error", "-y", "-i", src, "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-af", af,
     "-ar", "48000", "-c:a", "aac", "-b:a", "320k", "-shortest", "-movflags", "+faststart", dst],
    check=True,
)
print("ok:", dst)

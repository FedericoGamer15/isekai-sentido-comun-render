"""Genera la narración (una locución por escena) con tiempos por palabra, para sincronizar escenas y subtítulos.

Las líneas provienen de un JSON {"s1": "texto de la escena 1", "s2": "...", ...} (en el mismo orden que las escenas).
Tres proveedores disponibles:
  - fish (PRINCIPAL cuando hay FISH_API_KEY en el .env; usa la API de Fish Audio /v1/tts/stream/with-timestamp con voces en español latino y personajes)
  - elevenlabs (secundario cuando hay ELEVENLABS_API_KEY en el .env)
  - edge (edge-tts, gratuito, voces neurales en español latino como es-MX-JorgeNeural; `python -m pip install edge-tts`)

Uso (en la raíz del proyecto Remotion):
    python scripts/voiceover.py --lines scripts/narration.json
    python scripts/voiceover.py --lines scripts/narration.json --provider fish --voice <reference_id_32_hex>
    python scripts/voiceover.py --lines scripts/narration.json --provider edge --voice es-MX-JorgeNeural --rate +6%
    python scripts/voiceover.py --lines scripts/narration.json --provider elevenlabs --voice TX3LPaxmHKxFdv7VOQHJ --language es
    python scripts/voiceover.py --lines scripts/narration.json --only s3 s5   # regenera solo esas escenas

Salida: public/audio/vo/<locucion>.mp3 + scripts/out/vo-timings.json.
Después ejecuta scripts/prepare_vo.py (normaliza, recorta el silencio y guarda src/data/vo.json).
"""

import argparse
import asyncio
import base64
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path.cwd()
OUT_AUDIO = ROOT / "public" / "audio" / "vo"
OUT_JSON = ROOT / "scripts" / "out" / "vo-timings.json"
ELEVEN_MODEL = "eleven_multilingual_v2"
DEFAULT_EDGE_VOICE = "es-MX-JorgeNeural"


def clean_text_for_display(text: str) -> str:
    """Elimina etiquetas de emoción entre corchetes [tag] para visualización en subtítulos."""
    cleaned = re.sub(r"\[.*?\]", "", text).strip()
    return re.sub(r"\s+", " ", cleaned)


def load_env() -> dict[str, str]:
    """Lee variables desde .env en la raíz del proyecto o en el directorio padre (workspace)."""
    env_vars: dict[str, str] = {}
    for candidate in (ROOT.parent / ".env", ROOT / ".env"):
        if candidate.exists():
            for line in candidate.read_text(encoding="utf-8").splitlines():
                s = line.strip()
                if not s or s.startswith("#") or "=" not in s:
                    continue
                k, v = s.split("=", 1)
                val = v.strip().strip('"').strip("'")
                if val:
                    env_vars[k.strip()] = val
    return env_vars


def audio_duration_sec(path: Path) -> float:
    """Obtiene la duración en segundos de un archivo de audio usando ffprobe."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        return float(out)
    except Exception:
        return 3.0


def fallback_word_timings(text: str, total_sec: float) -> list[dict]:
    """Calcula tiempos proporcionales por palabra si el proveedor o modelo no devolvió alineación."""
    cleaned = clean_text_for_display(text)
    tokens = cleaned.split()
    if not tokens:
        return []
    weights = [max(len(t.strip(".,!?:;¡¿\"'()")), 1) for t in tokens]
    total_w = sum(weights)
    words = []
    cur = 0.0
    for tok, w in zip(tokens, weights):
        dur = total_sec * (w / total_w)
        words.append({"text": tok, "start": round(cur, 3), "end": round(cur + dur, 3)})
        cur += dur
    return words


# ---------------------------------------------------------------- Fish Audio (Principal)
def synth_fish(key: str, text: str, voice_id: str | None, args, api_key: str, model: str) -> list[dict]:
    """Sintetiza voz usando Fish Audio (/v1/tts/stream/with-timestamp o fallback /v1/tts)."""
    payload: dict = {
        "text": text,
        "format": "mp3",
        "latency": "balanced",
        "normalize": True,
    }
    if voice_id:
        payload["reference_id"] = voice_id
    if args.speed and abs(args.speed - 1.0) > 0.01:
        payload["prosody"] = {"speed": args.speed, "volume": 0}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "model": model,
        "User-Agent": "RemotionProblemResolveSkill/1.0",
    }

    out_mp3 = OUT_AUDIO / f"{key}.mp3"

    # Intento 1: SSE con marcas de tiempo por palabra (/v1/tts/stream/with-timestamp)
    req_sse = urllib.request.Request(
        "https://api.fish.audio/v1/tts/stream/with-timestamp",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        audio_chunks: list[bytes] = []
        alignments_by_seq: dict[int, tuple[float, list[dict]]] = {}
        with urllib.request.urlopen(req_sse, timeout=180) as resp:
            raw_stream = resp.read().decode("utf-8", errors="replace")
        for line in raw_stream.splitlines():
            s = line.strip()
            if not s.startswith("data:"):
                continue
            data_str = s[5:].strip()
            if not data_str or data_str == "[DONE]":
                continue
            try:
                ev = json.loads(data_str)
            except json.JSONDecodeError:
                continue
            b64 = ev.get("audio_base64")
            if b64:
                audio_chunks.append(base64.b64decode(b64))
            al = ev.get("alignment")
            if al and isinstance(al, dict) and "segments" in al:
                seq = int(ev.get("chunk_seq", 0))
                offset = float(ev.get("chunk_audio_offset_sec", 0.0))
                alignments_by_seq[seq] = (offset, al["segments"])

        if audio_chunks:
            out_mp3.write_bytes(b"".join(audio_chunks))
            words: list[dict] = []
            for seq in sorted(alignments_by_seq.keys()):
                offset, segments = alignments_by_seq[seq]
                for seg in segments:
                    w_text = str(seg.get("text", "")).strip()
                    if not w_text:
                        continue
                    w_start = round(offset + float(seg.get("start", 0.0)), 3)
                    w_end = round(offset + float(seg.get("end", w_start)), 3)
                    words.append({"text": w_text, "start": w_start, "end": w_end})
            if words:
                return words
            return fallback_word_timings(text, audio_duration_sec(out_mp3))
    except urllib.error.HTTPError as e:
        if e.code == 402 and model != "s2.1-pro-free":
            print(f"[fish] Modelo '{model}' requiere créditos pagos (HTTP 402). Reintentando con 's2.1-pro-free'...")
            return synth_fish(key, text, voice_id, args, api_key, "s2.1-pro-free")
        # Si el modelo o endpoint stream/with-timestamp no está habilitado para esa voz, usamos /v1/tts directo
        if e.code not in (400, 404, 422, 501):
            sys.exit(f"Fish Audio HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:400]}")
    except Exception:
        pass

    # Intento 2: Endpoint estándar /v1/tts
    req_std = urllib.request.Request(
        "https://api.fish.audio/v1/tts",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req_std, timeout=180) as r:
            out_mp3.write_bytes(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 402 and model != "s2.1-pro-free":
            print(f"[fish] Modelo '{model}' requiere créditos pagos (HTTP 402). Reintentando con 's2.1-pro-free'...")
            return synth_fish(key, text, voice_id, args, api_key, "s2.1-pro-free")
        sys.exit(f"Fish Audio {e.code}: {e.read().decode('utf-8', errors='replace')[:400]}")

    return fallback_word_timings(text, audio_duration_sec(out_mp3))


# ---------------------------------------------------------------- ElevenLabs (Secundario)
def eleven_request(path: str, body: dict, key: str) -> dict:
    req = urllib.request.Request(
        f"https://api.elevenlabs.io{path}",
        data=json.dumps(body).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs {e.code}: {e.read().decode()[:400]}")


def words_from_alignment(al: dict) -> list[dict]:
    words, cur, start, end = [], "", None, None
    for ch, s, e in zip(al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]):
        if ch.isspace():
            if cur:
                words.append({"text": cur, "start": round(start, 3), "end": round(end, 3)})
            cur, start = "", None
            continue
        if start is None:
            start = s
        cur += ch
        end = e
    if cur:
        words.append({"text": cur, "start": round(start, 3), "end": round(end, 3)})
    return words


def synth_eleven(key: str, text: str, voice_id: str, args, api_key: str) -> list[dict]:
    settings = {"stability": args.stability, "similarity_boost": 0.8, "style": args.style, "use_speaker_boost": True, "speed": args.speed}
    res = eleven_request(
        f"/v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128",
        {"text": text, "model_id": ELEVEN_MODEL, "language_code": args.language, "voice_settings": settings},
        api_key,
    )
    (OUT_AUDIO / f"{key}.mp3").write_bytes(base64.b64decode(res["audio_base64"]))
    return words_from_alignment(res["alignment"])


# ---------------------------------------------------------------- edge-tts (Gratuito en español latino)
async def synth_edge(key: str, text: str, voice_id: str, args) -> list[dict]:
    import edge_tts

    for attempt in range(1, 6):
        try:
            communicate = edge_tts.Communicate(text, voice_id, rate=args.rate, boundary="WordBoundary")
            words = []
            with open(OUT_AUDIO / f"{key}.mp3", "wb") as f:
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        f.write(chunk["data"])
                    elif chunk["type"] == "WordBoundary":
                        start = chunk["offset"] / 1e7
                        words.append({"text": chunk["text"], "start": round(start, 3), "end": round(start + chunk["duration"] / 1e7, 3)})
            if not words:
                return fallback_word_timings(text, audio_duration_sec(OUT_AUDIO / f"{key}.mp3"))
            return words
        except edge_tts.exceptions.NoAudioReceived:
            # el servicio a veces responde sin audio; reintentar suele resolverlo
            if attempt == 5:
                raise
            await asyncio.sleep(2 * attempt)
    return []


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser()
    p.add_argument("--lines", required=True, help="JSON {clave: texto}, una locución por escena")
    p.add_argument("--provider", choices=["fish", "elevenlabs", "edge"], default=None, help="Proveedor de TTS (por defecto: fish si hay FISH_API_KEY, luego elevenlabs, luego edge)")
    p.add_argument("--voice", default=None, help="reference_id (Fish Audio), voice_id (ElevenLabs) o nombre de voz (edge, ej.: es-MX-JorgeNeural)")
    p.add_argument("--fish-model", default=None, help="Modelo de Fish Audio (por defecto: s2-pro o FISH_MODEL en .env)")
    p.add_argument("--speed", type=float, default=1.05, help="Velocidad de voz (Fish Audio / ElevenLabs: 0.7–1.2, evita pasar de ~1.12)")
    p.add_argument("--stability", type=float, default=0.42)
    p.add_argument("--style", type=float, default=0.35)
    p.add_argument("--rate", default="+6%", help="edge-tts: ej. +0%%, +6%%")
    p.add_argument("--language", default="es", help="Código de idioma (por defecto: es)")
    p.add_argument("--only", nargs="*", default=[])
    args = p.parse_args()

    lines: dict[str, str] = json.loads(Path(args.lines).read_text(encoding="utf-8-sig"))
    env = load_env()
    fish_key = env.get("FISH_API_KEY")
    eleven_key = env.get("ELEVENLABS_API_KEY")

    provider = args.provider or env.get("TTS_PROVIDER")
    if not provider:
        if fish_key:
            provider = "fish"
        elif eleven_key:
            provider = "elevenlabs"
        else:
            provider = "edge"

    if provider == "fish" and not fish_key:
        sys.exit("FISH_API_KEY ausente en .env — ingresa la clave en .env o usa --provider edge")
    if provider == "elevenlabs" and not eleven_key:
        sys.exit("ELEVENLABS_API_KEY ausente en .env — ingresa la clave en .env o usa --provider edge")

    if provider == "fish":
        voice_id = args.voice or env.get("FISH_VOICE_ID")
        fish_model = args.fish_model or env.get("FISH_MODEL", "s2-pro")
    elif provider == "elevenlabs":
        voice_id = args.voice or env.get("ELEVENLABS_VOICE_ID", "TX3LPaxmHKxFdv7VOQHJ")
        fish_model = ""
    else:
        voice_id = args.voice or env.get("EDGE_VOICE", DEFAULT_EDGE_VOICE)
        fish_model = ""

    OUT_AUDIO.mkdir(parents=True, exist_ok=True)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    only = set(args.only)
    timings = json.loads(OUT_JSON.read_text(encoding="utf-8")) if OUT_JSON.exists() and only else {"lines": {}}
    timings.update({"provider": provider, "voice": voice_id or "default"})
    for key, text in lines.items():
        if only and key not in only:
            continue
        if provider == "fish":
            words = synth_fish(key, text, voice_id, args, fish_key, fish_model)
        elif provider == "elevenlabs":
            words = synth_eleven(key, text, voice_id, args, eleven_key)
        else:
            words = asyncio.run(synth_edge(key, text, voice_id, args))
        clean_t = clean_text_for_display(text)
        timings["lines"][key] = {"text": clean_t, "raw_text": text, "words": words}
        end_t = words[-1]["end"] if words else 0.0
        print(f"[{provider}] {key}: {end_t:.2f}s  {text}")
    # mantiene el orden de las escenas
    timings["lines"] = {k: timings["lines"][k] for k in lines if k in timings["lines"]}
    OUT_JSON.write_text(json.dumps(timings, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

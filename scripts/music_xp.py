"""Sintetiza la banda sonora de 58.0s para '¿Por qué la barra de XP te volvería loco?':
- 00:00 a 00:02.75: Tensión energética ascendente (3:00 AM) + Ding cristalino adictivo al 100% + Sub-drop.
- 00:03.0 a 00:07.0: Bajo synthwave oscuro y palpitante (pasillo del hospital psiquiátrico).
- 00:07.0 a 00:18.0: Fanfarria RPG de 8-bits chiptune mezclada con beat urbano moderno (universidad + espada nivel 2).
- 00:18.0 a 00:32.0: Trampa de la dopamina: sonido de jackpot de casino + aceleración maníaca con latidos de corazón y level-ups distorsionados.
- 00:32.0 a 00:48.0: Chasquido con reverb cavernoso + Tema orquestal oscuro y majestuoso de antihéroe (Modo Party / Trono).
- 00:48.0 a 00:54.0: Cierre épico sobre la ciudad nocturna con pulso hipnótico.
- 00:54.0 a 00:58.0: Silencio súbito dramático en 0:54.0 dejando solo un glitch sutil y en 0:57.2 el riser que empata con 0:00.
"""

from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "audio" / "music.wav"
OUT.parent.mkdir(parents=True, exist_ok=True)

SR = 48000
DUR = 58.0
N = int(SR * DUR)
rng = np.random.default_rng(77)


def hz(m: float) -> float:
    return 440.0 * (2.0 ** ((m - 69.0) / 12.0))


def tt(d: float) -> np.ndarray:
    return np.arange(int(d * SR)) / SR


def stereo(x: np.ndarray, p: float = 0.0) -> np.ndarray:
    return np.stack([x * np.cos((p + 1) * np.pi / 4), x * np.sin((p + 1) * np.pi / 4)], axis=1)


def place(bus: np.ndarray, sig: np.ndarray, at: float, gain: float = 1.0) -> None:
    i = int(at * SR)
    if i >= len(bus) or i < 0:
        return
    if sig.ndim == 1:
        sig = stereo(sig)
    j = min(i + len(sig), len(bus))
    bus[i:j] += sig[: j - i] * gain


def lp(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    return sosfilt(butter(order, min(fc, SR * 0.45), "low", fs=SR, output="sos"), x, axis=0)


def hp(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x, axis=0)


def env(d: float, a: float, r: float) -> np.ndarray:
    t = tt(d)
    return np.minimum(1.0, t / max(a, 1e-4)) * np.clip((d - t) / max(r, 1e-4), 0.0, 1.0)


def saw(f: float, d: float) -> np.ndarray:
    t = tt(d)
    p = (rng.random() + t * f) % 1.0
    return 2.0 * p - 1.0


def square_8bit(m: float, d: float) -> np.ndarray:
    t = tt(d)
    f = hz(m)
    sq = np.sign(np.sin(2 * np.pi * f * t))
    return sq * env(d, 0.004, 0.04) * 0.35


def crystal_ding(d: float = 0.9) -> np.ndarray:
    t = tt(d)
    y = (
        np.sin(2 * np.pi * hz(86) * t) * np.exp(-t * 4.5)
        + 0.6 * np.sin(2 * np.pi * hz(98) * t) * np.exp(-t * 6.5)
        + 0.35 * np.sin(2 * np.pi * hz(103) * t) * np.exp(-t * 9.0)
    )
    return stereo(y * 0.7)


def synthwave_bass(m: int, d: float) -> np.ndarray:
    t = tt(d)
    f = hz(m)
    s1 = saw(f * 0.996, d)
    s2 = saw(f * 1.004, d)
    sub = np.sin(2 * np.pi * (f * 0.5) * t)
    raw = stereo(s1, -0.3) + stereo(s2, 0.3) + stereo(sub * 0.8, 0.0)
    flt = lp(raw, 650)
    return flt * env(d, 0.01, 0.06)[:, None] * 0.55


def dark_choir_chord(notes: list[int], d: float) -> np.ndarray:
    out = np.zeros((int(d * SR), 2))
    for i, m in enumerate(notes):
        for det in (-0.15, 0.0, 0.15):
            s = saw(hz(m + det), d)
            out += stereo(s, -0.6 + 1.2 * (i / max(1, len(notes) - 1)))
    out = lp(out / (len(notes) * 3), 1600)
    return out * env(d, 0.15, 0.25)[:, None] * 0.65


def kick_punch() -> np.ndarray:
    t = tt(0.28)
    f = 48.0 + 110.0 * np.exp(-t / 0.022)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.14)
    return lp(np.tanh(y * 1.8), 450) * 0.78


def snare_crisp() -> np.ndarray:
    t = tt(0.18)
    body = np.sin(2 * np.pi * (180 * np.exp(-t / 0.035)) * t) * np.exp(-t / 0.05) * 0.45
    snap = lp(hp(rng.standard_normal(len(t)), 700), 5000) * np.exp(-t / 0.06) * 0.55
    return (body + snap) * 0.55


def heartbeat(d: float = 0.35) -> np.ndarray:
    t = tt(d)
    f = 55.0 * np.exp(-t * 4.0) + 32.0
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 10.0)
    return stereo(np.tanh(y * 2.2) * 0.8)


def reverb_snap() -> np.ndarray:
    d = 1.8
    t = tt(d)
    click = hp(rng.standard_normal(int(0.025 * SR)), 1800) * np.linspace(1, 0, int(0.025 * SR))
    tail = lp(hp(rng.standard_normal(len(t)), 400), 2800) * np.exp(-t * 2.8) * 0.35
    sig = tail.copy()
    sig[: len(click)] += click * 1.4
    return stereo(sig * 0.85)


def main() -> None:
    bus = np.zeros((N, 2), dtype=np.float64)

    # 1. ESCENA 0 (0:00 - 0:07): Riser energético (0-2.75s) -> Ding 100% (2.75s) -> Synthwave oscuro (3.0-7.0s)
    t_riser = tt(2.75)
    f_riser = 220.0 * (2.0 ** (t_riser * 1.2))
    riser_sig = np.sin(2 * np.pi * np.cumsum(f_riser) / SR) * (t_riser / 2.75) ** 1.5 * 0.45
    place(bus, riser_sig, 0.0, 0.8)
    place(bus, crystal_ding(1.1), 2.75, 0.95)

    # Bajo synthwave palpitante en corcheas (3.0 a 7.0s)
    step_sw = 0.22
    sw_notes = [38, 38, 38, 38, 34, 34, 33, 33]
    t_cur = 3.0
    idx = 0
    while t_cur < 7.0:
        n_m = sw_notes[idx % len(sw_notes)]
        place(bus, synthwave_bass(n_m, step_sw * 0.9), t_cur, 0.85)
        if idx % 2 == 0:
            place(bus, kick_punch(), t_cur, 0.75)
        t_cur += step_sw
        idx += 1

    # 2. ESCENA 1 (0:07 - 0:18): Beat urbano + Fanfarria RPG 8-bits
    bpm1 = 115
    beat1 = 60.0 / bpm1
    rpg_arp = [62, 65, 69, 74, 69, 65, 62, 60]
    t_cur = 7.0
    b_i = 0
    while t_cur < 18.0:
        if b_i % 2 == 0:
            place(bus, kick_punch(), t_cur, 0.75)
            place(bus, synthwave_bass(38 if (b_i // 4) % 2 == 0 else 41, beat1 * 0.9), t_cur, 0.6)
        else:
            place(bus, snare_crisp(), t_cur, 0.68)
        # 8-bit chiptune arpeggio
        place(bus, stereo(square_8bit(rpg_arp[b_i % len(rpg_arp)], beat1 * 0.45), -0.35), t_cur, 0.55)
        place(bus, stereo(square_8bit(rpg_arp[(b_i + 2) % len(rpg_arp)], beat1 * 0.45), 0.35), t_cur + beat1 * 0.5, 0.5)
        t_cur += beat1
        b_i += 1

    # Fanfarria Level 2 en 16.3s (frame 560 de escena 1 = 420+560 = 980 -> 16.33s)
    for k, m_note in enumerate([62, 66, 69, 74]):
        place(bus, square_8bit(m_note, 0.18), 16.2 + k * 0.12, 0.85)

    # 3. ESCENA 2 (0:18 - 0:32): Trampa de la Dopamina (Jackpot + Aceleración maníaca + Latidos)
    # Crítico +500 XP en 20.3s (1080 + 140 = 1220 -> 20.33s)
    for k in range(12):
        place(bus, crystal_ding(0.25), 20.3 + k * 0.08, 0.65)

    t_cur = 18.0
    step_dopa = 0.42
    d_i = 0
    while t_cur < 32.0:
        # Acelera progresivamente de 0.42s a 0.18s
        prog_d = (t_cur - 18.0) / 14.0
        step_dopa = 0.42 - 0.24 * prog_d
        place(bus, heartbeat(0.28), t_cur, 0.75 + 0.2 * prog_d)
        place(bus, heartbeat(0.22), t_cur + step_dopa * 0.38, 0.55 + 0.2 * prog_d)
        # Arpegio cada vez más agudo y desafinado (locura de la barrita)
        detune = rng.uniform(-0.35, 0.35) * prog_d
        place(bus, square_8bit(62 + (d_i % 7) * 2 + detune, step_dopa * 0.5), t_cur, 0.55)
        t_cur += step_dopa
        d_i += 1

    # 4. ESCENA 3 (0:32 - 0:48): Antihéroe Modo Party (Chasquido reverb + Orquesta Oscura Majestuosa)
    # Chasquido en 37.5s (1920 + 330 = 2250 -> 37.5s)
    place(bus, reverb_snap(), 37.5, 0.95)

    DARK_PROG = [
        [38, 45, 50, 53, 57],  # Dm
        [34, 41, 46, 50, 53],  # Bb
        [31, 38, 43, 46, 50],  # Gm
        [33, 40, 45, 49, 52],  # A
    ]
    t_cur = 32.0
    c_i = 0
    while t_cur < 48.0:
        chord = DARK_PROG[c_i % len(DARK_PROG)]
        place(bus, dark_choir_chord(chord, 2.0), t_cur, 0.85)
        place(bus, kick_punch(), t_cur, 0.8)
        place(bus, kick_punch(), t_cur + 1.0, 0.7)
        # Notificaciones hipnóticas a partir de 38s
        if t_cur >= 38.0:
            for p_i in range(4):
                place(bus, crystal_ding(0.35), t_cur + p_i * 0.5, 0.35)
        t_cur += 2.0
        c_i += 1

    # 5. ESCENA 4 (0:48 - 0:58): Ciudad nocturna (48-54s) -> CORTE SÚBITO EN 0:54.0 -> Susurro/Glitch y Loop
    t_cur = 48.0
    while t_cur < 54.0:
        place(bus, dark_choir_chord([38, 45, 50, 57, 62], 2.0), t_cur, 0.85)
        place(bus, synthwave_bass(38, 0.45), t_cur, 0.8)
        place(bus, synthwave_bass(38, 0.45), t_cur + 0.5, 0.8)
        place(bus, synthwave_bass(34, 0.45), t_cur + 1.0, 0.8)
        place(bus, synthwave_bass(33, 0.45), t_cur + 1.5, 0.8)
        t_cur += 2.0

    # Corte seco exacto en 54.0s (silencio dramático entre 54.0s y 57.1s)
    bus[int(54.0 * SR) : int(57.1 * SR)] = 0.0

    # Mini-riser en 57.1s a 58.0s para empatar perfectamente el bucle con el segundo 0:00
    t_loop = tt(0.9)
    f_loop = 140.0 * (2.0 ** (t_loop * 0.9))
    loop_sig = np.sin(2 * np.pi * np.cumsum(f_loop) / SR) * (t_loop / 0.9) * 0.45
    place(bus, loop_sig, 57.1, 0.85)

    # Limpieza y normalización
    bus = hp(bus, 28)
    peak = np.max(np.abs(bus))
    if peak > 1e-6:
        bus = (bus / peak) * 0.85

    sf.write(OUT, bus.astype(np.float32), SR, subtype="PCM_16")
    print(f"Música sintetizada exitosamente en {OUT} ({DUR}s, corte súbito en 54.0s)")


if __name__ == "__main__":
    main()

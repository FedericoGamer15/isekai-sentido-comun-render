import React from "react";
import {
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  interpolateColors,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/* ========================================================================== */
/*  World2D.tsx — "¿Por qué la barra de XP te volvería loco?"                  */
/*  1080×1920 @ 60fps · 3480 frames · todo es SVG vectorial (cero emojis)      */
/*                                                                            */
/*  TIMELINE: por defecto asume que <World2D/> vive en la línea de tiempo      */
/*  raíz (frames 0..3479). Si lo montas dentro de un <Sequence> por escena,    */
/*  pasa absoluteTimeline={false} para que los SFX se disparen bien.           */
/* ========================================================================== */

export interface World2DProps {
  currentScene: number; // 0..4
  sceneLocalFrame: number; // frame relativo dentro de la escena actual
  absoluteTimeline?: boolean;
}

export const clampAngle = (deg: number, min: number, max: number) =>
  Math.min(Math.max(deg, min), max);

/* ------------------------------ constantes -------------------------------- */
const W = 1080;
const H = 1920;
/** Safe zone 75%: x 135..945 · y 240..1680 */
export const SAFE = { x0: 135, x1: 945, y0: 240, y1: 1680 };
export const SCENE_START = [0, 420, 1080, 1920, 2880];
export const SCENE_DURATIONS = [420, 660, 840, 960, 600];
export const TOTAL_FRAMES = 3480;
/** Punto del Match Cut del bucle: pupila del Frame 0 == yema del dedo en 4C */
const LOOP = { x: 540, y: 960, r: 150 };

const C = {
  ink: "#0B0E14",
  bg: "#1B222C",
  wall: "#2D3748",
  coffee: "#5C4D42",
  skin: "#E8C5B0",
  bags: "#6E5667",
  xp: "#00FF66",
  xpCore: "#A3FFCE",
  cyan: "#00E5FF",
  panel: "#061524",
  red: "#FF0055",
  gold: "#FFD700",
  shadow: "#120824",
  purple: "#4C1D95",
  zombie: "#9DB59A",
};
const INK = 5.5; // contorno exterior
const INK2 = 2.5; // contorno interior
const FONT = "'Arial Black','Impact','Helvetica Neue',sans-serif";

/* -------------------------------- helpers --------------------------------- */
const prog = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const eOut = Easing.out(Easing.cubic);
const eIn = Easing.in(Easing.cubic);
const eIO = Easing.inOut(Easing.cubic);
const rnd = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const mod = (v: number, p: number) => ((v % p) + p) % p;
/** Sakuga on-ones (~24fps) y on-twos (~12fps) sobre un reloj de 60fps */
const onOnes = (f: number) => Math.floor(f / 2.5) * 2.5;
const pop = (f: number, at: number, fps: number) =>
  f < at ? 0 : spring({ frame: f - at, fps, config: { damping: 8, stiffness: 190, mass: 0.55 } });
const shake = (f: number, amp: number): [number, number] => {
  const s = Math.floor(f / 2.5);
  return [(rnd(s) - 0.5) * amp, (rnd(s + 50) - 0.5) * amp];
};

/* ------------------------------ defs globales ----------------------------- */
const Defs: React.FC<{ seed: number }> = ({ seed }) => (
  <svg width={0} height={0} style={{ position: "absolute" }}>
    <defs>
      {/* Rough ink: el seed cambia en doses => line-boil */}
      <filter id="roughInk" x="-3%" y="-3%" width="106%" height="106%">
        <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves={2} seed={seed} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={5} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="8" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <pattern id="scan" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="2.5" fill={C.cyan} />
      </pattern>
      <radialGradient id="skinBG" cx="50%" cy="50%" r="75%">
        <stop offset="0" stopColor={C.skin} />
        <stop offset="1" stopColor="#8A6A66" />
      </radialGradient>
      <radialGradient id="irisG" cx="50%" cy="50%" r="50%">
        <stop offset="0.55" stopColor="#2A1D18" />
        <stop offset="0.8" stopColor={C.coffee} />
        <stop offset="1" stopColor="#2A1D18" />
      </radialGradient>
      <radialGradient id="orbG" cx="35%" cy="30%" r="70%">
        <stop offset="0" stopColor="#FFFBE0" />
        <stop offset="0.45" stopColor={C.gold} />
        <stop offset="1" stopColor="#B8860B" />
      </radialGradient>
      <linearGradient id="bandG" x1="0" x2="1">
        <stop offset="0" stopColor={C.xpCore} stopOpacity="0" />
        <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.95" />
        <stop offset="1" stopColor={C.xpCore} stopOpacity="0" />
      </linearGradient>
      <linearGradient id="xpFill" x1="0" x2="1">
        <stop offset="0" stopColor={C.xp} />
        <stop offset="1" stopColor={C.xpCore} />
      </linearGradient>
      <radialGradient id="vigFish" cx="50%" cy="50%" r="72%">
        <stop offset="0.55" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.85" />
      </radialGradient>
    </defs>
  </svg>
);

/* ------------------------------ utilidades UI ----------------------------- */
const Txt: React.FC<{
  x: number; y: number; size: number; fill: string; anchor?: "start" | "middle" | "end"; rot?: number; op?: number;
  children: React.ReactNode;
}> = ({ x, y, size, fill, anchor = "middle", rot = 0, op = 1, children }) => (
  <text
    x={x} y={y} fontFamily={FONT} fontSize={size} fill={fill} stroke={C.ink} strokeWidth={size * 0.2}
    paintOrder="stroke" strokeLinejoin="round" textAnchor={anchor} opacity={op}
    transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}
  >
    {children}
  </text>
);

/** Ventana holográfica cian con bordes biselados (Fondo Panel #061524D9) */
const HoloPanel: React.FC<{
  cx: number; cy: number; w: number; h: number; p: number; lines: string[]; size?: number; accent?: string;
}> = ({ cx, cy, w, h, p, lines, size = 34, accent = C.cyan }) => {
  if (p <= 0.001) return null;
  const c = 18;
  const d = (k: number) => {
    const a = (w / 2) * k, b = (h / 2) * k;
    return `M ${-a + c} ${-b} L ${a - c} ${-b} L ${a} ${-b + c} L ${a} ${b - c} L ${a - c} ${b} L ${-a + c} ${b} L ${-a} ${b - c} L ${-a} ${-b + c} Z`;
  };
  const lh = size * 1.25;
  return (
    <g transform={`translate(${cx},${cy}) scale(${p},${Math.max(p, 0.02)})`} opacity={Math.min(1, p * 1.6)}>
      <path d={d(1)} fill={C.panel} fillOpacity={0.85} stroke={accent} strokeWidth={5} filter="url(#glow)" />
      <path d={d(1)} fill="url(#scan)" opacity={0.18} />
      <path d={d(0.93)} fill="none" stroke={accent} strokeWidth={2} opacity={0.55} />
      {lines.map((l, i) => (
        <text
          key={i} y={(i - (lines.length - 1) / 2) * lh + size * 0.35} textAnchor="middle" fontFamily={FONT}
          fontSize={size} fill={i === 0 ? accent : "#E6FBFF"} stroke={C.ink} strokeWidth={size * 0.12} paintOrder="stroke"
        >
          {l}
        </text>
      ))}
    </g>
  );
};

const XPBar: React.FC<{ x: number; y: number; w: number; h: number; pct: number; label?: string }> = ({ x, y, w, h, pct, label }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={C.panel} stroke={C.ink} strokeWidth={INK} />
    <rect x={x + 5} y={y + 5} width={Math.max(0, (w - 10) * pct)} height={h - 10} rx={(h - 10) / 2} fill="url(#xpFill)" filter="url(#glow)" />
    {label && <Txt x={x + w / 2} y={y - 14} size={34} fill={C.xp}>{label}</Txt>}
  </g>
);

const Starburst: React.FC<{ cx: number; cy: number; r1: number; r2: number; n: number; rot: number; fill: string }> = ({ cx, cy, r1, r2, n, rot, fill }) => {
  const pts = Array.from({ length: n * 2 }, (_, i) => {
    const a = (i * Math.PI) / n + rot;
    const r = i % 2 ? r2 : r1;
    return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
  }).join(" ");
  return <polygon points={pts} fill={fill} stroke={C.ink} strokeWidth={INK} strokeLinejoin="round" />;
};

const SpeedLines: React.FC<{ cx: number; cy: number; n: number; seed: number; color: string; inner: number; outer: number; op?: number }> = ({ cx, cy, n, seed, color, inner, outer, op = 0.5 }) => (
  <g opacity={op}>
    {Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + rnd(i + seed) * 0.2;
      const r1 = inner + rnd(i * 3 + seed) * 120, r2 = outer + rnd(i * 7 + seed) * 200, t = 4 + rnd(i + 9) * 10;
      const p = (r: number, o: number) => `${cx + Math.cos(a + o) * r},${cy + Math.sin(a + o) * r}`;
      return <polygon key={i} points={`${p(r1, 0)} ${p(r2, -t / 1000)} ${p(r2, t / 1000)}`} fill={color} />;
    })}
  </g>
);

const LightBand: React.FC<{ x: number }> = ({ x }) => (
  <g style={{ mixBlendMode: "screen" }}>
    <rect x={x - 380} y={-200} width={760} height={H + 400} fill="url(#bandG)" transform={`rotate(10 ${x} 960)`} />
  </g>
);

/** Píxeles cian que caen (muerte de la espada → aterrizan sobre el libro) */
const PixelRain: React.FC<{ p: number; x0: number; y0: number; spread: number; floorY: number; n?: number }> = ({ p, x0, y0, spread, floorY, n = 80 }) => (
  <g>
    {Array.from({ length: n }, (_, i) => {
      const t = eIn(Math.min(1, Math.max(0, (p - rnd(i + 7) * 0.4) / 0.6)));
      if (t <= 0) return null;
      const sx = x0 + (rnd(i) - 0.5) * spread, sy = y0 + (rnd(i + 99) - 0.5) * 420;
      const y = lerp(sy, floorY, t);
      const s = 9 + rnd(i + 3) * 16;
      return <rect key={i} x={sx - s / 2} y={y - s / 2} width={s} height={s} fill={i % 3 ? C.cyan : "#E6FBFF"} stroke={C.ink} strokeWidth={2} opacity={1 - Math.max(0, t - 0.9) * 10} />;
    })}
  </g>
);

const Vfx: React.FC<{ src: string; x: number; y: number; size: number; opacity?: number; rot?: number }> = ({ src, x, y, size, opacity = 1, rot = 0 }) =>
  opacity <= 0.001 ? null : (
    <Img
      src={staticFile(src)}
      style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, opacity, transform: `rotate(${rot}deg)`, mixBlendMode: "screen", pointerEvents: "none", zIndex: 40 }}
    />
  );

/* Cue de audio: <Sequence> garantiza que el SFX arranque en el frame exacto */
const Cue: React.FC<{ scene: number; at: number; src: string; vol?: number; abs: boolean }> = ({ scene, at, src, vol = 0.9, abs }) => (
  <Sequence from={(abs ? SCENE_START[scene] : 0) + at} durationInFrames={240} layout="none">
    <Audio src={staticFile(src)} volume={vol} />
  </Sequence>
);

const SceneShell: React.FC<{
  scene: number; abs: boolean; cues: [number, string, number][]; vfx?: React.ReactNode; children: React.ReactNode;
}> = ({ scene, abs, cues, vfx, children }) => (
  <div style={{ position: "absolute", inset: 0 }}>
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0 }}>
      <g style={{ filter: "url(#roughInk)" }}>{children}</g>
    </svg>
    {vfx}
    {cues.map(([at, src, vol], i) => (
      <Cue key={i} scene={scene} at={at} src={src} vol={vol} abs={abs} />
    ))}
  </div>
);

/* ========================================================================== */
/*  PERSONAJE ARTICULADO (cuerpo completo: pelvis, muslos, rodillas,           */
/*  pantorrillas, calzado). Convención de ángulos (personaje mira a +x):       */
/*   sh/hp > 0 = limbo hacia ADELANTE · el > 0 = antebrazo adelante            */
/*   kn > 0 = pantorrilla hacia ATRÁS · lean/head > 0 = inclinado adelante     */
/*  Origen = centro de la pelvis. Plantas del pie ≈ y + 278·scale.             */
/* ========================================================================== */
export type EyeKind = "normal" | "dilated" | "xp" | "bloodshot" | "zombie";
export type Mouth = "flat" | "smirk" | "open" | "grin" | "cold";
export type Prop = "cup" | "paper" | "book" | "dish" | "none";
export interface Pose { lean?: number; head?: number; shL?: number; elL?: number; shR?: number; elR?: number; hpL?: number; knL?: number; hpR?: number; knR?: number }
export interface Look { skin: string; hair: string; shirt: string; pants: string; shoes: string; hairStyle?: "short" | "spiky" | "bald" | "bun" }
export interface CharProps {
  x: number; y: number; id: string; scale?: number; flip?: boolean; pose?: Pose; look?: Look;
  eyeOpen?: number; eyeKind?: EyeKind; mouth?: Mouth; bags?: boolean; backpack?: boolean; cape?: number;
  chain?: number; glasses?: boolean; tie?: boolean; bulk?: number; smear?: number; propL?: Prop; propR?: Prop;
  gaze?: number; frame?: number;
}

const HERO: Look = { skin: C.skin, hair: "#1E1A22", shirt: "#3C4A5E", pants: "#2A3140", shoes: "#14161C", hairStyle: "spiky" };
const FOOT = 278;
const UA = 92, FA = 86, TH = 118, SH = 112;

const PropShape: React.FC<{ kind: Prop; y: number }> = ({ kind, y }) => {
  if (kind === "cup")
    return (
      <g transform={`translate(0,${y})`}>
        <rect x={-17} y={-34} width={34} height={42} rx={6} fill="#F2E8DC" stroke={C.ink} strokeWidth={INK2} />
        <rect x={-14} y={-31} width={28} height={9} fill={C.coffee} />
        <path d="M -6 -44 Q -14 -58 -4 -70 M 6 -44 Q 0 -58 10 -70" stroke="#E6FBFF" strokeWidth={3} fill="none" opacity={0.7} />
      </g>
    );
  if (kind === "paper")
    return (
      <g transform={`translate(0,${y}) rotate(-12)`}>
        <rect x={-30} y={-46} width={60} height={74} fill="#F7F3EA" stroke={C.ink} strokeWidth={INK2} />
        {[0, 1, 2, 3, 4].map((i) => <line key={i} x1={-22} x2={22} y1={-32 + i * 12} y2={-32 + i * 12} stroke="#8A7F74" strokeWidth={2} />)}
      </g>
    );
  if (kind === "book")
    return (
      <g transform={`translate(0,${y})`}>
        <rect x={-38} y={-14} width={76} height={34} rx={4} fill={C.coffee} stroke={C.ink} strokeWidth={INK2} />
        <rect x={-34} y={-8} width={68} height={22} fill="#F2E8DC" />
      </g>
    );
  if (kind === "dish")
    return (
      <g transform={`translate(0,${y})`}>
        <ellipse cx={0} cy={0} rx={36} ry={10} fill="#E8EEF2" stroke={C.ink} strokeWidth={INK2} />
        <circle cx={22} cy={-16} r={8} fill="#E6FBFF" opacity={0.7} /><circle cx={-18} cy={-26} r={6} fill="#E6FBFF" opacity={0.6} />
      </g>
    );
  return null;
};

const Arm: React.FC<{ x: number; sh: number; el: number; col: string; skin: string; prop?: Prop; stretch?: number }> = ({ x, sh, el, col, skin, prop = "none", stretch = 1 }) => {
  const s = clampAngle(sh, -170, 170), e = clampAngle(el, 0, 145);
  return (
    <g transform={`translate(${x},-172) rotate(${-s}) scale(1,${stretch})`}>
      <rect x={-13} y={-8} width={26} height={UA + 8} rx={13} fill={col} stroke={C.ink} strokeWidth={INK2 + 1} />
      <g transform={`translate(0,${UA}) rotate(${-e})`}>
        <rect x={-10} y={-6} width={20} height={FA + 6} rx={10} fill={skin} stroke={C.ink} strokeWidth={INK2 + 1} />
        <circle cx={0} cy={FA + 4} r={15} fill={skin} stroke={C.ink} strokeWidth={INK2 + 1} />
        <PropShape kind={prop} y={FA + 4} />
      </g>
    </g>
  );
};

const Leg: React.FC<{ x: number; hp: number; kn: number; pants: string; shoes: string }> = ({ x, hp, kn, pants, shoes }) => {
  const h = clampAngle(hp, -70, 110), k = clampAngle(kn, 0, 140);
  return (
    <g transform={`translate(${x},34) rotate(${-h})`}>
      <rect x={-19} y={-6} width={38} height={TH + 6} rx={19} fill={pants} stroke={C.ink} strokeWidth={INK2 + 1} />
      <g transform={`translate(0,${TH}) rotate(${k})`}>
        <rect x={-16} y={-6} width={32} height={SH + 6} rx={16} fill={pants} stroke={C.ink} strokeWidth={INK2 + 1} />
        <path d={`M -16 ${SH - 6} Q 2 ${SH - 14} 20 ${SH - 6} Q 50 ${SH - 2} 46 ${SH + 14} L -18 ${SH + 14} Z`} fill={shoes} stroke={C.ink} strokeWidth={INK2 + 1} />
      </g>
    </g>
  );
};

const Cape: React.FC<{ p: number; frame: number }> = ({ p, frame }) => {
  const w = Math.sin(frame * 0.18) * 18 * p;
  const L = 250 * p;
  const d = `M -45 -186 C ${-110 - w} -190 ${-L - w * 2} ${-150 + w} ${-L - 40 - w * 3} ${-60 + w * 2} C ${-L * 0.7 - w} -40 ${-110 - w} -10 -50 20 Z`;
  return (
    <g>
      <path d={d} fill="#8E1B3F" stroke={C.ink} strokeWidth={INK} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={C.xp} strokeWidth={3} opacity={0.6} transform="translate(5,-4)" />
    </g>
  );
};

const Eye: React.FC<{ id: string; cx: number; cy: number; kind: EyeKind; open: number; skin: string; gaze: number }> = ({ id, cx, cy, kind, open, skin, gaze }) => {
  const rx = 17, ry = 13;
  const lid = (1 - clampAngle(open, 0, 1)) * (ry * 2 + 4);
  const sclera = kind === "bloodshot" ? "#FFE3E8" : kind === "zombie" ? "#D9E3D2" : "#F8F4EE";
  const pr = kind === "dilated" ? 9 : kind === "bloodshot" ? 4.5 : kind === "zombie" ? 3 : 6.5;
  return (
    <g>
      <clipPath id={id}><ellipse cx={cx} cy={cy} rx={rx} ry={ry} /></clipPath>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={sclera} />
      <g clipPath={`url(#${id})`}>
        {kind === "bloodshot" && (
          <path d={`M ${cx - rx} ${cy - 3} L ${cx - 6} ${cy - 1} M ${cx + rx} ${cy + 4} L ${cx + 6} ${cy + 1} M ${cx - rx} ${cy + 6} L ${cx - 7} ${cy + 3} M ${cx + 2} ${cy - ry} L ${cx + 1} ${cy - 5}`} stroke={C.red} strokeWidth={1.4} />
        )}
        {kind === "xp" ? (
          <g filter="url(#glow)">
            <rect x={cx + gaze - 3.5} y={cy - 11} width={7} height={22} rx={2} fill={C.xp} />
            <rect x={cx + gaze - 11} y={cy - 3.5} width={22} height={7} rx={2} fill={C.xp} />
          </g>
        ) : (
          <>
            {kind === "bloodshot" && <circle cx={cx + gaze} cy={cy} r={pr + 5} fill={C.red} />}
            <circle cx={cx + gaze} cy={cy} r={pr} fill={C.ink} />
            <circle cx={cx + gaze - 2} cy={cy - 3} r={2} fill="#fff" opacity={0.9} />
          </>
        )}
        {/* Oclusión ocular: párpado sólido opaco del color de la piel */}
        <rect x={cx - rx - 2} y={cy - ry - 2} width={rx * 2 + 4} height={lid} fill={skin} />
      </g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={C.ink} strokeWidth={INK2} />
      {lid > 2 && <line x1={cx - rx} x2={cx + rx} y1={cy - ry + lid - 2} y2={cy - ry + lid - 2} stroke={C.ink} strokeWidth={INK2 + 0.5} />}
    </g>
  );
};

export const Character: React.FC<CharProps> = (props) => {
  const {
    x, y, id, scale = 1, flip = false, pose = {}, look = HERO, eyeOpen = 0.85, eyeKind = "normal", mouth = "flat",
    bags = false, backpack = false, cape = 0, chain = 0, glasses = false, tie = false, bulk = 1, smear = 0,
    propL = "none", propR = "none", gaze = 0, frame = 0,
  } = props;
  const { lean = 0, head = 0, shL = 8, elL = 10, shR = -6, elR = 10, hpL = 0, knL = 0, hpR = 0, knR = 0 } = pose;
  const tw = 58 * bulk;
  const lc = clampAngle(lean, -30, 40);
  const hc = clampAngle(head, -40, 40);
  const hair = look.hairStyle ?? "short";
  const browTilt = mouth === "cold" || mouth === "smirk" || mouth === "grin" ? 7 : 0;
  const mouthEl =
    mouth === "open" ? <ellipse cx={0} cy={-40} rx={12} ry={14} fill="#3A1018" stroke={C.ink} strokeWidth={INK2} />
    : mouth === "grin" ? <path d="M -24 -48 Q 0 -20 24 -48 Z" fill="#fff" stroke={C.ink} strokeWidth={INK2} />
    : mouth === "smirk" ? <path d="M -14 -38 Q 6 -36 18 -50" fill="none" stroke={C.ink} strokeWidth={INK2 + 1} strokeLinecap="round" />
    : mouth === "cold" ? <path d="M -13 -38 L 13 -41" fill="none" stroke={C.ink} strokeWidth={INK2 + 1} strokeLinecap="round" />
    : <path d="M -14 -41 L 14 -41" fill="none" stroke={C.ink} strokeWidth={INK2 + 1} strokeLinecap="round" />;

  return (
    <g transform={`translate(${x},${y}) scale(${flip ? -scale : scale},${scale})`}>
      {cape > 0 && <Cape p={cape} frame={frame} />}
      {backpack && (
        <g transform={`rotate(${lc})`}>
          <rect x={-tw - 52} y={-172} width={64} height={152} rx={16} fill="#4A3F36" stroke={C.ink} strokeWidth={INK} />
          <rect x={-tw - 42} y={-118} width={44} height={40} rx={8} fill={C.coffee} stroke={C.ink} strokeWidth={INK2} />
        </g>
      )}
      <Leg x={-24} hp={hpL} kn={knL} pants={look.pants} shoes={look.shoes} />
      <Leg x={24} hp={hpR} kn={knR} pants={look.pants} shoes={look.shoes} />
      <rect x={-52} y={-8} width={104} height={50} rx={16} fill={look.pants} stroke={C.ink} strokeWidth={INK} />
      <g transform={`rotate(${lc})`}>
        <Arm x={tw + 2} sh={shR} el={elR} col={look.shirt} skin={look.skin} prop={propR} />
        <path d={`M ${-tw} -176 Q 0 -206 ${tw} -176 L ${tw * 0.86} 6 L ${-tw * 0.86} 6 Z`} fill={look.shirt} stroke={C.ink} strokeWidth={INK} strokeLinejoin="round" />
        <path d={`M ${tw * 0.25} -192 L ${tw} -176 L ${tw * 0.86} 6 L ${tw * 0.35} 6 Z`} fill={C.ink} opacity={0.2} />
        {tie && <path d="M -9 -196 L 9 -196 L 14 -90 L 0 -70 L -14 -90 Z" fill={C.red} stroke={C.ink} strokeWidth={INK2} />}
        {backpack && <path d={`M ${-tw + 12} -188 Q ${-tw + 4} -100 ${-tw + 18} -18`} stroke="#2A241F" strokeWidth={13} fill="none" strokeLinecap="round" />}
        <Arm x={-tw - 2} sh={shL} el={elL} col={look.shirt} skin={look.skin} prop={propL} />
        {smear > 0 && (
          <g opacity={0.35 * smear}>
            <Arm x={tw + 2} sh={shR + 55 * smear} el={elR} col={look.shirt} skin={look.skin} stretch={1 + 0.35 * smear} />
            <Arm x={-tw - 2} sh={shL - 55 * smear} el={elL} col={look.shirt} skin={look.skin} stretch={1 + 0.35 * smear} />
          </g>
        )}
        {/* Cabeza */}
        <g transform={`translate(0,-196) rotate(${hc})`}>
          <rect x={-14} y={-30} width={28} height={56} fill={look.skin} stroke={C.ink} strokeWidth={INK2 + 1} />
          <circle cx={-56} cy={-80} r={11} fill={look.skin} stroke={C.ink} strokeWidth={INK2 + 1} />
          <circle cx={56} cy={-80} r={11} fill={look.skin} stroke={C.ink} strokeWidth={INK2 + 1} />
          <ellipse cx={0} cy={-82} rx={56} ry={64} fill={look.skin} stroke={C.ink} strokeWidth={INK} />
          {hair === "spiky" && <path d="M -58 -92 L -50 -156 L -28 -126 L -10 -176 L 8 -128 L 30 -170 L 42 -122 L 64 -150 L 58 -90 Q 30 -126 0 -120 Q -30 -126 -58 -92 Z" fill={look.hair} stroke={C.ink} strokeWidth={INK2 + 1} strokeLinejoin="round" />}
          {(hair === "short" || hair === "bun") && <path d="M -58 -88 Q -62 -154 0 -156 Q 62 -154 58 -88 Q 30 -120 0 -114 Q -30 -120 -58 -88 Z" fill={look.hair} stroke={C.ink} strokeWidth={INK2 + 1} />}
          {hair === "bun" && <circle cx={0} cy={-170} r={22} fill={look.hair} stroke={C.ink} strokeWidth={INK2 + 1} />}
          <Eye id={`${id}-eL`} cx={-24} cy={-78} kind={eyeKind} open={eyeOpen} skin={look.skin} gaze={gaze} />
          <Eye id={`${id}-eR`} cx={24} cy={-78} kind={eyeKind} open={eyeOpen} skin={look.skin} gaze={gaze} />
          <path d={`M -40 ${-100 - browTilt} L -10 ${-100 + browTilt * 0.4} M 10 ${-100 + browTilt * 0.4} L 40 ${-100 - browTilt}`} stroke={C.ink} strokeWidth={INK2 + 1.5} strokeLinecap="round" />
          {bags && (
            <>
              <path d="M -42 -62 Q -24 -50 -6 -62 Q -24 -56 -42 -62 Z" fill={C.bags} stroke={C.bags} strokeWidth={5} />
              <path d="M 6 -62 Q 24 -50 42 -62 Q 24 -56 6 -62 Z" fill={C.bags} stroke={C.bags} strokeWidth={5} />
            </>
          )}
          {glasses && <g fill="none" stroke={C.ink} strokeWidth={INK2 + 1}><circle cx={-24} cy={-78} r={21} /><circle cx={24} cy={-78} r={21} /><line x1={-3} x2={3} y1={-78} y2={-78} /></g>}
          {mouthEl}
        </g>
        {/* Barra de XP serpenteando como cadena en el cuello */}
        {chain > 0 && (
          <g filter="url(#glow)" opacity={Math.min(1, chain * 1.5)}>
            <ellipse cx={0} cy={-196} rx={34 + 6 * chain} ry={12} fill="none" stroke={C.xp} strokeWidth={9 + 5 * chain} />
            <polyline
              points={Array.from({ length: 16 }, (_, i) => `${40 * chain * Math.sin(i * 0.9 + frame * 0.2)},${-190 + i * 14}`).join(" ")}
              fill="none" stroke={C.xp} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round"
            />
          </g>
        )}
      </g>
    </g>
  );
};

/* ========================================================================== */
/*  ESCENA 0 — EL GANCHO PSICOLÓGICO                                           */
/* ========================================================================== */
const EyeECU: React.FC<{ f: number }> = ({ f }) => {
  const cx = LOOP.x, cy = LOOP.y, rx = 480, ry = 300;
  const blink = f >= 88 && f <= 106 ? 1 - 0.85 * Math.sin(((f - 88) / 18) * Math.PI) : 1;
  const open = 0.84 * blink; // párpado pesado de las 3:00 AM
  const lidH = (1 - open) * (ry * 2 + 20);
  const pct = f < 60 ? 98 : f < 120 ? 99 : 100;
  const fill = interpolate(f, [0, 60, 120, 165], [0.97, 0.98, 0.99, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <g>
      <rect width={W} height={H} fill="url(#skinBG)" />
      <path d="M 40 560 Q 420 380 1040 520" stroke={C.ink} strokeWidth={28} fill="none" strokeLinecap="round" />
      {Array.from({ length: 14 }, (_, i) => <line key={i} x1={80 + i * 66} y1={560 - Math.sin(i / 4) * 80} x2={96 + i * 66} y2={510 - Math.sin(i / 4) * 80} stroke={C.ink} strokeWidth={6} />)}
      <clipPath id="ecu-eye"><ellipse cx={cx} cy={cy} rx={rx} ry={ry} /></clipPath>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#FFEFEA" />
      <g clipPath="url(#ecu-eye)">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2, ex = cx + Math.cos(a) * rx, ey = cy + Math.sin(a) * ry;
          return <path key={i} d={`M ${ex} ${ey} Q ${lerp(ex, cx, 0.5) + rnd(i) * 40} ${lerp(ey, cy, 0.5) - rnd(i + 4) * 40} ${lerp(ex, cx, 0.75)} ${lerp(ey, cy, 0.75)}`} stroke={C.red} strokeWidth={4} fill="none" opacity={0.55} />;
        })}
        <circle cx={cx} cy={cy} r={240} fill="url(#irisG)" stroke={C.ink} strokeWidth={INK} />
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * Math.PI * 2;
          return <line key={i} x1={cx + Math.cos(a) * LOOP.r} y1={cy + Math.sin(a) * LOOP.r} x2={cx + Math.cos(a) * 232} y2={cy + Math.sin(a) * 232} stroke="#8A6D55" strokeWidth={3} opacity={0.6} />;
        })}
        <circle cx={cx} cy={cy} r={LOOP.r} fill={C.ink} />
        {/* Reflejo de la laptop con la barra verde dentro de la pupila */}
        <clipPath id="ecu-pupil"><circle cx={cx} cy={cy} r={LOOP.r} /></clipPath>
        <g clipPath="url(#ecu-pupil)">
          <circle cx={cx} cy={cy} r={LOOP.r} fill={C.xp} opacity={0.12} />
          <g transform={`translate(${cx - 6},${cy - 8})`}>
            <rect x={-92} y={-62} width={184} height={124} rx={8} fill={C.panel} stroke={C.xp} strokeWidth={3} filter="url(#glow)" />
            <text x={0} y={-12} textAnchor="middle" fontFamily={FONT} fontSize={52} fill={C.xp}>{pct}%</text>
            <rect x={-70} y={14} width={140} height={20} rx={10} fill="#0B1F18" stroke={C.xp} strokeWidth={2} />
            <rect x={-68} y={16} width={136 * fill} height={16} rx={8} fill="url(#xpFill)" />
          </g>
          <circle cx={cx + 62} cy={cy - 74} r={20} fill="#fff" opacity={0.85} />
        </g>
        <rect x={cx - rx - 10} y={cy - ry - 10} width={rx * 2 + 20} height={lidH} fill={C.skin} />
        <line x1={cx - rx} x2={cx + rx} y1={cy - ry - 10 + lidH} y2={cy - ry - 10 + lidH} stroke={C.ink} strokeWidth={INK} />
      </g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={C.ink} strokeWidth={INK + 2} />
      <path d={`M ${cx - 430} ${cy + 250} Q ${cx} ${cy + 400} ${cx + 430} ${cy + 250} Q ${cx} ${cy + 340} ${cx - 430} ${cy + 250} Z`} fill={C.bags} opacity={0.85} />
    </g>
  );
};

const INMATES = [
  { z: 1.9, lat: -0.62 }, { z: 2.1, lat: 0.58 }, { z: 2.6, lat: -0.22 }, { z: 2.9, lat: 0.34 }, { z: 3.3, lat: -0.6 },
  { z: 3.7, lat: 0.12 }, { z: 4.1, lat: 0.62 }, { z: 4.7, lat: -0.36 }, { z: 5.3, lat: 0.3 }, { z: 5.9, lat: -0.55 },
  { z: 6.5, lat: 0.16 }, { z: 7.2, lat: -0.12 },
];
const SKINS = ["#E8C5B0", "#C69C84", "#8D6B58", "#F1D4C2"];
const HAIRS = ["#1E1A22", "#3A2A1E", "#6B6B70", "#0B0E14"];

const Corridor: React.FC<{ f: number }> = ({ f }) => {
  const sc = (z: number) => 1 / z;
  const xl = (z: number) => 540 - 560 * sc(z), xr = (z: number) => 540 + 560 * sc(z);
  const yt = (z: number) => 820 - 900 * sc(z), yb = (z: number) => 820 + 1100 * sc(z);
  const zs = [0.8, 1.4, 2, 2.8, 3.8, 5, 6.6, 8.6, 12];
  const panels = zs.slice(0, -1).map((z0, i) => ({ z0, z1: zs[i + 1], i })).reverse();
  const sorted = [...INMATES].sort((a, b) => b.z - a.z);
  const drawPerson = (z: number, lat: number, i: number, hero = false) => {
    const s = sc(z), k = 1.9 * s;
    const px = 540 + lat * 560 * s, footY = yb(z), py = footY - FOOT * k;
    const t = f * 0.2 + i;
    return (
      <g key={`in${i}${hero}`}>
        {!hero && (
          <rect x={px + (lat > 0 ? -1 : 1) * 80 * k - 50 * k} y={py - 190 * k} width={100 * k} height={120 * k} fill={C.cyan} opacity={0.1 + 0.08 * Math.sin(t)} stroke={C.cyan} strokeWidth={2} />
        )}
        <Character
          id={`c0-${i}${hero ? "h" : ""}`} x={px} y={py} scale={k} flip={lat > 0}
          look={hero ? { ...HERO, shirt: "#3C4A5E" } : { skin: SKINS[i % 4], hair: HAIRS[i % 4], shirt: i % 2 ? "#CFD8DC" : "#B7C4CC", pants: "#9FB0BA", shoes: "#6B7580", hairStyle: i % 3 === 0 ? "bald" : "short" }}
          pose={hero ? { lean: 14, head: 12, shL: 12, elL: 15, shR: -14, elR: 15, hpL: 12 * Math.sin(f * 0.22), hpR: -12 * Math.sin(f * 0.22) } : { shL: 75 + 8 * Math.sin(t), elL: 25, shR: 65 + 6 * Math.cos(t), elR: 35 }}
          eyeKind={hero ? "normal" : "dilated"} eyeOpen={hero ? 0.7 : 1} bags backpack={hero} mouth={hero ? "flat" : "open"}
        />
      </g>
    );
  };
  return (
    <g>
      <rect width={W} height={H} fill="#2D3748" />
      <polygon points={`${xl(12)},${yb(12)} ${xr(12)},${yb(12)} ${xr(0.8)},${yb(0.8)} ${xl(0.8)},${yb(0.8)}`} fill="#8A97A6" />
      <polygon points={`${xl(12)},${yt(12)} ${xr(12)},${yt(12)} ${xr(0.8)},${yt(0.8)} ${xl(0.8)},${yt(0.8)}`} fill="#3A4558" />
      <rect x={xl(12)} y={yt(12)} width={xr(12) - xl(12)} height={yb(12) - yt(12)} fill="#1B222C" />
      <rect x={520} y={790} width={40} height={32} fill={C.xp} opacity={0.8} filter="url(#glow)" />
      {panels.map(({ z0, z1, i }) => (
        <g key={i}>
          {[-1, 1].map((sd) => {
            const X = (z: number) => (sd < 0 ? xl(z) : xr(z));
            const zm = (z0 + z1) / 2;
            return (
              <g key={sd}>
                <polygon points={`${X(z0)},${yt(z0)} ${X(z1)},${yt(z1)} ${X(z1)},${yb(z1)} ${X(z0)},${yb(z0)}`} fill={i % 2 ? "#5B6B7F" : "#677789"} stroke={C.ink} strokeWidth={3} />
                <ellipse cx={X(zm)} cy={820 + 120 * sc(zm)} rx={26 * sc(zm)} ry={120 * sc(zm)} fill="#4A586B" stroke={C.ink} strokeWidth={2} />
              </g>
            );
          })}
          <rect x={540 - 140 * sc(z0)} y={yt(z0) + 4} width={280 * sc(z0)} height={26 * sc(z0)} fill="#CFEFFF" opacity={0.7 + 0.2 * Math.sin(f * 0.4 + i * 2)} />
        </g>
      ))}
      {zs.map((z) => <line key={z} x1={xl(z)} x2={xr(z)} y1={yb(z)} y2={yb(z)} stroke={C.ink} strokeWidth={2} opacity={0.4} />)}
      {sorted.map((p, i) => drawPerson(p.z, p.lat, i))}
      {drawPerson(1.35, 0, 99, true)}
    </g>
  );
};

const Scene0: React.FC<{ f: number; fps: number; abs: boolean }> = ({ f, abs }) => {
  const wipeP = eIO(prog(f, 180, 232));
  const bandX = lerp(-300, W + 300, wipeP);
  const zoom = lerp(2.6, 1, eOut(prog(f, 200, 330)));
  const boom = prog(f, 165, 215);
  const pulse = f >= 165 && f < 182 ? 1 : 0;
  return (
    <SceneShell
      scene={0} abs={abs}
      cues={[[1, "assets/audio/sfx/ambience/tension_riser.wav", 0.8], [165, "assets/audio/sfx/ui/switch20.wav", 0.95], [180, "assets/audio/sfx/impacts/sub_impact_thud.wav", 0.9]]}
      vfx={<Vfx src="assets/2d/vfx/particles/flare_01.png" x={LOOP.x} y={LOOP.y} size={lerp(300, 1900, eOut(boom))} opacity={f >= 165 ? 1 - prog(f, 188, 220) : 0} rot={f * 2} />}
    >
      <defs>
        <clipPath id="s0-eye"><rect x={bandX} y={0} width={W} height={H} /></clipPath>
        <clipPath id="s0-hall"><rect x={0} y={0} width={bandX} height={H} /></clipPath>
      </defs>
      {f < 240 && <g clipPath="url(#s0-eye)"><EyeECU f={f} /></g>}
      {f >= 180 && (
        <g clipPath="url(#s0-hall)">
          <g transform={`translate(540,960) scale(${zoom}) translate(-540,-960)`}><Corridor f={f} /></g>
          {/* Lente fish-eye: viñeta + anillos de distorsión que se relajan */}
          <rect width={W} height={H} fill="url(#vigFish)" />
          {[0.9, 0.7, 0.5].map((k, i) => <ellipse key={i} cx={540} cy={960} rx={540 * k * (1 + 0.3 * (1 - prog(f, 200, 330)))} ry={960 * k * (1 + 0.3 * (1 - prog(f, 200, 330)))} fill="none" stroke={C.xp} strokeWidth={2} opacity={0.18 * (1 - prog(f, 200, 340))} />)}
        </g>
      )}
      {f >= 180 && f <= 240 && <LightBand x={bandX} />}
      {f < 165 && <Txt x={540} y={300} size={50} fill={C.cyan} op={prog(f, 4, 20)}>03:00 AM</Txt>}
      {pulse > 0 && <circle cx={LOOP.x} cy={LOOP.y} r={lerp(150, 900, eOut(prog(f, 165, 182)))} fill="none" stroke={C.xp} strokeWidth={22} opacity={0.9} filter="url(#glow)" />}
      {f >= 165 && f < 200 && <rect width={W} height={H} fill="#fff" opacity={0.7 * (1 - prog(f, 165, 192))} />}
      {/* Light wipe de salida hacia el campus (Match Cut 0 → 1) */}
      <rect width={W} height={H} fill={C.xpCore} opacity={eIn(prog(f, 384, 420))} />
    </SceneShell>
  );
};

/* ========================================================================== */
/*  ESCENA 1 — LA ILUSIÓN DE LAS NOVELAS LIGERAS                               */
/* ========================================================================== */
const Campus: React.FC<{ off: number }> = ({ off }) => (
  <g>
    <defs><linearGradient id="campusSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.bg} /><stop offset="1" stopColor={C.wall} /></linearGradient></defs>
    <rect width={W} height={H} fill="url(#campusSky)" />
    {Array.from({ length: 8 }, (_, i) => {
      const bx = mod(i * 260 - off * 0.2, 2080) - 300, bh = 360 + rnd(i) * 300;
      return (
        <g key={i}>
          <rect x={bx} y={1250 - bh} width={230} height={bh} fill="#222B38" stroke={C.ink} strokeWidth={INK2} />
          {Array.from({ length: 6 }, (_, j) => <rect key={j} x={bx + 28 + (j % 2) * 100} y={1250 - bh + 40 + Math.floor(j / 2) * 90} width={56} height={46} fill={rnd(i * 9 + j) > 0.6 ? "#5C4D42" : "#1B222C"} />)}
        </g>
      );
    })}
    {Array.from({ length: 6 }, (_, i) => {
      const tx = mod(i * 420 - off * 0.55, 2520) - 300;
      return (
        <g key={i}>
          <rect x={tx - 12} y={1090} width={24} height={300} fill="#1B1F27" stroke={C.ink} strokeWidth={INK2} />
          <circle cx={tx} cy={1060} r={110} fill="#27343A" stroke={C.ink} strokeWidth={INK} />
        </g>
      );
    })}
    <rect y={1480} width={W} height={440} fill="#232B36" />
    <rect y={1480} width={W} height={10} fill={C.ink} />
    {Array.from({ length: 9 }, (_, i) => <rect key={i} x={mod(i * 220 - off, 1980) - 220} y={1700} width={120} height={14} fill="#3B4656" />)}
  </g>
);

const BOOK: [number, number][] = [[-120, -50], [0, -58], [120, -50], [128, 0], [120, 50], [0, 58], [-120, 50], [-128, 0]];
const BLADE: [number, number][] = [[0, -330], [16, -200], [26, -60], [26, 50], [0, 64], [-26, 50], [-26, -60], [-16, -200]];

const Scene1: React.FC<{ f: number; fps: number; abs: boolean }> = ({ f, fps, abs }) => {
  const q = onOnes(f);
  const walk = 1 - prog(f, 225, 255);
  const w = q * 0.22;
  const cp = eOut(prog(f, 110, 230)); // progreso de la capa heroica
  const off = Math.min(f, 255) * 3;
  const bob = Math.abs(Math.sin(w)) * 10 * walk;
  const shirt = interpolateColors(cp, [0, 1], ["#3C4A5E", "#8E1B3F"]);
  const camK = 1 + 0.12 * prog(f, 240, 450);
  const heroX = f < 450 ? 500 : lerp(500, 300, eIO(prog(f, 450, 500)));
  const m = eIO(prog(f, 450, 520)); // libros → espada
  const slash = prog(f, 520, 560);
  const ang = f < 520 ? -18 + Math.sin(f * 0.1) * 4 : lerp(-18, 75, eOut(slash));
  const pts = BOOK.map((b, i) => `${lerp(b[0], BLADE[i][0], m)},${lerp(b[1], BLADE[i][1], m)}`).join(" ");
  const fade = 1 - prog(f, 600, 632);
  const swordY = 1150 + Math.sin(f * 0.07) * 14;
  const brush = prog(f, 88, 138);
  return (
    <SceneShell
      scene={1} abs={abs}
      cues={[[5, "assets/audio/sfx/whooshes/whoosh_fast.wav", 0.85], [240, "assets/audio/sfx/ui/click1.wav", 0.85], [480, "assets/audio/sfx/ui/switch10.wav", 0.95]]}
      vfx={<Vfx src="assets/2d/vfx/particles/star_01.png" x={540} y={560} size={lerp(200, 900, eOut(prog(f, 560, 600)))} opacity={f >= 560 ? 1 - prog(f, 585, 625) : 0} rot={f * 3} />}
    >
      <g transform={`translate(540,1000) scale(${camK}) translate(-540,-1000)`}>
        <Campus off={off} />
        {f < 450 && (
          <>
            <path d="M 300 1020 C 420 880 600 1120 760 960" stroke={C.xp} strokeWidth={36} fill="none" strokeLinecap="round" strokeDasharray={700} strokeDashoffset={700 * (1 - brush)} opacity={f < 140 ? 0.9 : 1 - prog(f, 140, 180)} filter="url(#glow)" />
            <Character
              id="h1" x={heroX} y={1180 - bob} scale={1.15} frame={f} backpack cape={cp} bags
              look={{ ...HERO, shirt }}
              pose={{ lean: lerp(14, 2, cp), head: lerp(12, -4, cp), shL: 25 * Math.sin(w + Math.PI) * walk + 22 * (1 - walk), elL: 12 + 78 * (1 - walk), shR: 25 * Math.sin(w) * walk + 22 * (1 - walk), elR: 12 + 78 * (1 - walk), hpL: 28 * Math.sin(w) * walk, knL: 30 * Math.max(0, -Math.sin(w + 0.8)) * walk, hpR: -28 * Math.sin(w) * walk, knR: 30 * Math.max(0, Math.sin(w + 0.8)) * walk }}
              eyeKind={f > 250 ? "dilated" : "normal"} eyeOpen={f > 250 ? 1 : 0.7} mouth={f > 250 ? "smirk" : "flat"}
            />
          </>
        )}
        {f >= 450 && (
          <Character
            id="h1b" x={heroX} y={1260} scale={1} frame={f} cape={1} bags backpack={false} look={{ ...HERO, shirt: "#8E1B3F" }}
            pose={{ lean: -4, head: -4, shR: 95 + 6 * Math.sin(f * 0.2), elR: 12, shL: 20, elL: 90, hpL: 10, hpR: -10 }}
            eyeKind="dilated" eyeOpen={1} mouth="grin"
          />
        )}
        {/* 1C: morphing de libros de Cálculo II → espada */}
        {f >= 450 && fade > 0 && (
          <g transform={`translate(700,${swordY}) rotate(${ang})`} opacity={fade}>
            {slash > 0 && slash < 1 && [1, 2, 3].map((k) => <polygon key={k} points={pts} transform={`rotate(${-k * 14})`} fill={C.cyan} opacity={0.25 / k} />)}
            <polygon points={pts} fill={interpolateColors(m, [0, 1], [C.coffee, "#CFF8FF"])} stroke={C.ink} strokeWidth={INK} strokeLinejoin="round" filter={m > 0.6 ? "url(#glow)" : undefined} />
            {m < 0.7 && [-30, 0, 30].map((y) => <line key={y} x1={-110 * (1 - m)} x2={110 * (1 - m)} y1={y} y2={y} stroke={C.ink} strokeWidth={INK2} opacity={1 - m} />)}
            <g opacity={m}>
              <rect x={-90} y={60} width={180} height={22} rx={8} fill={C.gold} stroke={C.ink} strokeWidth={INK2 + 1} />
              <rect x={-12} y={80} width={24} height={80} rx={8} fill="#2A141F" stroke={C.ink} strokeWidth={INK2 + 1} />
              <circle cx={0} cy={172} r={16} fill={C.gold} stroke={C.ink} strokeWidth={INK2 + 1} />
            </g>
          </g>
        )}
        {slash > 0 && slash < 1 && <path d="M 430 760 Q 780 640 930 1100" stroke={C.cyan} strokeWidth={30} fill="none" strokeLinecap="round" strokeDasharray={900} strokeDashoffset={900 * (1 - eOut(slash))} filter="url(#glow)" opacity={1 - slash * 0.6} />}
        {f >= 598 && <PixelRain p={prog(f, 598, 660)} x0={700} y0={1100} spread={600} floorY={2000} />}
      </g>
      {/* HUD (Safe Zone) */}
      <HoloPanel cx={540} cy={440} w={780} h={230} p={f >= 240 && f < 450 ? pop(f, 240, fps) : f >= 450 ? 1 - prog(f, 450, 470) : 0} lines={["[Misión Diaria:", "Sobrevivir a Cálculo II]"]} size={44} />
      {f >= 560 && f < 640 && <Txt x={540} y={560} size={130} fill={C.gold} rot={-6} op={1 - prog(f, 625, 640)}>¡NIVEL 2!</Txt>}
      {/* Light wipe de entrada (viene del pasillo) y velo cian de salida (hacia el libro) */}
      <rect width={W} height={H} fill={C.xpCore} opacity={1 - eOut(prog(f, 0, 40))} />
      <rect width={W} height={H} fill={C.cyan} opacity={0.5 * prog(f, 636, 660)} />
    </SceneShell>
  );
};

/* ========================================================================== */
/*  ESCENA 2 — LA TRAMPA DE LA DOPAMINA                                        */
/* ========================================================================== */
const OpenBook: React.FC<{ x: number; y: number; f: number }> = ({ x, y, f }) => (
  <g transform={`translate(${x},${y})`}>
    <path d="M -220 20 L 0 -6 L 0 150 L -220 176 Z" fill="#F2E8DC" stroke={C.ink} strokeWidth={INK} strokeLinejoin="round" />
    <path d="M 220 20 L 0 -6 L 0 150 L 220 176 Z" fill="#EADFCF" stroke={C.ink} strokeWidth={INK} strokeLinejoin="round" />
    {Array.from({ length: 6 }, (_, i) => (
      <g key={i}>
        <path d={`M -200 ${44 + i * 22} L -20 ${28 + i * 22}`} stroke={i === Math.floor(f / 24) % 6 ? C.xp : "#8A7F74"} strokeWidth={i === Math.floor(f / 24) % 6 ? 6 : 3} />
        <path d={`M 20 ${28 + i * 22} L 200 ${44 + i * 22}`} stroke="#8A7F74" strokeWidth={3} />
      </g>
    ))}
  </g>
);

const BRAIN = "M -150 -80 C -160 -200 -40 -250 40 -220 C 130 -220 175 -150 140 -80 C 150 -10 70 20 -10 10 C -90 40 -160 10 -150 -80 Z";
const PROFILE = "M -170 330 L -150 120 C -230 60 -240 -120 -150 -220 C -80 -300 90 -300 160 -210 C 200 -160 205 -120 200 -90 L 245 -10 L 205 5 C 215 40 205 70 170 85 C 175 130 140 150 100 150 L 90 330 Z";

const BG_2C = [C.wall, C.coffee, C.bg];

const Scene2: React.FC<{ f: number; fps: number; abs: boolean }> = ({ f, fps, abs }) => {
  const [sx, sy] = shake(f, 14);
  const bookK = lerp(2.4, 1, eOut(prog(f, 0, 80)));
  const sub = f < 240 ? "A" : f < 480 ? "B" : "C";
  const pct = f < 100 ? 0.12 : f < 140 ? 0.16 : lerp(0.2, 0.92, eOut(prog(f, 140, 190)));
  const crit = pop(f, 140, fps);
  const f2 = f - 240;
  /* 2C */
  const c = f - 480;
  const idx = Math.floor(c / 30), act = ((idx % 3) + 3) % 3, cl = c - idx * 30;
  const smear = Math.max(0, 1 - cl / 8);
  const qc = onOnes(c);
  const neck = prog(f, 800, 840);
  return (
    <SceneShell
      scene={2} abs={abs}
      cues={[[30, "assets/audio/sfx/ui/switch5.wav", 0.85], [140, "assets/audio/sfx/ui/click3.wav", 0.95], [480, "assets/audio/sfx/whooshes/whoosh_cinematic.wav", 0.9]]}
      vfx={<Vfx src="assets/2d/vfx/sparks/spark_01.png" x={540} y={640} size={lerp(300, 1300, eOut(prog(f, 140, 175)))} opacity={f >= 140 && f < 220 ? 1 - prog(f, 170, 220) : 0} rot={f * 4} />}
    >
      {sub === "A" && (
        <g>
          <rect width={W} height={H} fill={C.wall} />
          <rect x={90} y={300} width={560} height={300} fill="#34463F" stroke={C.ink} strokeWidth={INK} />
          <path d="M 130 380 L 330 360 M 130 440 L 460 420 M 130 500 L 300 490" stroke="#E6EFE9" strokeWidth={4} />
          <rect x={760} y={300} width={220} height={400} fill="#1B222C" stroke={C.ink} strokeWidth={INK} />
          <rect y={1420} width={W} height={500} fill="#3A332D" />
          <g transform={`translate(700,1330) scale(${bookK}) translate(-700,-1330)`}>
            <Character
              id="h2" x={330} y={1150} scale={1.2} bags frame={f} look={HERO}
              pose={{ lean: 18, head: 22, hpL: 85, knL: 90, hpR: 85, knR: 90, shR: 55, elR: 55, shL: 50, elL: 60 }} eyeOpen={0.55} mouth="flat"
            />
            <rect x={440} y={1290} width={600} height={40} fill={C.coffee} stroke={C.ink} strokeWidth={INK} />
            <rect x={470} y={1330} width={24} height={200} fill="#3E342C" stroke={C.ink} strokeWidth={INK2} />
            <OpenBook x={700} y={1230} f={f} />
            <PixelRain p={prog(f, 0, 70) * 0.85 + 0.15} x0={700} y0={600} spread={420} floorY={1230} n={60} />
          </g>
          {f >= 100 && f < 140 && <Txt x={700} y={1100 - (f - 100) * 2} size={54} fill={C.xp} op={1 - prog(f, 125, 140)}>+5 XP</Txt>}
          <XPBar x={190} y={310} w={700} h={46} pct={pct} label="XP" />
          {f >= 140 && f < 240 && (
            <g transform={`translate(${540 + sx},${700 + sy}) scale(${Math.min(1.1, crit)})`}>
              <Starburst cx={0} cy={0} r1={340} r2={230} n={14} rot={f * 0.02} fill={C.gold} />
              <Txt x={0} y={-10} size={92} fill={C.red} rot={-5}>¡CRÍTICO!</Txt>
              <Txt x={0} y={100} size={110} fill="#fff" rot={-5}>+500 XP</Txt>
            </g>
          )}
        </g>
      )}
      {sub === "B" && (
        <g>
          <rect width={W} height={H} fill="#10131B" />
          <SpeedLines cx={540} cy={960} n={40} seed={3} color={C.gold} inner={420} outer={760} op={0.12 + 0.1 * Math.sin(f * 0.3)} />
          <g transform="translate(540,1010) scale(1.4)">
            <path d={PROFILE} fill={C.skin} stroke={C.ink} strokeWidth={INK} strokeLinejoin="round" />
            <path d={BRAIN} fill="#D98AA8" stroke={C.ink} strokeWidth={INK} filter="url(#glow)" opacity={0.96} />
            <path d="M -110 -120 C -60 -170 -20 -120 20 -170 M -120 -50 C -60 -90 -20 -40 40 -90 M 40 -40 C 90 -80 110 -40 130 -110" fill="none" stroke="#A8587A" strokeWidth={INK2 + 1.5} strokeLinecap="round" />
            <circle cx={-10} cy={-90} r={46 + 10 * Math.sin(f * 0.3)} fill={C.gold} opacity={0.28} filter="url(#glow)" />
          </g>
          {/* Tragamonedas: tres rodillos + palanca */}
          <g transform="translate(540,420)">
            {[-150, 0, 150].map((dx, i) => (
              <g key={i} transform={`translate(${dx},0)`}>
                <rect x={-62} y={-80} width={124} height={160} rx={14} fill={C.panel} stroke={C.gold} strokeWidth={INK} filter="url(#glow)" />
                <text y={30} textAnchor="middle" fontFamily={FONT} fontSize={110} fill={C.gold} stroke={C.ink} strokeWidth={8} paintOrder="stroke">{f2 < 90 + i * 20 ? Math.floor(f2 / 3 + i * 4) % 10 : 7}</text>
              </g>
            ))}
            <line x1={260} y1={20} x2={260} y2={-90 + 150 * (f2 < 15 ? prog(f2, 0, 15) : 0)} stroke={C.ink} strokeWidth={14} strokeLinecap="round" />
            <circle cx={260} cy={-90 + 150 * (f2 < 15 ? prog(f2, 0, 15) : 0)} r={26} fill={C.red} stroke={C.ink} strokeWidth={INK} />
          </g>
          {f2 > 100 && <Txt x={540} y={1560} size={100} fill={C.gold} rot={-4 + Math.sin(f * 0.5) * 2}>¡JACKPOT!</Txt>}
          {Array.from({ length: 34 }, (_, i) => {
            const u = mod(f2 - 10 - i * 4, 90) / 90;
            if (f2 < 10) return null;
            const ox = 540 + (rnd(i) - 0.5) * 760 * u, oy = 1000 - 520 * u + 700 * u * u * rnd(i + 5), r = 10 + rnd(i + 2) * 18;
            return <circle key={i} cx={ox} cy={oy} r={r} fill="url(#orbG)" stroke={C.ink} strokeWidth={2.5} opacity={1 - u * 0.5} />;
          })}
        </g>
      )}
      {sub === "C" && (
        <g transform={`translate(${(rnd(idx) - 0.5) * 10},${(rnd(idx + 5) - 0.5) * 10})`}>
          <rect width={W} height={H} fill={BG_2C[act]} />
          {act === 0 && Array.from({ length: 8 }, (_, i) => <rect key={i} x={110 + i * 110} y={420 + (i % 3) * 30} width={80} height={340} fill={i % 2 ? "#3E342C" : "#4C3F34"} stroke={C.ink} strokeWidth={INK2} />)}
          {act === 1 && <><circle cx={820} cy={420} r={110} fill="#E6EFE9" stroke={C.ink} strokeWidth={INK} /><rect x={200} y={600} width={24} height={900} fill="#232B36" stroke={C.ink} strokeWidth={INK2} /></>}
          {act === 2 && <><rect x={120} y={900} width={840} height={40} fill="#8A97A6" stroke={C.ink} strokeWidth={INK} /><path d="M 760 900 L 760 800 Q 760 760 820 760" stroke="#CFD8DC" strokeWidth={22} fill="none" /></>}
          <rect y={1560} width={W} height={360} fill="#232B36" />
          <SpeedLines cx={540} cy={1000} n={34} seed={idx} color={idx % 2 ? C.xp : "#fff"} inner={300} outer={700} op={0.22} />
          <Character
            id="h2c" x={540} y={1180 - (act === 1 ? Math.abs(Math.sin(qc * 0.2)) * 150 : 0)} scale={1.3} frame={qc} chain={Math.min(1, 0.4 + c / 360)} smear={smear} bags
            look={HERO} eyeKind="bloodshot" eyeOpen={1} mouth="open" propL={act === 0 ? "book" : act === 2 ? "dish" : "none"} propR={act === 0 ? "book" : act === 2 ? "dish" : "none"}
            gaze={Math.sin(qc * 0.6) * 6}
            pose={
              act === 0 ? { lean: 10, shL: 78 + 6 * Math.sin(qc * 0.5), elL: 70, shR: 78, elR: 70, hpL: 6, hpR: -6 }
              : act === 1 ? { lean: -6, shL: 80 * Math.sin(qc * 0.4), elL: 30, shR: -80 * Math.sin(qc * 0.4), elR: 30, hpL: -10, knL: 115, hpR: 8 }
              : { lean: 14, shL: 40 + 30 * Math.sin(qc * 0.9), elL: 85, shR: 40 - 30 * Math.sin(qc * 0.9), elR: 85, hpL: 10, hpR: -10 }
            }
          />
          <XPBar x={190} y={300} w={700} h={40} pct={Math.min(1, 0.5 + c / 700)} />
        </g>
      )}
      {/* Pre-Match Cut: la cadena de XP aprieta el cuello y se vuelve línea horizontal */}
      {f >= 790 && (
        <g>
          <rect width={W} height={H} fill={C.ink} opacity={prog(f, 790, 810)} />
          <g opacity={prog(f, 796, 812)}>
            <rect x={400} y={720} width={280} height={160} rx={80} fill={C.skin} stroke={C.ink} strokeWidth={INK} opacity={1 - prog(neck, 0.55, 0.95)} />
            <rect x={450} y={860} width={180} height={330} fill={C.skin} stroke={C.ink} strokeWidth={INK} opacity={1 - prog(neck, 0.55, 0.95)} />
            <rect x={300} y={1100} width={480} height={200} rx={30} fill="#3C4A5E" stroke={C.ink} strokeWidth={INK} opacity={1 - prog(neck, 0.55, 0.95)} />
            <ellipse cx={540 + (rnd(f) - 0.5) * 6 * (1 - neck)} cy={960} rx={lerp(150, 370, eIn(neck))} ry={lerp(60, 7, eIn(neck))} fill="none" stroke={C.xp} strokeWidth={lerp(22, 14, neck)} filter="url(#glow)" />
          </g>
        </g>
      )}
    </SceneShell>
  );
};

/* ========================================================================== */
/*  ESCENA 3 — LA ESCLAVITUD DEL ENEMIGO                                       */
/* ========================================================================== */
const RIVAL_PROPS: Prop[] = ["cup", "paper", "cup", "paper", "cup", "paper"];

const Scene3: React.FC<{ f: number; fps: number; abs: boolean }> = ({ f, fps, abs }) => {
  const sub = f < 300 ? "A" : f < 600 ? "B" : "C";
  const grow = eOut(prog(f, 0, 40));
  const press = pop(f, 60, fps);
  const camK = 1 + 0.08 * prog(f, 40, 300);
  const f3 = f - 300;
  const snap = f3 >= 30 ? prog(f3, 30, 70) : 0;
  const bow = prog(f3, 80, 130);
  const th = ((f - 600) / 360) * Math.PI * 2;
  const orbit = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 + th, s = Math.sin(a), cs = Math.cos(a);
    return { i, x: 540 + cs * 380, y: 1345 + s * 95, z: s, k: 0.66 + 0.2 * s, flip: cs > 0 };
  }).sort((p, q) => p.z - q.z);
  const rival = (r: (typeof orbit)[number]) => {
    const fight = r.i >= 4;
    const t = f * 0.35 + r.i;
    return (
      <Character
        key={r.i} id={`z${r.i}`} x={r.x} y={r.y - 160 * r.k} scale={r.k} flip={r.flip} bags eyeKind="zombie" mouth="open" eyeOpen={0.9} propL={fight ? "none" : RIVAL_PROPS[r.i]} propR={fight ? "none" : RIVAL_PROPS[r.i]}
        look={{ skin: C.zombie, hair: "#2A2F2A", shirt: r.i % 2 ? "#4A5568" : "#5C4D42", pants: "#2A3140", shoes: "#14161C", hairStyle: r.i % 2 ? "short" : "bald" }}
        pose={{ lean: 18, head: 14, hpL: 0, knL: 100, hpR: 0, knR: 100, shL: fight ? 95 + 40 * Math.sin(t) : 80, elL: fight ? 10 : 20, shR: fight ? 95 - 40 * Math.sin(t) : 85, elR: fight ? 10 : 20 }}
      />
    );
  };
  return (
    <SceneShell
      scene={3} abs={abs}
      cues={[[60, "assets/audio/sfx/ui/click4.wav", 0.85], [300, "assets/audio/sfx/impacts/sub_impact_thud.wav", 0.95], [520, "assets/audio/sfx/ui/switch30.wav", 0.9]]}
      vfx={<Vfx src="assets/2d/vfx/particles/light_01.png" x={sub === "C" ? 540 : 300} y={sub === "C" ? 1100 : 1000} size={sub === "C" ? 1500 : 700} opacity={sub === "C" ? 0.35 : f3 >= 30 && f3 < 90 ? 1 - prog(f3, 40, 90) : 0} rot={f} />}
    >
      <defs><linearGradient id="throneBG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.shadow} /><stop offset="1" stopColor="#2A114F" /></linearGradient></defs>
      <rect width={W} height={H} fill="url(#throneBG)" />
      {sub === "A" && (
        <g transform={`translate(540,700) scale(${camK}) translate(-540,-700)`}>
          <rect x={0} y={1000} width={W} height={400} fill={C.xp} opacity={0.06 + 0.04 * Math.sin(f * 0.2)} />
          <Character
            id="h3a" x={540} y={1187} scale={2.4} look={HERO} bags eyeOpen={0.5} mouth="cold" frame={f}
            pose={{ lean: 2, head: 4, shL: 5, elL: 8, shR: -5, elR: 8 }}
          />
          {/* La barra de XP del cuello ahora es el borde del botón (Match Cut 2 → 3) */}
          <g transform={`translate(540,${960 + (press > 0 ? (1 - Math.min(1, press)) * 0 : 0)}) scale(${1 + 0.05 * (press - 1) * (f >= 60 && f < 100 ? 1 : 0)})`}>
            <rect x={-380} y={-lerp(7, 110, grow)} width={760} height={lerp(14, 220, grow)} rx={lerp(7, 28, grow)} fill={C.panel} fillOpacity={grow * 0.88} stroke={C.xp} strokeWidth={lerp(14, 8, grow)} filter="url(#glow)" />
            <g opacity={prog(f, 30, 56)}>
              <text y={-8} textAnchor="middle" fontFamily={FONT} fontSize={56} fill={C.xp} stroke={C.ink} strokeWidth={7} paintOrder="stroke">[Compartir Sistema</text>
              <text y={58} textAnchor="middle" fontFamily={FONT} fontSize={56} fill={C.xp} stroke={C.ink} strokeWidth={7} paintOrder="stroke">(Modo Party)]</text>
            </g>
            {f >= 60 && f < 78 && <rect x={-380} y={-110} width={760} height={220} rx={28} fill="#fff" opacity={0.6 * (1 - prog(f, 60, 78))} />}
          </g>
          <HoloPanel cx={540} cy={380} w={700} h={110} p={f >= 120 ? pop(f, 120, fps) : 0} lines={["[Sistema: Modo Party disponible]"]} size={30} />
        </g>
      )}
      {sub === "B" && (
        <g>
          <rect y={1490} width={W} height={430} fill="#1A0B33" />
          <rect x={0} y={1486} width={W} height={8} fill={C.xp} opacity={0.5} />
          <Character
            id="h3b" x={215} y={1220} scale={0.9} look={HERO} bags frame={f} mouth="cold" eyeOpen={0.55}
            pose={{ lean: 0, shL: 8, elL: 10, shR: f3 < 30 ? 40 : 105 + 8 * Math.sin(f3 * 0.8), elR: f3 < 30 ? 20 : 95, hpL: 4, hpR: -4 }}
          />
          <Character
            id="bully" x={570} y={1180} scale={1.05} bulk={1.35} look={{ skin: "#C69C84", hair: "#1E1A22", shirt: "#7A2A2A", pants: "#2A3140", shoes: "#14161C", hairStyle: "short" }}
            flip eyeKind={f3 > 80 ? "xp" : "normal"} mouth={f3 > 80 ? "open" : "cold"} eyeOpen={1} frame={f}
            pose={{ lean: 2 + 20 * bow, head: 6 * bow, shL: 20, elL: 60, shR: 20, elR: 60 }}
          />
          <Character
            id="prof" x={870} y={1200} scale={1} glasses tie flip look={{ skin: "#F1D4C2", hair: "#6B6B70", shirt: "#E6E1D6", pants: "#3A3F4A", shoes: "#14161C", hairStyle: "short" }}
            eyeKind={f3 > 80 ? "xp" : "normal"} mouth={f3 > 80 ? "open" : "cold"} eyeOpen={1} frame={f}
            pose={{ lean: 2 + 18 * bow, head: 5 * bow, shL: 10, elL: 70, shR: 10, elR: 70 }}
          />
          {/* Chasquido: ondas de reverb cian */}
          {snap > 0 && [0, 1, 2].map((k) => <circle key={k} cx={330} cy={1000} r={lerp(30, 420, eOut(Math.max(0, snap - k * 0.18)))} fill="none" stroke={C.cyan} strokeWidth={8} opacity={(1 - snap) * (1 - k * 0.25)} />)}
          <HoloPanel cx={560} cy={700} w={400} h={140} p={f3 >= 50 ? pop(f3, 50, fps) : 0} lines={["[Tareas para el Líder:", "+10 XP]"]} size={32} />
          <HoloPanel cx={760} cy={480} w={400} h={140} p={f3 >= 62 ? pop(f3, 62, fps) : 0} lines={["[Tareas para el Líder:", "+10 XP]"]} size={32} />
        </g>
      )}
      {sub === "C" && (
        <g>
          {/* Rayos de luz y estanterías con parallax orbital */}
          {[0, 1, 2, 3].map((i) => <polygon key={i} points={`${540 + Math.cos(th + i) * 120},0 ${540 + Math.cos(th + i) * 420 - 90},1500 ${540 + Math.cos(th + i) * 420 + 90},1500`} fill={C.xp} opacity={0.07} />)}
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={mod(i * 300 - Math.cos(th) * 260 + 400, 1700) - 300} y={460} width={160} height={820} fill="#1A0B33" stroke={C.ink} strokeWidth={INK2} opacity={0.8} />)}
          <ellipse cx={540} cy={1390} rx={560} ry={130} fill="#1A0B33" stroke={C.ink} strokeWidth={INK} />
          <ellipse cx={540} cy={1390} rx={520 + 10 * Math.sin(f * 0.1)} ry={118} fill="none" stroke={C.xp} strokeWidth={5} filter="url(#glow)" opacity={0.8} />
          {orbit.filter((r) => r.z < 0).map(rival)}
          {/* Pupitre-trono */}
          <path d="M 400 1250 L 400 760 L 470 680 L 540 760 L 610 680 L 680 760 L 680 1250 Z" fill={C.purple} stroke={C.ink} strokeWidth={INK} strokeLinejoin="round" />
          <path d="M 420 1240 L 420 780 M 660 1240 L 660 780" stroke={C.xp} strokeWidth={5} filter="url(#glow)" opacity={0.8} />
          <Character
            id="h3c" x={540} y={1180} scale={1} bags look={{ ...HERO, shirt: "#2B1B4F" }} mouth="smirk" eyeOpen={0.6} frame={f}
            pose={{ lean: -6, head: -8, shL: 20, elL: 100, shR: -10, elR: 100, hpL: 88, knL: 92, hpR: 88, knR: 92 }}
          />
          <rect x={600} y={1215} width={260} height={26} fill={C.coffee} stroke={C.ink} strokeWidth={INK} />
          <rect x={620} y={1241} width={20} height={110} fill="#3E342C" stroke={C.ink} strokeWidth={INK2} />
          <rect x={650} y={1165} width={90} height={50} fill="#4A3F36" stroke={C.ink} strokeWidth={INK2} />
          <rect x={660} y={1130} width={90} height={36} fill="#5C4D42" stroke={C.ink} strokeWidth={INK2} />
          {orbit.filter((r) => r.z >= 0).map(rival)}
          <HoloPanel cx={540} cy={430} w={640} h={160} p={1} lines={["[Nueva Misión]", "+10 XP"]} size={44} accent={C.xp} />
        </g>
      )}
      {sub === "B" && f3 > 0 && f3 < 8 && <rect width={W} height={H} fill="#fff" opacity={0.5 * (1 - f3 / 8)} />}
    </SceneShell>
  );
};

/* ========================================================================== */
/*  ESCENA 4 — CIERRE Y BUCLE INFINITO                                         */
/* ========================================================================== */
const City: React.FC<{ f: number }> = ({ f }) => (
  <g>
    <defs><linearGradient id="nightSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#07090F" /><stop offset="1" stopColor="#1B222C" /></linearGradient></defs>
    <rect width={W} height={H} fill="url(#nightSky)" />
    {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={rnd(i) * W} cy={rnd(i + 3) * 700} r={1.5 + rnd(i + 8) * 2} fill="#E6FBFF" opacity={0.5 + 0.4 * Math.sin(f * 0.1 + i)} />)}
    <circle cx={800} cy={300} r={90} fill="#E6EFE9" stroke={C.ink} strokeWidth={INK} />
    {[0, 1, 2].map((layer) =>
      Array.from({ length: 9 }, (_, i) => {
        const bh = 260 + rnd(i * 5 + layer * 11) * 520 + layer * 90, bw = 150 + rnd(i + layer) * 90, bx = i * 130 - 40 + layer * 40;
        const shade = ["#141A24", "#1B222C", "#232B36"][layer];
        return (
          <g key={`${layer}-${i}`}>
            <rect x={bx} y={1500 - bh + layer * 60} width={bw} height={bh} fill={shade} stroke={C.ink} strokeWidth={INK2 + 1} />
            {Array.from({ length: 12 }, (_, j) => <rect key={j} x={bx + 16 + (j % 3) * 38} y={1500 - bh + layer * 60 + 24 + Math.floor(j / 3) * 52} width={20} height={26} fill={rnd(i * 31 + j + layer) > 0.55 ? "#E8C56A" : "#10151D"} opacity={0.85} />)}
          </g>
        );
      })
    )}
    <rect y={1500} width={W} height={420} fill="#10151D" />
    {/* Millones de barras verdes flotando sobre las cabezas de la población */}
    {Array.from({ length: 110 }, (_, i) => {
      const bx = 20 + rnd(i) * 1000, by = 620 + rnd(i + 3) * 1000 + Math.sin(f * 0.06 + i) * 8;
      const sz = 0.6 + rnd(i + 9) * 0.9;
      return (
        <g key={i} transform={`translate(${bx},${by}) scale(${sz})`} filter="url(#glow)">
          <rect x={-28} y={-7} width={56} height={14} rx={7} fill={C.panel} stroke={C.xp} strokeWidth={3} />
          <rect x={-24} y={-3} width={48 * (0.3 + rnd(i + 5) * 0.7)} height={6} rx={3} fill={C.xp} />
        </g>
      );
    })}
  </g>
);

const Scene4: React.FC<{ f: number; fps: number; abs: boolean }> = ({ f, abs }) => {
  const sub = f < 270 ? "A" : f < 510 ? "B" : "C";
  const zoom = lerp(2.6, 1, eOut(prog(f, 0, 260)));
  const p = prog(f, 510, 590); // progreso del Match Cut
  const [gx, gy] = shake(f, f >= 510 ? 40 * (1 - p * 0.6) : 0);
  const TIP = { x: 540, y: 1560 };
  const s = lerp(1, 9, eIO(p));
  const tx = LOOP.x - s * TIP.x, ty = LOOP.y - s * TIP.y;
  const whip = f >= 255 && f < 285 ? 1 - Math.abs(f - 270) / 15 : 0;
  const bob = Math.sin(f * 0.12) * 10;
  const padR = lerp(34, LOOP.r, eIO(prog(p, 0.25, 0.9)));
  const hand = (
    <g>
      <path d="M 450 1100 L 660 1100 L 640 1500 L 480 1500 Z" fill="#3C4A5E" stroke={C.ink} strokeWidth={INK} transform="translate(0,-260)" />
      <rect x={470} y={1180} width={140} height={200} rx={34} fill={C.skin} stroke={C.ink} strokeWidth={INK} />
      <ellipse cx={540} cy={1270} rx={120} ry={80} fill={C.skin} stroke={C.ink} strokeWidth={INK} />
      {[-70, -22, 26].map((dx, i) => <ellipse key={i} cx={540 + dx} cy={1300} rx={26} ry={34} fill={C.skin} stroke={C.ink} strokeWidth={INK2 + 1} />)}
      <rect x={TIP.x - 24} y={1250} width={48} height={TIP.y - 1250} rx={24} fill={C.skin} stroke={C.ink} strokeWidth={INK} />
      <ellipse cx={420} cy={1250} rx={30} ry={60} fill={C.skin} stroke={C.ink} strokeWidth={INK} transform="rotate(-28 420 1250)" />
      <ellipse cx={TIP.x} cy={TIP.y} rx={24} ry={20} fill="#D9A98F" stroke={C.ink} strokeWidth={INK2 + 1} />
    </g>
  );
  return (
    <SceneShell
      scene={4} abs={abs}
      cues={[[10, "assets/audio/sfx/whooshes/whoosh_cinematic.wav", 0.85], [360, "assets/audio/sfx/glitches/radio_static_burst.wav", 0.95], [540, "assets/audio/sfx/glitches/electrical_powerdown.wav", 0.9]]}
      vfx={<Vfx src="assets/2d/vfx/smoke/smoke_01.png" x={540} y={sub === "A" ? 1500 : 960} size={sub === "A" ? 1400 : 1000} opacity={sub === "A" ? 0.35 : f >= 560 ? 0.5 * (1 - prog(f, 560, 595)) : 0} rot={f * 0.3} />}
    >
      {sub === "A" && (
        <g transform={`translate(540,1100) scale(${zoom}) translate(-540,-1100)`}>
          <City f={f} />
        </g>
      )}
      {sub !== "A" && (
        <g transform={sub === "C" ? `translate(${tx + gx},${ty + gy}) scale(${s})` : undefined} opacity={sub === "C" ? 1 - prog(p, 0.55, 0.9) : 1}>
          <City f={f} />
          <rect width={W} height={H} fill={C.ink} opacity={0.72} />
          <rect x={0} y={0} width={W} height={H} fill={C.xp} opacity={0.05} />
          <Character
            id="h4" x={540} y={1000 + bob * 0.4} scale={1.35} bags frame={f} look={{ ...HERO, shirt: "#2B1B4F" }} mouth="grin" eyeKind="dilated" eyeOpen={1}
            pose={{ lean: 0, head: 0, shL: 6, elL: 10, shR: -4, elR: 10 }}
          />
          {hand}
          {/* Chevrones que señalan la barra de progreso real del Short/Reel */}
          {sub === "B" && [0, 1, 2].map((i) => <polygon key={i} points="500,0 580,0 540,46" transform={`translate(0,${1600 + i * 26 + Math.abs(Math.sin(f * 0.12 + i * 0.6)) * 20})`} fill={C.xp} stroke={C.ink} strokeWidth={INK2} filter="url(#glow)" opacity={0.9 - i * 0.2} />)}
        </g>
      )}
      {sub === "B" && f >= 270 && f < 285 && <rect width={W} height={H} fill="#fff" opacity={0.4 * (1 - prog(f, 270, 285))} />}
      {whip > 0 && Array.from({ length: 14 }, (_, i) => <rect key={i} x={-100} y={rnd(i) * H} width={W + 200} height={6 + rnd(i + 4) * 30} fill={C.xpCore} opacity={0.5 * whip} />)}
      {/* 4C: Glitch digital + Match Cut milimétrico: yema del dedo → pupila del Frame 0 */}
      {sub === "C" && (
        <g>
          <g opacity={prog(p, 0.7, 1)}><EyeECU f={0} /></g>
          <g opacity={1 - prog(p, 0.88, 1)}>
            <circle cx={LOOP.x} cy={LOOP.y} r={padR} fill={interpolateColors(prog(p, 0.3, 0.9), [0, 1], ["#D9A98F", C.ink])} stroke={C.ink} strokeWidth={INK} />
            <circle cx={LOOP.x + padR * 0.4} cy={LOOP.y - padR * 0.5} r={padR * 0.12} fill="#fff" opacity={prog(p, 0.6, 1)} />
          </g>
          {f < 575 && Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={0} y={rnd(i + Math.floor(f / 2.5)) * H} width={W} height={10 + rnd(i + 20) * 60} fill={i % 2 ? C.cyan : C.red} opacity={0.35} style={{ mixBlendMode: "screen" }} transform={`translate(${(rnd(i + f) - 0.5) * 80},0)`} />
          ))}
        </g>
      )}
    </SceneShell>
  );
};

/* ========================================================================== */
/*  COMPONENTE RAÍZ                                                            */
/* ========================================================================== */
export const World2D: React.FC<World2DProps> = ({ currentScene, sceneLocalFrame, absoluteTimeline = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Modulador Sakuga: line-boil en doses (12fps) para contornos rough ink
  const stepOnTwos = Math.floor(frame / 5);
  const boilX = Math.sin(stepOnTwos * 13.37) * 1.4;
  const boilY = Math.cos(stepOnTwos * 17.51) * 1.4;
  const boilRot = ((stepOnTwos % 3) - 1) * 0.32;
  const f = sceneLocalFrame;

  return (
    <div
      style={{
        position: "absolute", inset: 0, width: W, height: H, backgroundColor: C.ink, overflow: "hidden",
        transform: `translate(${boilX}px, ${boilY}px) rotate(${boilRot}deg)`,
      }}
    >
      <Defs seed={stepOnTwos % 8} />

      {currentScene === 0 && <Scene0 f={f} fps={fps} abs={absoluteTimeline} />}
      {currentScene === 1 && <Scene1 f={f} fps={fps} abs={absoluteTimeline} />}
      {currentScene === 2 && <Scene2 f={f} fps={fps} abs={absoluteTimeline} />}
      {currentScene === 3 && <Scene3 f={f} fps={fps} abs={absoluteTimeline} />}
      {currentScene === 4 && <Scene4 f={f} fps={fps} abs={absoluteTimeline} />}

      {/* Viñeta óptica global */}
      <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 180px rgba(5, 8, 14, 0.88)", pointerEvents: "none", zIndex: 60 }} />
    </div>
  );
};

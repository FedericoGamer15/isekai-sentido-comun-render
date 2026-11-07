import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { THEME } from "../theme";
import voData from "../data/vo.json";

interface CaptionsProps {
  sceneKey: string;
  sceneStartFrame: number;
  highlights?: string[];
}

export const AnimatedCaptions: React.FC<CaptionsProps> = ({
  sceneKey,
  sceneStartFrame,
  highlights = [],
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneVO = (voData as any)[sceneKey];
  if (!sceneVO || !sceneVO.words || sceneVO.words.length === 0) {
    return null;
  }

  const localTime = Math.max(0, (frame - sceneStartFrame) / fps);

  let activeWordIndex = -1;
  for (let i = 0; i < sceneVO.words.length; i++) {
    const w = sceneVO.words[i];
    if (localTime >= w.start && localTime <= w.end + 0.1) {
      activeWordIndex = i;
      break;
    }
    if (localTime < w.start && activeWordIndex === -1 && i > 0) {
      activeWordIndex = i - 1;
      break;
    }
  }

  if (activeWordIndex === -1 && localTime >= sceneVO.words[sceneVO.words.length - 1].end) {
    activeWordIndex = sceneVO.words.length - 1;
  }

  const chunkSize = 4;
  const chunkIndex = Math.floor(Math.max(0, activeWordIndex) / chunkSize);
  const startIdx = chunkIndex * chunkSize;
  const endIdx = Math.min(sceneVO.words.length, startIdx + chunkSize);
  const visibleWords = sceneVO.words.slice(startIdx, endIdx);

  const cleanWord = (str: string) => str.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, "").toUpperCase();
  const isHighlighted = (wordText: string) => {
    const cleaned = cleanWord(wordText);
    return highlights.some((h) => cleanWord(h) === cleaned || cleaned.includes(cleanWord(h)));
  };

  return (
    <div
      style={{
        position: "absolute",
        top: THEME.safe.subtitleY,
        left: THEME.safe.left,
        right: THEME.safe.right,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        pointerEvents: "none",
        zIndex: 70,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "8px 16px",
          maxWidth: 810,
          padding: "8px 16px",
        }}
      >
        {visibleWords.map((w: any, idx: number) => {
          const absoluteIndex = startIdx + idx;
          const isActive = absoluteIndex === activeWordIndex;
          const highlighted = isHighlighted(w.text);

          let color = THEME.colors.white;
          if (highlighted) {
            color = THEME.colors.xp;
          }
          if (isActive) {
            color = highlighted ? THEME.colors.xp : THEME.colors.cyan;
          }

          return (
            <span
              key={absoluteIndex}
              style={{
                fontFamily: THEME.fonts.main,
                fontWeight: 900,
                fontSize: 52,
                lineHeight: 1.18,
                color,
                textTransform: "uppercase",
                WebkitTextStroke: "10px #0B0E14",
                paintOrder: "stroke fill",
                textShadow: isActive
                  ? `0 0 22px ${color}, 0 6px 0px #0B0E14`
                  : "0 6px 0px #0B0E14",
                transform: isActive ? "scale(1.16)" : "scale(1)",
                transition: "transform 0.06s ease, color 0.06s ease",
                display: "inline-block",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

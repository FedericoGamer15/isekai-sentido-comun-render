import React from "react";
import { Composition } from "remotion";
import { MainSequence } from "./MainSequence";
import { TOTAL_FRAMES } from "./components/World2D";

export const Root: React.FC = () => {
  return (
    <Composition
      id="BarraXpLocura"
      component={MainSequence}
      durationInFrames={TOTAL_FRAMES}
      fps={60}
      width={1080}
      height={1920}
    />
  );
};

import React from "react";
import { Composition } from "remotion";
import { RaceShortComp } from "./videos/race/Short";
import { MolassesComp } from "./videos/molasses/Molasses";

export const RaceShort: React.FC = () => {
  return (
    <Composition
      id="RaceShort"
      component={RaceShortComp}
      durationInFrames={3402}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};

export const MolassesShort: React.FC = () => {
  return (
    <Composition
      id="MolassesShort"
      component={MolassesComp}
      durationInFrames={2880}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};

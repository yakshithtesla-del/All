import React from "react";
import { Composition } from "remotion";
import { RaceShortComp } from "./videos/race/Short";
import { MolassesComp } from "./videos/molasses/Molasses";
import { ZombieComp } from "./videos/zombie/Zombie";
import { NightShiftComp } from "./videos/nightshift/NightShift";
import { Part1Comp } from "./videos/part1/Part1";

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

export const ZombieShort: React.FC = () => {
  return (
    <Composition
      id="ZombieShort"
      component={ZombieComp}
      durationInFrames={180}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};

export const NightShiftShort: React.FC = () => {
  return (
    <Composition
      id="NightShiftShort"
      component={NightShiftComp}
      durationInFrames={2700}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};

export const Part1Short: React.FC = () => {
  return (
    <Composition
      id="Part1Short"
      component={Part1Comp}
      durationInFrames={2700}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};

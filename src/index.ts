import React from "react";
import { registerRoot } from "remotion";
import { RaceShort, MolassesShort, ZombieShort, NightShiftShort, Part1Short } from "./Root";

const Root: React.FC = () =>
  React.createElement(React.Fragment, null,
    React.createElement(RaceShort),
    React.createElement(MolassesShort),
    React.createElement(ZombieShort),
    React.createElement(NightShiftShort),
    React.createElement(Part1Short)
  );

registerRoot(Root);

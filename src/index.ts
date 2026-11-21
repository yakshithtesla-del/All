import React from "react";
import { registerRoot } from "remotion";
import { RaceShort, MolassesShort } from "./Root";

const Root: React.FC = () =>
  React.createElement(React.Fragment, null,
    React.createElement(RaceShort),
    React.createElement(MolassesShort)
  );

registerRoot(Root);

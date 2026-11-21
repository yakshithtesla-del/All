// "The AI Race" — our original 113.4 s vertical short in the flat-characters-in-a-3D-toon-world style.
// One three.js world (world.ts) posed per frame from the story timeline (story.ts). Post chain:
//   InkPass (world ink lines) -> lens blur pre + main (thin-lens DOF per shot from dofAt) ->
//   bloom (emissive) + NEUTRAL tone map + grade, MSAA 4.
// Place changes crossfade by stacking a second canvas; burned-in captions ride on top (captions.ts).
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, Audio, staticFile, continueRender, delayRender, getInputProps, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { World } from "./world";
import { InkPass, noInkFallback } from "./ink";
import { LensBlur, GrainEffect } from "./lensblur";
import { GradeEffect, GRADES, GRADE_STRENGTH, gradeFor } from "./grade";
import { TOTAL, FLASH_AT, SHOTS, layersAt, dofAt, SET_HOME } from "./story";
import { Captions } from "./captions";

export const RACE_FRAMES = TOTAL;

/** A/B switches for test stills only (inputProps `{ post: { ink: false, ... } }`); everything is on by default. */
type PostToggles = { ink: boolean; lens: boolean; pre: boolean; bloom: boolean; grade: boolean; grain: boolean };
const toggles = (): PostToggles => ({ ink: true, lens: true, pre: true, bloom: true, grade: true, grain: false, ...((getInputProps() as { post?: Partial<PostToggles> }).post ?? {}) });

// Bloom is done in-world (glow sprites in world.ts): postprocessing's BloomEffect renders all-white under the
// headless SwiftShader GL here, so it is intentionally absent from the chain. `on.bloom` stays for prop compat.

const fwd = new THREE.Vector3(), fpt = new THREE.Vector3();
const dbgMarks: { x: number; y: number; c: string }[] = [];

const Inner: React.FC<{ id: number }> = ({ id }) => {
  const f = useCurrentFrame();
  const { camera, scene } = useThree();
  const world = useMemo(() => new World(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const on = useMemo(toggles, []);
  const fx = useMemo(() => ({
    ink: new InkPass(scene, camera as THREE.PerspectiveCamera),
    lens: new LensBlur({ maxCoC: 24, nearScale: 1.2 }),
    tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    grade: new GradeEffect(GRADES.day, GRADE_STRENGTH.day),
    grain: new GrainEffect({ amount: 0.025, cellPx: 1.5 }),
  }), [camera, scene]);
  useEffect(() => () => fx.ink.dispose(), [fx]);
  const post = useMemo(() => {
    const kids = [
      on.ink ? <primitive key="ink" object={fx.ink} dispose={null} /> : null,
      on.lens && on.pre ? <primitive key="pre" object={fx.lens.pre} dispose={null} /> : null,
      on.lens ? <primitive key="main" object={fx.lens.main} dispose={null} /> : null,
      <primitive key="tone" object={fx.tone} dispose={null} />,
      on.grade ? <primitive key="grade" object={fx.grade} dispose={null} /> : null,
      on.grain ? <primitive key="grain" object={fx.grain} dispose={null} /> : null,
    ].filter((k): k is React.ReactElement => !!k);
    return <EffectComposer multisampling={4}>{kids}</EffectComposer>;
  }, [fx, on]);
  const cam = camera as THREE.PerspectiveCamera;
  target.copy(world.update(id, f, cam, scene));
  noInkFallback(world.root);
  const d = dofAt(f);
  cam.getWorldDirection(fwd);
  if (d.focus) fpt.set(...d.focus(f)); else fpt.copy(target);
  fx.lens.focus = Math.max(0.3, fpt.sub(cam.position).dot(fwd));
  fx.lens.cInf = d.cInf;
  gradeFor(fx.grade, SHOTS[id - 1].light);
  fx.grain.seed = f;
  const dbg = (getInputProps() as { dbg?: boolean }).dbg;
  if (dbg) {
    dbgMarks.length = 0;
    const home = SET_HOME[SHOTS[id - 1].set];
    const mk = (name: string, w: [number, number, number], col: string) => {
      const v = new THREE.Vector3(home[0] + w[0], home[1] + w[1], home[2] + w[2]).project(cam);
      if (v.z > 0 && v.z < 1) dbgMarks.push({ x: (v.x + 1) * 0.5 * 1080, y: (1 - v.y) * 0.5 * 1920, c: col });
    };
    mk("cardC", [0, 3.7, 0], "#ff0000");
    mk("cardTL", [-2.3, 5.225, 0.01], "#ff00ff");
    mk("cardBR", [2.3, 2.175, 0.01], "#ffff00");
    mk("cityTop", [0, 13, 14], "#00ff00");
    mk("grnd", [0, 0, 0], "#00ffff");
    mk("look", [0, 3.4, -1], "#ffffff");
    if (id === 5) {
      mk("origin", [0, 0, 0], "#ff00ff");
      mk("rackL", [-9.5, 2, -2.46], "#00ff00");
      mk("rackR", [9.5, 2, -2.46], "#00ff00");
      mk("barL", [-1.4, 2.3, -1.27], "#ffff00");
      mk("barR", [1.4, 2.3, -1.27], "#ffff00");
      mk("logo", [0, 5.1, 6.05], "#ffffff");
    }
  }
  return (
    <>
      <primitive object={world.root} dispose={null} />
      {post}
    </>
  );
};

const dprOverride = () => (getInputProps() as { post?: { dpr?: number } }).post?.dpr;
const ShotView: React.FC<{ id: number; alpha: number }> = ({ id, alpha }) => (
  <AbsoluteFill style={{ opacity: alpha }}>
    <ThreeCanvas width={1080} height={1920} {...(dprOverride() ? { dpr: dprOverride() } : {})} shadows gl={{ antialias: false, stencil: false, powerPreference: "high-performance", toneMappingExposure: 1.0 }}
      camera={{ fov: 40, near: 0.2, far: 1500 }}>
      <Inner id={id} />
    </ThreeCanvas>
  </AbsoluteFill>
);

export const RaceShortComp: React.FC = () => {
  const f = useCurrentFrame();
  const flash = FLASH_AT >= 0 && f >= FLASH_AT && f < FLASH_AT + 4 ? [1, 0.75, 0.45, 0.2][f - FLASH_AT] : 0;
  return (
    <AbsoluteFill style={{ background: "#cfe3f2" }}>
      {layersAt(f).map((l, i) => <ShotView key={i ? "over" : "base"} id={l.id} alpha={l.alpha} />)}
      {flash > 0 && <AbsoluteFill style={{ background: "#ffffff", opacity: flash }} />}
      <Captions f={f} />
      {(getInputProps() as { dbg?: boolean }).dbg && dbgMarks.map((m, i) => (
        <div key={i} style={{ position: "absolute", left: m.x - 5, top: m.y - 5, width: 10, height: 10, background: m.c, zIndex: 50 }} />
      ))}
      <Audio src={staticFile("audio/mix.wav")} />
    </AbsoluteFill>
  );
};

// Opening frame of Part 1: Mara stocking Aisle 9 at 11:59 p.m. — real three.js + Remotion render.
// Post chain: InkPass (world ink lines) -> thin-lens DOF -> NEUTRAL tone map + night grade.
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, continueRender, delayRender, getInputProps, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { World } from "./world";
import { InkPass, noInkFallback } from "./ink";
import { LensBlur } from "./lensblur";
import { GradeEffect, GRADES, GRADE_STRENGTH, gradeFor } from "./grade";
import { SHOTS, layersAt, dofAt } from "./story";

export const NIGHTSHIFT_FRAMES = 1;

const fwd = new THREE.Vector3(), fpt = new THREE.Vector3();
const useWorldReady = () => {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("nightshift world"));
  useEffect(() => { setReady(true); continueRender(handle); }, [handle]);
  return ready;
};

const Inner: React.FC<{ id: number; fast: boolean }> = ({ id, fast }) => {
  const f = useCurrentFrame();
  const { camera, scene } = useThree();
  const world = useMemo(() => new World(), []);
  const fx = useMemo(() => ({
    ink: new InkPass(scene, camera as THREE.PerspectiveCamera),
    lens: new LensBlur({ maxCoC: 24, nearScale: 1.2 }),
    tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    grade: new GradeEffect(GRADES.night, GRADE_STRENGTH.night),
  }), [camera, scene]);
  useEffect(() => () => { try { fx.ink.dispose(); } catch { /* remount */ } }, [fx]);
  const post = useMemo(() => {
    const prim = (key: string, object: object) => <primitive key={key} object={object} dispose={null} />;
    const chain: React.ReactElement[] = [prim("ink", fx.ink)];
    if (!fast) { chain.push(prim("lens-pre", fx.lens.pre)); chain.push(prim("lens-main", fx.lens.main)); }
    chain.push(prim("tone", fx.tone), prim("grade", fx.grade));
    return <EffectComposer multisampling={fast ? 0 : 4}>{chain}</EffectComposer>;
  }, [fx, fast]);
  const cam = camera as THREE.PerspectiveCamera;
  world.update(id, f, cam, scene);
  noInkFallback(world.root);
  if (!fast) {
    const d = dofAt();
    cam.getWorldDirection(fwd);
    fpt.set(d.focus[0], d.focus[1], d.focus[2]);
    fx.lens.focus = Math.max(0.3, fpt.sub(cam.position).dot(fwd));
    fx.lens.cInf = d.cInf;
  }
  gradeFor(fx.grade, SHOTS[id - 1].light);
  return <><primitive object={world.root} dispose={null} />{post}</>;
};

const dprOverride = () => (getInputProps() as { post?: { dpr?: number } }).post?.dpr;
const ShotView: React.FC<{ id: number; alpha: number; fast: boolean }> = ({ id, alpha, fast }) => (
  <AbsoluteFill style={{ opacity: alpha }}>
    <ThreeCanvas width={1080} height={1920} {...(dprOverride() ? { dpr: dprOverride() } : {})} shadows
      gl={{ antialias: false, stencil: false, powerPreference: "high-performance", toneMappingExposure: 1.0 }}
      camera={{ fov: 40, near: 0.2, far: 1500 }}>
      <Inner id={id} fast={fast} />
    </ThreeCanvas>
  </AbsoluteFill>
);

export const NightShiftComp: React.FC = () => {
  const f = useCurrentFrame();
  const ready = useWorldReady();
  const fast = (getInputProps() as { fast?: boolean }).fast === true;
  if (!ready) return null;
  return (
    <AbsoluteFill style={{ background: "#070d24" }}>
      {layersAt().map((l, i) => <ShotView key={i ? "over" : "base"} id={l.id} alpha={l.alpha} fast={fast} />)}
    </AbsoluteFill>
  );
};

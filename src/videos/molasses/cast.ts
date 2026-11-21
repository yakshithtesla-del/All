// Flat bean-head cast as lit billboards in the painted 3D set. The canvas pool keeps one texture per distinct
// drawing, so a crowd of kids sharing an expression shares a canvas. Cards, effects and contact blobs all live on
// the NOINK layer, so the world ink pass never outlines their quads.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, townsfolk, fxBurst, fxPuff, fxRing, fxCreak, fxBlob, fxShadow, fxContact,
  Outfit, Expr, FrontOpts, SideOpts, SKIN, INK,
} from "./toon";
import { FPS, SHOTS, at, clamp01, smooth, V3 } from "./story";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216;
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
const ROOTS = new Set<THREE.Object3D>();

export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false;
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false;
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    } else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; roll?: number; size?: [number, number, number];
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };
export type Stage = { places: Place[]; fx: FxPlace[] };

// ---------------- outfits (period Boston, no teal) ----------------
const SKINS = [SKIN, "#f5c9a0", "#ecd0b6", "#c99067"];
const COATS = ["#3f6fb5", "#8c3b4a", "#6d7a3a", "#b5653f", "#7a5a94", "#a94c34"];
const worker = (v = 0): Outfit => ({
  jacket: ["#9a5536", "#8a6b48", "#a5663d"][v % 3], pants: "#41424a", boots: "#3a2a22",
  hat: "cap", cap: ["#d2ad58", "#b98b45", "#c8a05a"][v % 3], belt: "#5d3d2b", buttons: "#d9c8a5", skin: SKINS[v % 4],
});
const kid = (v = 0): Outfit => ({
  jacket: ["#e07f2c", "#c5533c", "#d8b04a"][v % 3], pants: "#40517a", boots: "#f0e7d2",
  hat: "cap", cap: ["#d64c3e", "#3f6fb5", "#e2b847"][v % 3], build: "kid", skin: SKINS[v % 4],
});
const bystander = (v = 0): Outfit => v % 2 ? {
  ...townsfolk(v), jacket: COATS[v % COATS.length], dress: ["#d9a441", "#c25a7a", "#e3d4b4"][v % 3], skin: SKINS[v % 4],
} : {
  jacket: COATS[(v + 2) % COATS.length], pants: "#3b3f52", boots: "#4a3426", hat: "tophat", skin: SKINS[v % 4],
};
const ENGINEER: Outfit = {
  jacket: "#435b73", pants: "#343944", boots: "#2e241f", hat: "cap", cap: "#d8b45a",
  moustache: "#4a3020", belt: "#6b4a32", buttons: "#e2c56e", skin: SKINS[0],
};
const INSPECTOR: Outfit = {
  jacket: "#51445f", pants: "#343944", boots: "#2e241f", hat: "tophat",
  moustache: "#2a201a", belt: "#6b4a32", buttons: "#d9c8a5", skin: SKINS[1],
};
const BASEBALL: Outfit = {
  jacket: "#ded8c9", pants: "#5b6f8e", boots: "#4a3426", hat: "cap", cap: "#9c3c34", build: "kid", skin: SKINS[2],
};

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

// ---------------- light, blinks, body views ----------------
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: "day" | "golden" | "cold" = "day";
const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
};
const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};
const LEAD = 2 / FPS;
const LID = [0.5, 1, 1, 0.5];
const lidAt = (t: number, i: number) => {
  const f = Math.round(t * FPS);
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13));
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));
type Who = { i: number; o: Outfit; okey: string };
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1): Place => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = ((who.i * 5 + 3) % 7) + 1;
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`;
  return {
    key, x, y, z, scale, mirror, size: [w, h, k],
    draw: (p) => (view.side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)),
  };
};

const CONTACT: Record<"day" | "golden" | "cold", [number, number, number]> = {
  day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33], cold: [0.22, 0.24, 0.36],
};
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k = 1) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + 0.02 * sc, y: y + 0.022, z: z + 0.02 * sc,
    w: 0.52 * sc, h: 0.4 * sc, flat: true, rot: 0.3 });
};
const shadow = (out: Stage, x: number, y: number, z: number, s = 1) => {
  const cc = hexOf([0.34, 0.34, 0.46], 0.85);
  out.fx.push({ key: `blob|shadow|${cc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, cc), x, y: y + 0.018, z, w: 0.8 * s, h: 1.8 * s, flat: true, rot: 0.5 });
};

// ---------------- hand-drawn effects ----------------
const drip = (p: Pen, t: number) => {
  p.poly([[120, 0], [480, 0], [450, 840], [150, 840]], "#70401f", 9);
  for (let i = 0; i < 5; i++) {
    const x = 160 + i * 70, y = 180 + ((t * 120 + i * 137) % 580);
    p.line([[x, 60], [x + 6, y]], "#5d2b12", 16, false);
    p.ell(x + 6, y + 18, 16, 25, "#7c4019", 5);
  }
};
const waveMark = (p: Pen, t: number) => {
  const off = (t * 70) % 120;
  for (let i = 0; i < 5; i++) {
    const y = 80 + i * 90;
    p.stroke([[30, y], [170 + off, y - 26], [320 + off, y + 18], [570, y - 12]], 18 - i, "#3d1b0c");
    p.stroke([[30, y + 18], [170 + off, y - 8], [320 + off, y + 36], [570, y + 6]], 7, "#b16a2b");
  }
};
const fizz = (p: Pen, t: number) => {
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4, r = 70 + ((t * 110 + i * 37) % 180);
    p.ell(300 + Math.cos(a) * r * 0.8, 300 + Math.sin(a) * r * 0.55 - ((t * 50 + i * 20) % 90),
      8 + (i % 3) * 4, 8 + (i % 3) * 4, null, 5, 0, 360);
  }
};
const stampMark = (p: Pen, t: number) => {
  const u = clamp01(t);
  p.poly([[150, 320], [450, 320], [420, 470], [180, 470]], "#e7dcc0", 10);
  p.poly([[250, 520], [350, 520], [350, 130], [250, 130]], "#8b5a34", 9);
  p.ell(300, 520, 90, 26, "#6f4528", 8);
  if (u > 0.35) { p.ell(300, 130, 90 + 30 * u, 30 + 10 * u, null, 10, 0, 360); p.stroke([[220, 90], [380, 170]], 14, "#b0442f"); }
};
const smell = (p: Pen, t: number) => {
  for (let i = 0; i < 4; i++) {
    const x = 130 + i * 115, y = 120 + ((t * 40 + i * 37) % 90);
    p.stroke([[x, 460], [x + 35, 360 + y * 0.3], [x - 25, 260 + y * 0.4], [x + 25, 150]], 13, "#9b6336");
  }
};
const snow = (p: Pen, t: number) => {
  for (let i = 0; i < 16; i++) {
    const y = (t * 90 + i * 71) % 420;
    p.ell(60 + ((i * 97) % 480), 60 + y, 10, 10, "#ffffff", 0);
  }
};
const pail = (p: Pen) => {
  p.poly([[110, 200], [490, 200], [440, 520], [160, 520]], "#a86c3a", 12);
  p.arc(300, 200, 190, 70, 180, 360, 14, "#d2c4a8");
  p.ell(300, 500, 140, 24, "#4c2510", 0);
};
const plan = (p: Pen) => {
  p.poly([[80, 260], [520, 260], [500, 520], [100, 520]], "#e7dcc0", 12);
  p.poly([[110, 230], [490, 230], [470, 270], [130, 270]], "#c7b58e", 10);
  p.stroke([[160, 350], [440, 350]], 9, "#9a8c70");
  p.stroke([[160, 410], [400, 410]], 9, "#9a8c70");
};

// ---------------- per-shot staging ----------------
const placeGroup = (cam: CamInfo, t: number, out: Stage, list: { x: number; z: number; who: Who; expr: Expr; mode?: "stand" | "stroll" | "march"; scale?: number; facing?: -1 | 0 | 1; wave?: number }[]) => {
  list.forEach((o, i) => {
    const view = viewOf(cam, o.x, o.z, 0, 1);
    const fo: FrontOpts = { mode: o.mode ?? "stand", expr: o.expr, blink: lidAt(t, i + 17), look: 0, facing: o.facing ?? 0, wave: o.wave };
    const so: SideOpts = { mode: o.mode === "march" ? "march" : "stand", phase: ((t * 0.8 + hh(i)) % 1), expr: o.expr, blink: lidAt(t, i + 51) };
    out.places.push(person(cam, o.who, o.x, 0, o.z, view, fo, so, o.scale));
    blob(out, o.x, 0, o.z, o.scale ?? 1);
  });
};
const W = [0, 1, 2].map((v) => ({ i: v + 10, o: worker(v), okey: `w${v}` }));
const K = [0, 1, 2, 3].map((v) => ({ i: v + 30, o: kid(v), okey: `k${v}` }));
const B = [0, 1, 2, 3, 4, 5].map((v) => ({ i: v + 50, o: bystander(v), okey: `b${v}` }));
const BB = [0, 1, 2].map((v) => ({ i: v + 70, o: BASEBALL, okey: "bb" }));

const street = (id: number, t: number, out: Stage, cam: CamInfo) => {
  if (id === 1) {
    placeGroup(cam, t, out, [
      { x: -4.2, z: 4.5, who: B[0], expr: "shock" }, { x: 4.0, z: 6.0, who: B[1], expr: "nervous" },
      { x: -6.0, z: 10.0, who: B[2], expr: "shock" }, { x: 6.2, z: 12.0, who: W[0], expr: "shock" },
      { x: -2.6, z: 13.0, who: K[0], expr: "shock", scale: 0.8 },
    ]);
    out.fx.push({ key: "dust", cw: 500, ch: 300, draw: (p) => fxPuff(p, q(((t - at(6)) * 1.2) % 1, 30)), x: 0, y: 1.0, z: 14, w: 5, h: 2.6, soft: true });
  } else if (id === 2) {
    placeGroup(cam, t, out, [
      { x: -5.0, z: 5.0, who: B[3], expr: "neutral" }, { x: 5.2, z: 7.5, who: B[4], expr: "smile" },
      { x: -7.0, z: 11.0, who: W[1], expr: "stern" }, { x: 7.2, z: 12.5, who: W[2], expr: "neutral" },
      { x: -2.8, z: 14.0, who: K[1], expr: "smile", scale: 0.8 },
    ]);
  } else {
    const hurt = t >= at(190);
    placeGroup(cam, t, out, [
      { x: -4.5, z: 5.0, who: B[0], expr: hurt ? "dazed" : "shock" },
      { x: 4.6, z: 7.0, who: B[1], expr: hurt ? "pained" : "nervous" },
      { x: -6.8, z: 11.0, who: W[0], expr: "shock" },
      { x: 6.4, z: 12.0, who: W[1], expr: hurt ? "stern" : "shock" },
    ]);
    if (t >= at(202)) {
      const e = { i: 90, o: ENGINEER, okey: "eng" }, ins = { i: 91, o: INSPECTOR, okey: "ins" };
      placeGroup(cam, t, out, [
        { x: -2.4, z: 2.0, who: e, expr: "stern", facing: 1 }, { x: 2.2, z: 2.2, who: ins, expr: "stern", facing: -1 },
      ]);
      out.fx.push({ key: "plan", cw: 600, ch: 320, draw: plan, x: 0, y: 1.15, z: 1.6, w: 1.4, h: 0.75, rot: -0.15 });
    }
  }
};
const tank = (id: number, t: number, out: Stage, cam: CamInfo) => {
  if (id === 3) {
    placeGroup(cam, t, out, [
      { x: -9.5, z: -3.0, who: W[0], expr: t > at(42, "start", -0.06) ? "nervous" : "neutral", facing: 1 },
      { x: -11.0, z: 3.0, who: W[1], expr: "stern" },
      { x: 9.8, z: -1.0, who: B[2], expr: "neutral" },
      { x: 11.2, z: 5.0, who: B[3], expr: "neutral" },
    ]);
    out.fx.push({ key: "plan", cw: 600, ch: 320, draw: plan, x: -8.6, y: 0.05, z: 1.8, w: 1.5, h: 0.8, flat: true, rot: 0.5 });
  } else if (id === 4) {
    const leak = t >= at(64, "start", -0.06), paint = t >= at(75, "start", -0.06);
    const spots: [number, number][] = [[6.6, -2.4], [5.8, 1.2], [6.9, 4.4], [-7.0, -1.0]];
    spots.forEach(([x, z], i) => {
      const who = K[i % K.length];
      out.places.push(person(cam, who, x, 0, z, { side: true, mirror: x > 0 },
        { mode: "stand", expr: leak ? "grin" : "neutral", blink: lidAt(t, i + 90) },
        { mode: "stand", expr: leak ? "grin" : "neutral", blink: lidAt(t, i + 90) }, 0.72));
      blob(out, x, 0, z, 0.72);
      if (leak) out.fx.push({ key: `pail${i}`, cw: 600, ch: 600, draw: pail, x: x + (x > 0 ? 0.55 : -0.55), y: 0.28, z: z + 0.3, w: 0.55, h: 0.55 });
    });
    placeGroup(cam, t, out, [
      { x: 8.6, z: 6.4, who: W[2], expr: paint ? "neutral" : "stern", facing: -1 },
    ]);
    if (leak) out.fx.push({ key: `drip${q((t - at(63)) * 1.5, 30)}`, cw: 600, ch: 900, draw: (p) => drip(p, t - at(63)), x: 6.1, y: 4.6, z: -0.8, w: 1.4, h: 2.1, rot: 0.2 });
  } else if (id === 5) {
    placeGroup(cam, t, out, [
      { x: -9.8, z: -4.0, who: B[0], expr: "shock" }, { x: -11.2, z: 2.0, who: B[1], expr: "nervous" },
      { x: 10.4, z: -2.0, who: W[0], expr: "neutral" }, { x: 12.0, z: 5.0, who: W[2], expr: "grin" },
    ]);
    out.fx.push({ key: `snow${q(t * 2, 20)}`, cw: 600, ch: 480, draw: (p) => snow(p, t), x: -8, y: 6.2, z: -3, w: 8, h: 6.4, soft: true });
  } else {
    placeGroup(cam, t, out, [
      { x: 9.2, z: -1.0, who: W[0], expr: "stern", facing: -1 },
      { x: -9.5, z: 1.0, who: { i: 90, o: ENGINEER, okey: "eng" }, expr: "stern", facing: 1 },
    ]);
  }
};
const burst = (id: number, t: number, out: Stage, cam: CamInfo) => {
  const shock = t >= at(126, "start", -LEAD);
  const spots: [number, number][] = [[-9, -5], [-6.5, -1], [8.8, -4], [10.5, 2], [-10, 7], [9.5, 10]];
  spots.forEach(([x, z], i) => {
    const who = i % 2 ? W[i % 3] : B[i % 6];
    out.places.push(person(cam, who, x, 0, z, { side: false, mirror: false },
      { mode: "stand", expr: shock ? (i % 3 ? "shock" : "pained") : "neutral", blink: 0, tilt: shock ? (hh(i) - 0.5) * 12 : 0 },
      {}, shock ? 1 : 0.95));
    blob(out, x, 0, z);
  });
  if (id === 7 && shock) {
    const u = clamp01((t - at(126)) / 0.5);
    out.fx.push({ key: `burst${q(u, 30)}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, q(u, 30)), x: 0, y: 15.0, z: 0, w: 5, h: 5 });
    out.fx.push({ key: "cover", cw: 240, ch: 240, draw: (p) => fxCreak(p, 0.6), x: 1.2, y: 16.5 - 4 * u, z: 1.5, w: 1.4, h: 1.4, rot: u * 5 });
  }
  if (t >= at(134)) out.fx.push({ key: `syrup${q((t - at(134)) * 1.6, 30)}`, cw: 800, ch: 400, draw: (p) => waveMark(p, t - at(134)), x: 0, y: 1.6, z: 8, w: 12, h: 5 });
  if (id === 8 && t >= at(155)) out.fx.push({ key: `puff${q((t - at(155)) * 1.3, 30)}`, cw: 500, ch: 500, draw: (p) => fxPuff(p, q(((t - at(155)) * 1.3) % 1, 30)), x: -3, y: 2, z: 12, w: 5, h: 5, soft: true });
};
const soda = (t: number, out: Stage, cam: CamInfo) => {
  placeGroup(cam, t, out, [
    { x: -5.5, z: -2.0, who: K[2], expr: "shock", scale: 0.8 },
    { x: 5.4, z: 0.5, who: B[5], expr: "nervous" },
  ]);
  if (t >= at(177, "start", -LEAD)) {
    const u = clamp01((t - at(177)) / 0.8);
    out.fx.push({ key: `fizz${q((t - at(177)) * 1.4, 30)}`, cw: 600, ch: 600, draw: (p) => fizz(p, t - at(177)), x: 0, y: 5.0, z: 0.2, w: 3.4, h: 3.4 });
    out.fx.push({ key: "cap", cw: 400, ch: 400, draw: (p) => fxBurst(p, q(u, 30)), x: 0, y: 8.6 + 2 * u, z: 0, w: 2.2, h: 2.2 });
  }
};
const rule = (t: number, out: Stage, cam: CamInfo) => {
  const engineer: Who = { i: 90, o: ENGINEER, okey: "eng" };
  const inspector: Who = { i: 91, o: INSPECTOR, okey: "ins" };
  const signing = t >= at(212, "start", -LEAD), checking = t >= at(218, "start", -LEAD);
  const e = person(cam, engineer, -2.3, 0, 1.0, { side: true, mirror: false },
    { mode: "stand", expr: signing ? "stern" : "neutral", blink: lidAt(t, 90) },
    { mode: "stand", expr: signing ? "stern" : "neutral", pose: signing ? 0.8 : 0, blink: lidAt(t, 90) });
  const i = person(cam, inspector, 2.3, 0, 1.2, { side: true, mirror: true },
    { mode: "stand", expr: checking ? "stern" : "neutral", blink: lidAt(t, 91) },
    { mode: "stand", expr: checking ? "stern" : "neutral", pose: checking ? 0.7 : 0, blink: lidAt(t, 91) });
  out.places.push(e, i);
  blob(out, -2.3, 0, 1.0); blob(out, 2.3, 0, 1.2);
  out.fx.push({ key: "plan", cw: 600, ch: 320, draw: plan, x: 0, y: 1.05, z: 0.2, w: 1.8, h: 0.95, flat: true, rot: 0.06 });
  if (signing) {
    const u = clamp01((t - at(212)) / 0.55);
    out.fx.push({ key: `stamp${q(u, 30)}`, cw: 600, ch: 600, draw: (p) => stampMark(p, u), x: -0.4, y: 1.8, z: 0.5, w: 1.5, h: 1.5 });
  }
  if (t >= at(229, "start", -LEAD)) out.fx.push({ key: "puddle", cw: 500, ch: 320, draw: (p) => fxBlob(p, "#6d3417"), x: 0, y: 0.04, z: -0.6, w: 2.2, h: 1.0, flat: true });
};
const park = (id: number, t: number, out: Stage, cam: CamInfo) => {
  const spots: [number, number][] = [[-4.8, 3.0], [-2.4, 5.2], [4.6, 3.8], [6.4, 6.8], [0.2, 8.0]];
  spots.forEach(([x, z], k) => {
    const smelling = id === 13 && k % 2 === 0;
    out.places.push(person(cam, BB[k % BB.length], x, 0, z, { side: false, mirror: false },
      { mode: "stand", expr: smelling ? "grin" : id === 12 ? "smile" : "laugh", blink: lidAt(t, 110 + k) }, {}, 0.78));
    blob(out, x, 0, z, 0.78);
  });
  if (id === 13 && t >= at(252, "start", -LEAD)) {
    const u = ((t - at(252)) * 0.8) % 1;
    out.fx.push({ key: `smell${q(u, 30)}`, cw: 600, ch: 600, draw: (p) => smell(p, u), x: 0, y: 1.8, z: 2.0, w: 4.2, h: 4.2, soft: true });
  }
  if (id === 12) out.fx.push({ key: "slab", cw: 600, ch: 320, draw: (p) => { p.poly([[80, 80], [520, 80], [500, 260], [100, 260]], "#c9c0ad", 12); }, x: 1.2, y: 0.05, z: -3.6, w: 3.4, h: 1.6, flat: true });
};

/** Everything with a face in shot `id` at time t. */
export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1];
  LNAME = s.light;
  findSun(cam, SUN);
  switch (s.set) {
    case "street": street(id, t, out, cam); break;
    case "tank": tank(id, t, out, cam); break;
    case "burst": burst(id, t, out, cam); break;
    case "soda": soda(t, out, cam); break;
    case "rule": rule(t, out, cam); break;
    case "park": park(id, t, out, cam); break;
  }
  return out;
};

/** one-off effects the world may trigger on rupture frames */
export const ruptureFx = (t: number, atSec: number, out: Stage, at: V3) => {
  if (t < atSec || t >= atSec + 0.5) return;
  const u = (t - atSec) / 0.5;
  out.fx.push({ key: `bigburst${q(u, 30)}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, q(u, 30)), x: at[0], y: at[1], z: at[2], w: 3, h: 3 });
};
export { FPS };

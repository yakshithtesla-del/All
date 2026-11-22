// Flat ink-outlined cartoon cards (the study-3d-short cast) staged in the painted 3D zombie street.
// The canvas pool keeps one texture per distinct drawing; cards, effects and contact blobs live on the NOINK layer.
import * as THREE from "three";
import { Pen, bodyFront, bodySide, fxContact, Outfit, Expr, FrontOpts, SideOpts } from "./toon";
import { FPS, SHOTS, clamp01 } from "./story";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool (same proven machinery as the bridge/race shorts) ----------------
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

const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
const SU = 0.00216;
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);

export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false;
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(BODY, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false;
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
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
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3 };
export type Stage = { places: Place[]; fx: FxPlace[] };

// ---------------- cast ----------------
const INK_BLOOD = "#8f2731";
const ZSKIN = ["#9dbb82", "#8aae79", "#b0c48b", "#829f74"];
const ZCOAT = ["#5b6b58", "#7a6551", "#4c5c70", "#6c5b6a", "#8a6b4a"];
const zombie = (v = 0): Outfit => ({
  jacket: ZCOAT[v % ZCOAT.length], pants: ["#3a4048", "#45404a", "#374452"][v % 3], boots: "#2d2726",
  belt: "#4a352c", buttons: "#b3a68a", skin: ZSKIN[v % ZSKIN.length], head: v,
  hair: v % 2 ? "#3f4038" : undefined, hat: v === 2 ? "cap" : null, cap: "#8b7a52",
});
const SURVIVOR: Outfit = {
  jacket: "#c58a32", pants: "#3d4b5c", boots: "#312a25", hat: "cap", cap: "#b9473e",
  belt: "#3d2d24", buttons: "#e2d3a8", skin: "#f0c49d", rifle: true,
};
const LIGHT = -Math.PI * 0.62; // key from upper-left, matched to the night/purple sun presets
const q = (v: number, n = 24) => Math.round(v * n) / n;
const hh = (i: number) => { const x = Math.sin(i * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
const tier = (d: number): [number, number, number] =>
  d < 3.5 ? [1800, 3000, 3.0] : d < 7 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

const blood = (p: Pen, n: number) => {
  for (let i = 0; i < n; i++) {
    const x = 250 + ((i * 83) % 150), y = 470 + ((i * 61) % 180);
    p.ell(x, y, 7 + (i % 3) * 5, 5 + (i % 2) * 4, INK_BLOOD, 0);
  }
};

const person = (cam: CamInfo, who: Outfit, key: string, x: number, z: number, expr: Expr,
  opts: { mode?: "stand" | "stroll" | "march"; scale?: number; phase?: number; facing?: -1 | 0 | 1; blood?: number; side?: boolean } = {}): Place => {
  const scale = opts.scale ?? 1;
  const d = cam.pos.distanceTo(new THREE.Vector3(x, 1.2 * scale, z)) / scale;
  const [w, h, k] = tier(d);
  const phase = q(opts.phase ?? 0, 16);
  const facing = opts.facing ?? 0;
  const fo: FrontOpts = { mode: opts.mode ?? "stroll", expr, phase, blink: 0, light: LIGHT, facing, seed: who.head ?? 1 };
  const so: SideOpts = { mode: opts.mode === "stand" ? "stand" : "march", phase, expr, blink: 0, light: LIGHT, seed: who.head ?? 1 };
  const side = !!opts.side;
  const fullKey = `${side ? "S" : "F"}|${key}|${expr}|${phase}|${facing}|${scale}`;
  return {
    key: fullKey, x, y: 0, z, scale, size: [w, h, k],
    draw: (p: Pen) => {
      if (side) bodySide(p, who, so); else bodyFront(p, who, fo);
      if (opts.blood) blood(p, opts.blood);
    },
  };
};
const blob = (out: Stage, x: number, z: number, s = 1) => out.fx.push({
  key: "blob|contact|#2b2b3a", cw: 128, ch: 128, draw: (p) => fxContact(p, "#2b2b3a"),
  x: x + 0.02, y: 0.022, z: z + 0.02, w: 0.52 * s, h: 0.4 * s, flat: true, rot: 0.3,
});

const mist = (p: Pen, t: number) => {
  const g = p.g;
  g.globalAlpha = 0.45;
  for (let i = 0; i < 7; i++) {
    const x = 70 + ((i * 97 + t * 34) % 470), y = 320 + (i % 3) * 60;
    const gr = g.createRadialGradient(x, y, 6, x, y, 95);
    gr.addColorStop(0, "rgba(190,205,230,0.55)"); gr.addColorStop(1, "rgba(190,205,230,0)");
    g.fillStyle = gr; g.fillRect(x - 100, y - 100, 200, 200);
  }
  g.globalAlpha = 1;
};
const beam = (p: Pen) => {
  const g = p.g;
  g.globalAlpha = 0.26;
  g.fillStyle = "#fff0b8";
  g.beginPath(); g.moveTo(300, 40); g.lineTo(80, 600); g.lineTo(520, 600); g.closePath(); g.fill();
  g.globalAlpha = 1;
};
const label = (p: Pen, text: string, sub: string) => {
  const g = p.g;
  g.fillStyle = "rgba(16,14,30,0.86)";
  g.strokeStyle = "#e8e2ff"; g.lineWidth = 8;
  g.beginPath(); g.roundRect(30, 130, 1140, 340, 26); g.fill(); g.stroke();
  g.fillStyle = "#f6f0ff"; g.textAlign = "center";
  g.font = "bold 96px sans-serif"; g.fillText(text, 600, 275);
  g.font = "bold 56px sans-serif"; g.fillStyle = "#b9a8ff";
  g.fillText(sub, 600, 370);
};
const infection = (p: Pen) => {
  // three little ink-outlined heads joined by arrows: the study short's diagram-friendly geometry
  const heads: [number, string][] = [[190, "#9dbb82"], [600, "#c96a72"], [1010, "#9dbb82"]];
  heads.forEach(([x, c]) => { p.ell(x, 560, 96, 104, c, 12); p.ell(x - 32, 550, 10, 12, "#241726", 0); p.ell(x + 32, 550, 10, 12, "#241726", 0); });
  for (const [x0, x1] of [[300, 480], [710, 890]] as [number, number][]) {
    p.line([[x0, 560], [x1, 560]], "#f2e8b0", 14);
    p.poly([[x1 - 26, 538], [x1, 560], [x1 - 26, 582]], "#f2e8b0", 6);
  }
};

/** Everything with a face and every effect card in shot `id` at time t. */
export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const ph = t * 0.8;
  if (id === 1) {
    out.places.push(person(cam, SURVIVOR, "hero", -1.2, 1.5, "shock", { mode: "stand", scale: 1.06, facing: 1 }));
    blob(out, -1.2, 1.5, 1.06);
    const spots: [number, number, number, -1 | 0 | 1][] = [
      [-4.6, 5, 0.98, 1], [3.9, 6, 0.94, -1], [-6.4, 9, 0.9, 1], [6.5, 10, 0.9, -1], [0.9, 12, 0.86, 0], [4.4, 14, 0.82, -1],
    ];
    spots.forEach(([x, z, s, facing], i) => {
      out.places.push(person(cam, zombie(i), `z${i}`, x, z, i % 3 === 0 ? "pained" : "dazed",
        { scale: s, phase: ph + hh(i), facing, blood: i % 2 ? 3 : 0, side: i === 1 || i === 3 }));
      blob(out, x, z, s);
    });
    out.fx.push({ key: "beam", cw: 600, ch: 600, draw: beam, x: -0.3, y: 1.2, z: 3.2, w: 3.2, h: 3.2, soft: true, rot: -0.06 });
  } else {
    out.places.push(person(cam, zombie(0), "z0", -0.3, 3, "pained", { mode: "stand", scale: 1.32, blood: 7 }));
    blob(out, -0.3, 3, 1.32);
    out.places.push(person(cam, zombie(3), "z3", -3.4, 6, "dazed", { scale: 0.96, facing: 1, blood: 4 }));
    blob(out, -3.4, 6, 0.96);
    out.places.push(person(cam, zombie(4), "z4", 3.2, 6.5, "dazed", { scale: 0.96, facing: -1, blood: 3, side: true }));
    blob(out, 3.2, 6.5, 0.96);
    out.fx.push({ key: "label", cw: 1200, ch: 600, draw: (p) => label(p, "1 BITE → 2 ZOMBIES", "THE OUTBREAK DOUBLES"), x: 0, y: 8.1, z: 5, w: 8, h: 4 });
    out.fx.push({ key: "infection", cw: 1200, ch: 800, draw: infection, x: 0, y: 3.9, z: 7.2, w: 7.6, h: 5, soft: true });
    out.fx.push({ key: "mist2", cw: 600, ch: 600, draw: (p) => mist(p, t), x: 0, y: 0.6, z: 10, w: 14, h: 4, soft: true });
  }
  out.fx.push({ key: `mist${q(t * 0.7, 12)}`, cw: 600, ch: 600, draw: (p) => mist(p, t * 0.4), x: 0, y: 0.5, z: 14, w: 18, h: 4, soft: true });
  return out;
};

export { FPS };

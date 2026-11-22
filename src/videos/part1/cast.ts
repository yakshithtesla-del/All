// Flat ink-outlined cartoon cast for the supermarket opening, drawn as lit billboards in the painted 3D aisle.
import * as THREE from "three";
import { Pen, INK } from "./toon";
import { FPS, shotAt } from "./story";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>(); private free: Entry[] = []; private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw }; this.reqs.push(r); return r;
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
        r.draw(new Pen(g)); e.tex.needsUpdate = true; this.live.set(key, e);
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
    this.mesh = new THREE.Mesh(CARD, this.mat); this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex; if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    } else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

export type Place = { key: string; draw: (p: Pen) => void; x: number; y: number; z: number; scale?: number; yaw?: number; roll?: number; size?: [number, number, number] };
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3 };
export type Stage = { places: Place[]; fx: FxPlace[] };

// ---------------- Mara: bean head, ink outline, apron, reaching up to stock a can ----------------
const MARA: OutfitColors = { jacket: "#3d7189", pants: "#38414f", skin: "#f0c49d", hair: "#4a3428", apron: "#d9d1bd" };
type OutfitColors = { jacket: string; pants: string; skin: string; hair: string; apron: string };

const drawMara = (p: Pen) => {
  const c = MARA;
  // legs and shoes
  p.line([[258, 650], [249, 790], [243, 938]], c.pants, 34);
  p.line([[342, 650], [352, 790], [358, 938]], c.pants, 34);
  p.ell(240, 955, 37, 16, "#2a2527", 10);
  p.ell(360, 955, 37, 16, "#2a2527", 10);
  // torso + apron + name tag
  p.poly([[236, 430], [364, 430], [382, 655], [218, 655]], c.jacket, 12);
  p.poly([[248, 470], [352, 470], [368, 692], [232, 692]], c.apron, 9);
  p.poly([[266, 500], [334, 500], [334, 532], [266, 532]], "#f1ebd9", 5);
  p.g.fillStyle = INK; p.g.font = "bold 17px sans-serif"; p.g.textAlign = "center"; p.g.fillText("STAFF", 300, 522);
  // left arm hanging, right arm reaching to the shelf
  p.line([[240, 455], [212, 555], [220, 628]], c.jacket, 26);
  p.ell(220, 638, 15, 18, c.skin, 8);
  p.line([[360, 452], [420, 350], [468, 250]], c.jacket, 26);
  p.ell(470, 240, 16, 18, c.skin, 8);
  // can in the raised hand
  p.poly([[451, 184], [493, 184], [489, 238], [455, 238]], "#c34a3d", 8);
  p.ell(472, 184, 21, 7, "#d8dde0", 5);
  // head, hair, face
  p.ell(300, 300, 104, 116, c.skin, 12);
  p.poly([[198, 292], [206, 220], [248, 184], [322, 176], [382, 204], [402, 268], [386, 244], [348, 218], [282, 220], [232, 248]], c.hair, 10);
  p.ell(272, 300, 7, 9, INK, 0); p.ell(334, 300, 7, 9, INK, 0);
  p.arc(303, 334, 22, 12, 15, 165, 5);
};

const blob = (out: Stage, x: number, z: number, s = 1) => out.fx.push({
  key: "blob|contact|#262835", cw: 128, ch: 128, draw: (p) => {
    const g = p.g; const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, "rgba(20,22,34,0.75)"); gr.addColorStop(1, "rgba(20,22,34,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }, x: x + 0.02, y: 0.022, z: z + 0.02, w: 0.62 * s, h: 0.42 * s, flat: true, rot: 0.3,
});

/** The infected figure outside: green skin, torn coat, one arm raised mid-slam. */
const drawOutsideZombie = (p: Pen) => {
  const skin = "#8fae72", coat = "#4d6a55", dark = "#33423a";
  // uneven, dragging legs
  p.line([[255, 640], [232, 790], [226, 930]], dark, 36);
  p.line([[345, 640], [362, 790], [370, 930]], dark, 36);
  p.ell(228, 942, 40, 17, "#232a26", 10);
  p.ell(372, 942, 40, 17, "#232a26", 10);
  // torn green coat
  p.poly([[224, 420], [376, 420], [398, 690], [206, 690]], coat, 12);
  p.poly([[286, 560], [330, 560], [318, 660], [274, 648]], "#3a4b3e", 6);
  p.line([[236, 450], [206, 560], [198, 620]], coat, 26);
  p.ell(198, 632, 16, 18, skin, 8);
  // raised arm, hand frozen against the car window
  p.line([[364, 448], [430, 350], [486, 268]], coat, 26);
  p.ell(492, 256, 19, 20, skin, 9);
  for (let i = 0; i < 3; i++) p.line([[486 + i * 8, 244], [490 + i * 8, 216]], skin, 5);
  // bean head, wrong jaw, empty eyes
  p.ell(300, 292, 104, 116, skin, 12);
  p.poly([[204, 272], [222, 208], [278, 182], [340, 194], [392, 236], [392, 286], [352, 250], [286, 232], [232, 252]], "#3c4438", 9);
  p.ell(270, 296, 15, 11, "#26302a", 0); p.ell(334, 296, 15, 11, "#26302a", 0);
  p.ell(270, 296, 4, 5, "#c2d88e", 0); p.ell(334, 296, 4, 5, "#c2d88e", 0);
  p.poly([[268, 344], [336, 344], [326, 382], [278, 378]], "#3c2a2c", 8);
  p.line([[286, 348], [286, 372], [302, 362], [318, 374], [318, 348]], "#cfd8bd", 4);
  // blood at the mouth and on the coat
  p.ell(306, 402, 12, 20, "#6e2630", 0);
};

export const stage = (id: number, t: number, _cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const stockerAt = (x: number, z: number, s = 0.95) => {
    out.places.push({ key: "stocker", draw: drawMara, x, y: 0, z, scale: s, size: [1800, 3000, 3.0] });
    blob(out, x, z, s);
  };
  const zombieOutside = () => out.places.push({
    key: "outside-zombie", draw: drawOutsideZombie, x: -2.0, y: 0, z: 25.4, scale: 1.05,
    size: [1080, 1800, 1.8], roll: 0.035 * Math.sin(t * 7),
  });
  if (id === 1) stockerAt(1.75, 2.4, 0.95);
  else if (id === 2) stockerAt(0.5, 11, 0.9);
  else if (id === 3) { stockerAt(2.2, 17.5, 0.8); zombieOutside(); }
  else if (id === 4 || id === 5) { stockerAt(0.35, 19.4, 0.86); zombieOutside(); }
  else if (id === 6) stockerAt(2.35, 20.2, 0.88);
  else zombieOutside();
  return out;
};
export { FPS };

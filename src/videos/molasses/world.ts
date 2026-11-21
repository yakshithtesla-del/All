// The whole place as one three.js scene. Six sets (street, tank, burst, soda, rule, park) are built once from
// painted Canvas2D textures; update(id, f, camera) poses the active set, camera, sun and cast for that frame.
import * as THREE from "three";
import { staticFile } from "remotion";
import { Batch, V, lam, quad, boxGeo, groundQuad, beamBetween, Ray } from "./build";
import { rep, ctex, planksHD, beamHD, stoneHD, cobbleHD, grassHD, facadeHD, roofHD, cloudHD, molassesHD, tankPanelHD, dirtHD } from "./paint";
import { Pen, fxCloud } from "./toon";
import { LIGHTS, LOOK, LightPreset, WorldLook } from "./lights";
import { TONE, CHAR, twoTone, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage } from "./cast";
import { FPS, SHOTS, at, clamp01, smooth, camAt, FOREGROUND, SetName, V3, ShotDef } from "./story";

// ---------------- shared textures / small helpers ----------------
const discTex = () => ctex("sunDisc", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const haloTex = () => ctex("sunHalo", 256, 256, (g) => {
  const im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = Math.hypot(x - 127.5, y - 127.5) / 128;
    const a = (0.55 * Math.exp(-((u / 0.25) ** 2)) + 0.35 * Math.exp(-((u / 0.6) ** 2))) * (1 - Math.min(1, Math.max(0, (u - 0.8) / 0.2)));
    const i = (y * 256 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(im, 0, 0);
});
const smokeTex = () => ctex("molassesSmoke", 256, 256, (g) => {
  const p = new Pen(g);
  for (const [x, y, r, c] of [[90, 150, 60, "#b7ac9c"], [150, 120, 70, "#d1c5b4"], [170, 165, 55, "#a99e90"], [120, 100, 50, "#e0d7c8"]] as const)
    p.ell(x, y, r, r * 0.85, c, 0);
});
/** every lens position looking at its subject; tall scenery that blocks a ray is culled by the set builders */
const sightLines = (): Ray[] => {
  const out: Ray[] = [];
  for (const s of SHOTS) for (let f = s.a - 6; f < s.b + 6; f += 3) {
    const c = camAt(s.id, Math.max(0, f)), o = V(...c.pos), look = V(...c.look);
    const fw = look.clone().sub(o), len = fw.length(); fw.normalize();
    const rt = fw.clone().cross(V(0, 1, 0)).normalize(), up = rt.clone().cross(fw);
    const ty = Math.tan((c.fov * Math.PI) / 360), tx = ty * (9 / 16);
    for (const [sx, sy] of [[0, 0], [-0.6, 0], [0.6, 0], [0, 0.6], [0, -0.4]])
      out.push({ o, d: fw.clone().addScaledVector(rt, sx * tx).addScaledVector(up, sy * ty), len, core: sx === 0 && sy === 0 });
  }
  return out;
};
/** does a sight line hit this axis-aligned box before its subject? */
const blocks = (rays: Ray[], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  rays.some((r) => {
    let t0 = 0.5, t1 = r.len - 0.5;
    for (const [o, d, lo, hi] of [[r.o.x, r.d.x, x0, x1], [r.o.y, r.d.y, y0, y1], [r.o.z, r.d.z, z0, z1]] as const) {
      if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) return false; continue; }
      let a = (lo - o) / d, b = (hi - o) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return false;
    }
    return true;
  });

type Mats = Record<string, THREE.Material>;

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight; private fill: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#b8d0ec", 25, 300);
  private sunDisc: THREE.Sprite; private sunHalo: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<"day" | "golden" | "cold", THREE.Texture[]>;
  private clouds: THREE.Mesh[] = [];
  private sets: Record<SetName, THREE.Group>;
  private burstTank: THREE.Mesh; private manhole: THREE.Mesh; private wave: THREE.Mesh; private cap: THREE.Mesh;
  private rivets: THREE.InstancedMesh;
  private smoke: { m: THREE.Mesh; mat: THREE.MeshLambertMaterial; top: V3; k: number }[] = [];
  private fgs: { o: THREE.Object3D; a: number; b: number; set: SetName }[] = [];
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor() {
    const R = this.root, M: Mats = {};
    // ---- sky + lights ----
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el));
          c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el));
          c = mix(c, c4, smoothstep(e.z, e.w, el));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK); R.add(this.sky);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex(), color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(1, 1, 1), fog: false, depthWrite: false,
      transparent: true, blending: THREE.AdditiveBlending }));
    this.sunDisc.renderOrder = -0.5; this.sunHalo.renderOrder = 5;
    for (const m of [this.sunDisc, this.sunHalo]) { m.frustumCulled = false; m.layers.set(NOINK); R.add(m); }
    this.hemi = new THREE.HemisphereLight("#dcecff", "#8a6f58", 1.0);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(4096, 4096);
    this.fill = new THREE.DirectionalLight("#9fb8ff", 0.3);
    R.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);
    this.cloudMaps = {
      day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)),
      golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)),
      cold: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.cold.cloud)),
    };
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.08, 1.08, 1.08), transparent: true, depthWrite: false, fog: false }));
      const w = 130 + (i % 4) * 30;
      m.position.set(Math.cos(a) * d, 120 + (i % 4) * 38, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK); this.clouds.push(m); R.add(m);
    }

    // ---- painted materials ----
    M.cobble = lam("cobbleHD", () => ({ map: rep(cobbleHD(), 12, 12) }));
    M.grass = lam("grassHD", () => ({ map: rep(grassHD(), 18, 18) }));
    M.dirt = lam("dirtHD", () => ({ map: rep(dirtHD(), 3, 3) }));
    M.stone = lam("stoneHD", () => ({ map: rep(stoneHD("molassesStone", ["#c9bba5", "#bdae99", "#d6c8b2", "#b3a48f"], "#8f8171"), 4, 4) }));
    M.wood = lam("woodHD", () => ({ map: rep(planksHD(), 3, 2) }));
    M.beam = lam("beamHD", () => ({ map: beamHD() }));
    M.tank = lam("tankPanelHD", () => ({ map: rep(tankPanelHD(), 3, 2) }));
    M.molasses = lam("molassesHD", () => ({ map: rep(molassesHD(), 2, 2), side: THREE.DoubleSide }));
    M.iron = twoTone(new THREE.MeshPhongMaterial({ color: "#4b4b52", specular: "#92908a", shininess: 55 }));
    M.ochre = lam("ochre", () => ({ color: "#b78446" }));
    M.brick = lam("brick", () => ({ map: rep(stoneHD("molassesBrick", ["#a76449", "#95573e", "#b57858", "#8d4e38"], "#6f4737"), 2, 3) }));
    M.cream = lam("cream", () => ({ color: "#d9c9a8" }));
    M.roof = lam("molassesRoof", () => ({ map: rep(roofHD("#8f4e3b"), 2, 2) }));
    M.dark = lam("dark", () => ({ color: "#3a3231" }));
    M.paper = lam("paper", () => ({ color: "#e8dcc0" }));
    M.glass = twoTone(new THREE.MeshPhongMaterial({ color: "#9c5a22", specular: "#ffdca0", shininess: 70, transparent: true, opacity: 0.9 }));

    const rays = sightLines();
    this.sets = {
      street: this.buildStreet(M, rays),
      tank: this.buildTank(M, rays),
      burst: this.buildBurst(M),
      soda: this.buildSoda(M),
      rule: this.buildRule(M),
      park: this.buildPark(M),
    };
    for (const g of Object.values(this.sets)) { g.visible = false; R.add(g); }

    // dynamic handles created by the set builders
    this.burstTank = this.sets.burst.getObjectByName("burstTank") as THREE.Mesh;
    this.rivets = this.sets.burst.getObjectByName("rivets") as THREE.InstancedMesh;
    this.manhole = this.sets.burst.getObjectByName("manhole") as THREE.Mesh;
    this.wave = this.sets.burst.getObjectByName("wave") as THREE.Mesh;
    this.cap = this.sets.soda.getObjectByName("cap") as THREE.Mesh;

    // slow steam over the warehouse roofs and the burst
    const smokeT = smokeTex();
    for (const [top, n] of [[[-22, 22.6, -66], 6], [[24, 18.6, 70], 5], [[2, 3.5, 14], 6]] as const)
      for (let k = 0; k < n; k++) {
        const mat = new THREE.MeshLambertMaterial({ map: smokeT, transparent: true, depthWrite: false });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        m.layers.set(NOINK);
        this.smoke.push({ m, mat, top: top as unknown as V3, k: k / n }); R.add(m);
      }

    // near framing props outside the sight-line test, toggled per frame (plain geometry, no external kits)
    for (const fg of FOREGROUND) {
      const o = this.fgProp(fg.kit, fg.s, M);
      o.position.set(...fg.pos); o.rotation.y = fg.yaw ?? 0; o.visible = false;
      this.fgs.push({ o, a: fg.a, b: fg.b, set: fg.set }); R.add(o);
    }
  }

  // ---------------- set builders ----------------
  private addFacade(b: Batch, x: number, z: number, yaw: number, w: number, h: number, d: number, key: string, cols: [string, string]) {
    const geo = boxGeo(V(-w / 2, 0, -d / 2), V(w / 2, h, d / 2));
    const mat = lam(key, () => ({ map: facadeHD(key, w, h, { wall: cols[0], shutter: cols[1], door: true }) }));
    const m = new THREE.Matrix4().compose(V(x, 0, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1));
    b.add(geo, mat, m);
    const roof = boxGeo(V(-w / 2 - 0.22, h, -d / 2 - 0.22), V(w / 2 + 0.22, h + 0.35, d / 2 + 0.22));
    b.add(roof, lam("cornice", () => ({ color: "#c7baa5" })), m);
  }
  private buildStreet(M: Mats, rays: Ray[]) {
    const g = new THREE.Group(), b = new Batch();
    b.add(groundQuad(-120, 120, -120, 120, 0, 40, 40), M.cobble);
    // elevated railway: high deck and rails, with supports kept well clear of every camera
    for (const z of [-30, -10, 10, 30]) for (const x of [-3.4, 3.4]) {
      if (!blocks(rays, x - 0.35, x + 0.35, 0, 9.2, z - 0.35, z + 0.35))
        b.add(beamBetween(V(x, 0, z), V(x, 9.2, z), 0.28), M.iron);
    }
    b.add(boxGeo(V(-4.4, 9.1, -62), V(4.4, 9.45, 62), 2), M.wood);
    for (const x of [-1.35, 1.35]) b.add(boxGeo(V(x - 0.09, 9.45, -62), V(x + 0.09, 9.66, 62)), M.iron);
    // train car in the hook, far from the lens
    b.add(boxGeo(V(-1.9, 9.7, 15), V(1.9, 12.6, 25)), M.brick);
    b.add(boxGeo(V(-2.0, 12.6, 14.8), V(2.0, 12.85, 25.2)), M.dark);
    for (const z of [17, 20, 23]) for (const s of [-1, 1])
      b.add(boxGeo(V(s * 1.91, 10.4, z - 0.8), V(s * 1.94, 11.8, z + 0.8)), M.glass);
    // brick warehouses and cream tenements, never within ~2 m of a lens
    const buildings: [number, number, number, number, number, number, string, [string, string]][] = [
      [-19, -34, 0.06, 9, 10, 8, "stFacadeA", ["#9d6047", "#e2cfa8"]],
      [-20, -8, 0, 10, 12, 9, "stFacadeB", ["#c3b394", "#6d5a49"]],
      [-19, 22, -0.05, 9, 9, 8, "stFacadeC", ["#a76449", "#d9c9a8"]],
      [19, -35, -0.06, 10, 11, 9, "stFacadeD", ["#b7a589", "#7b5c43"]],
      [20, -3, 0, 9, 10, 8, "stFacadeE", ["#95573e", "#e2cfa8"]],
      [19, 27, 0.05, 11, 12, 9, "stFacadeF", ["#c9b99a", "#6d5a49"]],
    ];
    for (const [x, z, yaw, w, h, d, key, cols] of buildings)
      if (!blocks(rays, x - w / 2, x + w / 2, 0, h, z - d / 2, z + d / 2)) this.addFacade(b, x, z, yaw, w, h, d, key, cols);
    b.build(g);
    return g;
  }
  private buildTank(M: Mats, rays: Ray[]) {
    const g = new THREE.Group(), b = new Batch();
    b.add(groundQuad(-90, 90, -90, 90, 0, 30, 30), M.cobble);
    b.add(boxGeo(V(-12, -0.25, -12), V(12, 0.05, 12)), M.stone);
    // riveted tank, 15.2 m tall (fifty feet), radius 6.2 m
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 15.2, 48, 1, false), M.tank);
    tank.position.y = 7.6; tank.castShadow = true; tank.receiveShadow = true; g.add(tank);
    for (const y of [2.1, 6.1, 10.1, 14.1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(6.23, 0.1, 8, 48), M.iron);
      ring.rotation.x = Math.PI / 2; ring.position.y = y; ring.castShadow = true; g.add(ring);
    }
    // ladder on the far side, above eye level where it does not cut across a face
    for (const x of [-0.45, 0.45]) b.add(beamBetween(V(x + 6.45, 0.4, -0.8), V(x + 6.45, 15.4, -0.8), 0.055), M.iron);
    for (let y = 1; y < 15; y += 0.55) b.add(boxGeo(V(5.95, y, -0.92), V(6.95, y + 0.07, -0.68)), M.iron);
    // valve, pipe and warm tanker delivery
    b.add(boxGeo(V(6.0, 1.0, 2.0), V(11.0, 1.45, 2.45)), M.iron);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.075, 8, 20), M.iron);
    wheel.position.set(6.0, 1.75, 2.2); wheel.rotation.y = Math.PI / 2; g.add(wheel);
    b.add(boxGeo(V(10.0, 0.3, 7.0), V(17.2, 1.3, 10.6)), M.ochre); // truck chassis
    b.add(boxGeo(V(16.9, 1.1, 7.4), V(18.4, 3.0, 10.2)), M.brick); // cab
    const cis = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 5.4, 24), M.tank);
    cis.rotation.z = Math.PI / 2; cis.position.set(12.8, 2.6, 8.8); cis.castShadow = true; g.add(cis);
    for (const z of [7.4, 10.2]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.24, 16), M.dark);
      w.rotation.z = Math.PI / 2; w.position.set(10.2, 0.48, z); g.add(w);
    }
    // low warehouse blocks at a safe distance
    for (const [x, z, w, d, h, key] of [[-24, -28, 12, 10, 9, "tkFacadeA"], [26, 28, 12, 11, 8, "tkFacadeB"], [-27, 32, 11, 9, 7, "tkFacadeC"]] as const)
      if (!blocks(rays, x - w / 2, x + w / 2, 0, h, z - d / 2, z + d / 2)) this.addFacade(b, x, z, 0, w, h, d, key, ["#a99a80", "#6d5a49"]);
    b.build(g);
    return g;
  }
  private buildBurst(M: Mats) {
    const g = new THREE.Group(), b = new Batch();
    b.add(groundQuad(-120, 120, -120, 120, 0, 40, 40), M.cobble);
    b.add(boxGeo(V(-12, -0.25, -12), V(12, 0.05, 12)), M.stone);
    b.build(g);
    // the tank folded in on itself: same plate texture, squashed and tipped after the rupture
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 15.2, 48, 1, false), M.tank);
    tank.name = "burstTank"; tank.position.y = 7.6; tank.castShadow = true; tank.receiveShadow = true; g.add(tank);
    // rivet studs around the burst tank: two bright rings that scatter the instant the rivets let go
    const RV = 40, rivetGeo = new THREE.SphereGeometry(0.16, 8, 6);
    const rivets = new THREE.InstancedMesh(rivetGeo, M.iron, RV);
    rivets.name = "rivets"; rivets.castShadow = true; g.add(rivets);
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.22, 20), M.iron);
    cover.name = "manhole"; cover.castShadow = true; g.add(cover);
    // molasses wave: a wide strip whose crest travels along +z after the tank gives way
    const NX = 24, NZ = 48, pos = new Float32Array(NX * NZ * 3), uv: number[] = [], idx: number[] = [];
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const x = -12 + (i / (NX - 1)) * 24, z = -2 + (j / (NZ - 1)) * 38;
      pos.set([x, 0.05, z], (j * NX + i) * 3); uv.push(i / (NX - 1) * 2, j / (NZ - 1) * 3);
      if (i < NX - 1 && j < NZ - 1) {
        const a = j * NX + i, c = a + NX;
        idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    wg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    wg.setIndex(idx); wg.computeVertexNormals();
    const wave = new THREE.Mesh(wg, M.molasses);
    wave.name = "wave"; wave.frustumCulled = false; wave.castShadow = true; wave.receiveShadow = true; g.add(wave);
    return g;
  }
  private buildSoda(M: Mats) {
    const g = new THREE.Group(), b = new Batch();
    b.add(groundQuad(-60, 60, -60, 60, 0, 20, 20), M.cream);
    b.add(boxGeo(V(-8, 0, -8), V(8, 0.65, 8)), M.wood);
    b.add(boxGeo(V(-8, 0.65, -8), V(8, 0.78, -7.7)), M.wood);
    // an oversized unlabelled soda bottle: the everyday analogy, with a plain ochre neck band
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.7, 5.4, 32), M.glass);
    body.position.y = 3.4; body.castShadow = true; g.add(body);
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1.55, 1.5, 32), M.glass);
    shoulder.position.y = 6.85; shoulder.castShadow = true; g.add(shoulder);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.62, 1.1, 24), M.glass);
    neck.position.y = 8.05; g.add(neck);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.57, 1.57, 0.75, 32), M.ochre);
    band.position.y = 3.7; g.add(band);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.28, 20), M.iron);
    cap.name = "cap"; cap.position.y = 8.72; cap.castShadow = true; g.add(cap);
    // a warm car in the background, out of every lens path
    b.add(boxGeo(V(8, 0.2, 9), V(15, 1.5, 13)), M.ochre);
    b.add(boxGeo(V(10, 1.5, 9.4), V(14.2, 3.0, 12.6)), M.glass);
    for (const x of [9.5, 14.2]) for (const z of [9.6, 12.4]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.22, 16), M.dark);
      w.rotation.z = Math.PI / 2; w.position.set(x, 0.5, z); g.add(w);
    }
    b.build(g);
    return g;
  }
  private buildRule(M: Mats) {
    const g = new THREE.Group(), b = new Batch();
    b.add(groundQuad(-60, 60, -60, 60, 0, 20, 20), M.wood);
    b.add(boxGeo(V(-4.5, 0, -1.4), V(4.5, 1.0, 1.5)), M.wood);
    b.add(boxGeo(V(-4.3, 1.0, -1.25), V(4.3, 1.08, 1.35)), M.paper);
    // in-trays and a stamp block; no words or readable marks anywhere on the set
    for (const x of [-3.4, 3.4]) b.add(boxGeo(V(x - 0.6, 1.1, -0.7), V(x + 0.6, 1.25, 0.3)), M.dark);
    b.add(boxGeo(V(1.7, 1.08, 0.4), V(2.5, 1.44, 1.0)), M.ochre);
    // blank plans on the desk
    for (let i = 0; i < 3; i++) b.add(boxGeo(V(-1.3 + i * 0.12, 1.09 + i * 0.018, -0.6), V(1.2 + i * 0.12, 1.11 + i * 0.018, 0.5)), M.paper);
    b.add(groundQuad(-60, 60, -60, 60, -0.02, 20, 20), M.cobble);
    b.build(g);
    return g;
  }
  private buildPark(M: Mats) {
    const g = new THREE.Group(), b = new Batch();
    b.add(groundQuad(-100, 100, -100, 100, -0.04, 35, 35), M.grass);
    // baseball infield and a faint concrete slab outline; no text, no signage
    const dirt = new THREE.Mesh(new THREE.CircleGeometry(11, 40), M.dirt);
    dirt.rotation.x = -Math.PI / 2; dirt.scale.set(1, 0.66, 1); dirt.position.set(0, 0.01, 2); g.add(dirt);
    for (const x of [-4, 4]) b.add(boxGeo(V(x - 0.12, 0.02, 7.6), V(x + 0.12, 0.06, 8.0)), M.cream);
    b.add(boxGeo(V(1.0, 0.02, -3.9), V(3.0, 0.055, -3.2)), M.stone);
    // wooden backstop well behind the players, far from every lens
    for (const x of [-9, -5, -1, 3, 7]) b.add(beamBetween(V(x, 0, 16), V(x, 3.2, 16), 0.11), M.wood);
    b.add(boxGeo(V(-9.2, 2.9, 15.9), V(7.2, 3.1, 16.1)), M.wood);
    b.build(g);
    return g;
  }
  private fgProp(kind: "crate" | "barrel" | "pail" | "plank", s: number, M: Mats) {
    const g = new THREE.Group();
    if (kind === "crate") {
      const m = new THREE.Mesh(boxGeo(V(-0.55, 0, -0.55), V(0.55, 1.0, 0.55)), M.wood);
      m.castShadow = true; g.add(m);
    } else if (kind === "barrel") {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 1.35, 18), M.ochre);
      m.position.y = 0.675; m.castShadow = true; g.add(m);
    } else if (kind === "pail") {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.55, 18), M.iron);
      m.position.y = 0.275; m.castShadow = true; g.add(m);
    } else {
      const m = new THREE.Mesh(boxGeo(V(-1.1, 0, -0.13), V(1.1, 0.16, 0.13)), M.wood);
      m.castShadow = true; g.add(m);
    }
    g.scale.setScalar(s); g.layers.enable(NOINK);
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.layers.set(NOINK); });
    return g;
  }

  /** camera-relative sun, frozen per shot: the mean view direction rotated by the preset azimuth */
  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 4) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1;
      fx += x / n; fz += z / n;
    }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const az = THREE.MathUtils.degToRad(L.az), el = THREE.MathUtils.degToRad(L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }
  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], L = LIGHTS[s.light], K: WorldLook = LOOK[s.light];
    // ---- camera ----
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.2; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    // ---- sun and two-tone uniforms ----
    const sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.2 + 8, 14, 95);
    if (s.light === "golden") Rr = Math.max(Rr, 30);
    this.sun.position.copy(focus).addScaledVector(sunDir, 220); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 480; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    this.fill.intensity = 0;
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term;
    TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    // ---- sky, fog, sun disc, clouds ----
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    scene.fog = this.fog; scene.background = null;
    const showSun = s.light === "golden";
    this.sunDisc.visible = this.sunHalo.visible = showSun;
    if (showSun) {
      this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 900);
      this.sunDisc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(1.7)));
      this.sunHalo.position.copy(this.sunDisc.position); this.sunHalo.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(24)));
      (this.sunHalo.material as THREE.SpriteMaterial).color.set(L.sunDisc).multiplyScalar(1.3);
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i], mat = m.material as THREE.MeshBasicMaterial;
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      mat.map = this.cloudMaps[s.light][i % 4];
    }
    // ---- active set, dynamic props ----
    for (const [name, group] of Object.entries(this.sets)) group.visible = name === s.set;
    this.poseBurst(t);
    this.cap.position.y = 8.72 + (t < at(177) ? 0 : 2.6 * smooth((t - at(177)) / 0.7) - 2.0 * clamp01((t - at(177) - 0.7) / 0.9));
    for (const g of this.fgs) g.o.visible = f >= g.a && f < g.b && g.set === s.set;
    for (const sm of this.smoke) {
      const u = (t * 0.11 + sm.k) % 1, sz = 2.4 + u * 7;
      sm.m.position.set(sm.top[0] - u * 15, sm.top[1] + u * 11 + u * u * 3, sm.top[2] + u * 2);
      sm.m.scale.set(sz, sz, 1); sm.m.quaternion.copy(cam.quaternion);
      sm.mat.opacity = 0.72 * (1 - u) ** 1.2;
    }
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, { pos: cam.position, right });
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const tint = s.light === "golden" ? "#ffcf9e" : s.light === "cold" ? "#e6f0ff" : "#ffffff";
    let ai = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc, p.z), 3.5 * sc))) continue;
      const a = this.actor(ai++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      a.mesh.scale.set(p.mirror ? -sc : sc, sc, sc);
      if (a.mat.emissiveMap) a.mat.emissive.set(tint);
      a.mesh.castShadow = s.light === "golden" && L.actorShadow;
      used.push(a);
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    let fi = 0;
    const fused: Fx[] = [];
    for (const p of st.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const e = this.fx(fi++);
      e.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e.use(!!p.soft);
      e.mesh.visible = true;
      e.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e.mesh.quaternion.copy(cam.quaternion); e.mesh.rotateZ(p.rot ?? 0); }
      e.mesh.scale.set(p.w, p.h, 1);
      fused.push(e);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const e of fused) e.bind();
    return focus;
  }

  /** rupture beat: the tank folds, the cover flies and the syrup wave rolls outward */
  private poseBurst(t: number) {
    // two rings of rivets, initially seated in the steel, then flung outward at the snap
    const burst = clamp01((t - at(124)) / 0.55), rmat = new THREE.Matrix4();
    for (let i = 0; i < 40; i++) {
      const ring = i < 20 ? 0 : 1, j = i % 20, a = (j / 20) * Math.PI * 2;
      const yy = ring ? 5.4 : 2.4, rad = 6.26;
      const fly = burst * (3.5 + (j % 5) * 0.9);
      rmat.makeTranslation(Math.cos(a) * (rad + fly), yy + fly * 0.45 - 2.2 * burst * burst, Math.sin(a) * (rad + fly));
      this.rivets.setMatrixAt(i, rmat);
    }
    this.rivets.instanceMatrix.needsUpdate = true;
    const fold = smooth((t - at(133)) / (at(142) - at(133)));
    this.burstTank.scale.y = 1 - 0.78 * fold;
    this.burstTank.scale.x = this.burstTank.scale.z = 1 + 0.18 * fold;
    this.burstTank.rotation.z = -0.28 * fold;
    this.burstTank.position.y = 7.6 * (1 - 0.78 * fold) + 0.4 * fold;
    const flight = clamp01((t - at(124)) / 2.0);
    this.manhole.position.set(0.8 + 3.4 * flight, 15.4 + 7.5 * flight - 9.8 * flight * flight, 1.2 + 2.0 * flight);
    this.manhole.rotation.set(flight * 7, flight * 4, flight * 9);
    const advance = smooth((t - at(124)) / (at(142) - at(124)));
    const frontZ = -2 + advance * 36;
    const pos = this.wave.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const depth = clamp01((frontZ - z) / 9);
      const cross = Math.max(0, Math.cos((Math.PI * x) / 26));
      const ripple = 0.22 * Math.sin(z * 0.8 - advance * 11 + x * 0.35);
      const h = t < at(126) ? 0 : 2.9 * depth * cross * (1 - 0.42 * advance) + ripple * depth;
      pos.setY(i, 0.05 + Math.max(0, h));
    }
    pos.needsUpdate = true;
    this.wave.geometry.computeVertexNormals();
    this.wave.visible = t >= at(124);
  }
}

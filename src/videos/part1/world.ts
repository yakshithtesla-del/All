// Aisle 9 at 11:59 p.m. — a painted three.js supermarket interior. Fluorescent tubes, stocked shelves,
// tiled floor, and the first customer standing silently at the far end. InkPass outlines the geometry;
// the flat cartoon cast (Mara, the customer) lives on NOINK as lit billboards.
import * as THREE from "three";
import { Batch, V, lam, quad, boxGeo, groundQuad } from "./build";
import { rep, ctex } from "./paint";
import { LIGHTS, LOOK } from "./lights";
import { TONE, CHAR, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage } from "./cast";
import { FPS, SHOTS, camAt, dofAt, shutterAt } from "./story";

type Mats = Record<string, THREE.Material>;

/* ---------------- painted textures ---------------- */
const floorTex = () => ctex("nsFloor", 1024, 1024, (g, r) => {
  g.fillStyle = "#cfc9b8"; g.fillRect(0, 0, 1024, 1024);
  const n = 8, s = 1024 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = (i + j) % 2 ? "#bdb7a8" : "#ded8c7";
    g.fillRect(i * s, j * s, s, s);
    g.strokeStyle = "rgba(50,52,62,0.3)"; g.lineWidth = 2; g.strokeRect(i * s, j * s, s, s);
    for (let k = 0; k < 10; k++) {
      g.fillStyle = `rgba(70,72,84,${0.03 + r() * 0.06})`;
      g.fillRect(i * s + r() * s, j * s + r() * s, 3 + r() * 9, 3 + r() * 9);
    }
  }
});
const ceilingTex = () => ctex("nsCeiling", 512, 512, (g) => {
  g.fillStyle = "#c9cdd2"; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "#a9adb5"; g.lineWidth = 4;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.stroke(); }
  for (let j = 0; j <= 4; j++) { g.beginPath(); g.moveTo(0, j * 128); g.lineTo(512, j * 128); g.stroke(); }
});
const glowTex = (key: string, inner: string) => ctex(key, 256, 256, (g) => {
  const gr = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  gr.addColorStop(0, inner); gr.addColorStop(0.3, "rgba(238,246,255,0.35)"); gr.addColorStop(1, "rgba(220,235,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
});
const signTex = () => ctex("nsSign", 512, 192, (g) => {
  g.fillStyle = "#16446e"; g.fillRect(0, 0, 512, 192);
  g.strokeStyle = "#f0f4f8"; g.lineWidth = 8; g.strokeRect(8, 8, 496, 176);
  g.fillStyle = "#ffffff"; g.textAlign = "center"; g.font = "bold 92px sans-serif";
  g.fillText("AISLE 9", 256, 122);
});
/** rain-streaked glazing for the automatic sliding doors; alpha keeps the dark lot visible behind */
const glassTex = () => ctex("nsGlass", 512, 640, (g, r) => {
  g.clearRect(0, 0, 512, 640);
  g.fillStyle = "rgba(120,155,190,0.20)"; g.fillRect(0, 0, 512, 640);
  const gr = g.createLinearGradient(0, 0, 512, 640);
  gr.addColorStop(0, "rgba(210,230,255,0.24)"); gr.addColorStop(0.5, "rgba(150,180,215,0.06)");
  gr.addColorStop(1, "rgba(200,220,250,0.20)");
  g.fillStyle = gr; g.fillRect(0, 0, 512, 640);
  // vertical rain runs
  for (let i = 0; i < 46; i++) {
    const x = r() * 512, y = r() * 420, len = 30 + r() * 190;
    g.strokeStyle = `rgba(225,240,255,${0.08 + r() * 0.22})`;
    g.lineWidth = 1 + r() * 3;
    g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 5, y + len * 0.35, x - 4, y + len * 0.7, x + 2, y + len); g.stroke();
    g.fillStyle = `rgba(235,245,255,${0.12 + r() * 0.18})`;
    g.beginPath(); g.ellipse(x + 2, y + len, 3 + r() * 4, 5 + r() * 7, 0, 0, Math.PI * 2); g.fill();
  }
  // faint reflection of the interior tubes
  g.fillStyle = "rgba(255,255,255,0.07)";
  for (const x of [70, 250, 430]) g.fillRect(x, 0, 22, 640);
});
const shutterTex = () => ctex("nsShutter", 512, 512, (g, r) => {
  g.fillStyle = "#727b86"; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 26) {
    g.fillStyle = "#8c95a0"; g.fillRect(0, y, 512, 18);
    g.fillStyle = "rgba(20,26,36,0.45)"; g.fillRect(0, y + 18, 512, 5);
    g.fillStyle = `rgba(90,70,50,${0.05 + r() * 0.08})`; g.fillRect(r() * 480, y + 4, 20 + r() * 40, 8);
  }
});
const hoursTex = () => ctex("nsHours", 512, 128, (g) => {
  g.fillStyle = "#111b2c"; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = "#63d9a8"; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
  g.fillStyle = "#8ff0c4"; g.textAlign = "center"; g.font = "bold 66px sans-serif";
  g.fillText("24 HOURS", 256, 86);
});

const PRODUCTS = ["#c0443e", "#3f6fa8", "#d9a436", "#4f8a5a", "#c4773f", "#8e5b9c", "#b8bcc2", "#42618c"];

/* ---------------- world ---------------- */
export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight; private fill: THREE.DirectionalLight;
  private fog = new THREE.Fog("#14203a", 22, 120);
  private glows: THREE.Sprite[] = [];
  private shutter!: THREE.Mesh;
  private scene = new THREE.Group();
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor() {
    const R = this.root, M: Mats = {};
    M.floor = lam("nsMatFloor", () => ({ map: rep(floorTex(), 5, 14) }));
    M.ceiling = lam("nsMatCeiling", () => ({ map: rep(ceilingTex(), 8, 16), side: THREE.DoubleSide }));
    M.wall = lam("nsMatWall", () => ({ color: "#8b919c", side: THREE.DoubleSide }));
    M.shelf = lam("nsMatShelf", () => ({ color: "#a9b0b8" }));
    M.shelfDark = lam("nsMatShelfDark", () => ({ color: "#525a66" }));
    M.lamp = lam("nsMatLamp", () => ({ color: "#f4f8ff", emissive: "#dfe9ff", emissiveIntensity: 0.8 }));
    M.frame = lam("nsMatFrame", () => ({ color: "#39424e" }));
    PRODUCTS.forEach((c, i) => { M["p" + i] = lam("nsProd" + i, () => ({ color: c })); });

    this.hemi = new THREE.HemisphereLight("#c8d8ff", "#141a2c", 0.55);
    this.sun = new THREE.DirectionalLight("#e8f0ff", 2.2);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    this.fill = new THREE.DirectionalLight("#8ea0d8", 0.2);
    R.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);

    this.scene = this.buildStore(M);
    R.add(this.scene);
    this.buildGlows();
    this.buildDoors();

    // hanging AISLE 9 sign
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.98),
      new THREE.MeshBasicMaterial({ map: signTex(), side: THREE.DoubleSide, fog: true }));
    sign.position.set(0.1, 3.05, 11.5); sign.rotation.y = Math.PI; sign.layers.set(NOINK); R.add(sign);
  }

  private buildStore(M: Mats) {
    const g = new THREE.Group(), b = new Batch();
    // shell: tiled floor, ceiling, side walls; far end is GLAZED AUTOMATIC DOORS (z = 22)
    const END = 22;
    b.add(groundQuad(-8, 8, -30, END, 0, 5, 14), M.floor);
    b.add(quad(V(-8, 3.75, -30), V(8, 3.75, -30), V(8, 3.75, END), V(-8, 3.75, END), 8, 12), M.ceiling);
    b.add(quad(V(-8, 0, -30), V(-8, 3.75, -30), V(-8, 3.75, END), V(-8, 0, END), 2, 7), M.wall);
    b.add(quad(V(8, 3.75, -30), V(8, 0, -30), V(8, 0, END), V(8, 3.75, END), 2, 7), M.wall);
    b.add(quad(V(-8, 3.75, -30), V(8, 3.75, -30), V(8, 0, -30), V(-8, 0, -30), 4, 2), M.wall);
    // end wall either side of the 5.2 m glazed opening, plus the header above it
    b.add(quad(V(-8, 0, END), V(-2.6, 0, END), V(-2.6, 3.75, END), V(-8, 3.75, END), 2, 2), M.wall);
    b.add(quad(V(2.6, 0, END), V(8, 0, END), V(8, 3.75, END), V(2.6, 3.75, END), 2, 2), M.wall);
    b.add(quad(V(-2.6, 2.62, END), V(2.6, 2.62, END), V(2.6, 3.75, END), V(-2.6, 3.75, END), 3, 1), M.wall);
    // door frame: sill, jambs, centre mullion, header rail
    for (const x of [-2.66, 0, 2.66]) b.add(boxGeo(V(x - 0.09, 0, END - 0.14), V(x + 0.09, 2.7, END + 0.06)), M.frame);
    b.add(boxGeo(V(-2.7, 2.6, END - 0.14), V(2.7, 2.78, END + 0.06)), M.frame);
    b.add(boxGeo(V(-2.7, 0, END - 0.2), V(2.7, 0.09, END + 0.06)), M.shelfDark);
    // push bars on the two sliding leaves
    b.add(boxGeo(V(-2.3, 1.02, END - 0.24), V(-0.28, 1.1, END - 0.15)), M.shelf);
    b.add(boxGeo(V(0.28, 1.02, END - 0.24), V(2.3, 1.1, END - 0.15)), M.shelf);

    // shelf bays on both sides of Aisle 9
    const palettes = [0, 3, 1, 5, 2, 6, 4, 0, 7];
    for (const side of [-1, 1]) {
      const cx = side < 0 ? -3.85 : 3.85;
      for (let k = 0; k < 9; k++) {
        const z0 = -22 + k * 5.6, z1 = z0 + 5.0, x0 = cx - 1.25, x1 = cx + 1.25;
        // upright frame posts
        for (const px of [x0, x1]) for (const pz of [z0, z1])
          b.add(boxGeo(V(px - 0.07, 0, pz - 0.07), V(px + 0.07, 3.05, pz + 0.07)), M.frame);
        // four shelf boards per bay
        const levels = [0.32, 1.05, 1.78, 2.5];
        levels.forEach((y, li) => {
          b.add(boxGeo(V(x0, y, z0), V(x1, y + 0.09, z1)), M.shelf);
          // shelf lip
          b.add(boxGeo(V(x0, y, z1 - 0.06), V(x1, y + 0.16, z1)), M.shelfDark);
          // product rows: 2 deep, 6 across, varying heights and colours
          for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
            const idx = palettes[(k + i + row * 3 + li) % palettes.length];
            const px = x0 + 0.26 + i * 0.38, pz = z0 + 0.55 + row * 2.2;
            const hh = 0.3 + ((i * 7 + k * 3 + li) % 4) * 0.045;
            b.add(boxGeo(V(px - 0.16, y + 0.09, pz - 0.19), V(px + 0.16, y + 0.09 + hh, pz + 0.19)), M["p" + idx]);
          }
        });
      }
    }

    // sign supports
    for (const x of [-1.15, 1.35]) b.add(boxGeo(V(x - 0.014, 3.52, 11.49), V(x + 0.014, 3.75, 11.51)), M.frame);

    // fluorescent fixtures along the ceiling, row down the middle of the aisle
    for (let z = -24; z <= 30; z += 6) {
      b.add(boxGeo(V(-0.85, 3.68, z - 1.2), V(0.85, 3.73, z + 1.2)), M.frame);
      b.add(boxGeo(V(-0.72, 3.63, z - 1.05), V(0.72, 3.68, z + 1.05)), M.lamp);
      for (const x of [-4.9, 4.9]) {
        b.add(boxGeo(V(x - 0.6, 3.68, z - 0.9), V(x + 0.6, 3.73, z + 0.9)), M.frame);
        b.add(boxGeo(V(x - 0.48, 3.63, z - 0.75), V(x + 0.48, 3.68, z + 0.75)), M.lamp);
      }
    }

    // dumpster-style endcap and a fallen cart near the far customer
    b.add(boxGeo(V(-2.8, 0, 22), V(2.8, 1.15, 23.4)), M.shelfDark);
    for (const [x, z, rot] of [[1.9, 17.5, 0.5], [-2.4, 20, -0.8]] as [number, number, number][]) {
      const m = new THREE.Matrix4().compose(V(x, 0, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rot), V(1, 1, 1));
      b.add(boxGeo(V(-0.55, 0.25, -0.85), V(0.55, 0.95, 0.85)), M.frame, m);
      for (const wx of [-0.45, 0.45]) for (const wz of [-0.65, 0.65]) {
        const wg = new THREE.CylinderGeometry(0.13, 0.13, 0.1, 8); wg.rotateZ(Math.PI / 2); wg.translate(wx, 0.13, wz);
        b.add(wg, M.shelfDark, m);
      }
    }
    b.build(g);
    return g;
  }

  /** rain-streaked glass sliding leaves, the dark wet lot beyond, and the 24 HOURS sign */
  private buildDoors() {
    const END = 22, R = this.root;
    const gt = glassTex();
    for (const x of [-1.3, 1.3]) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.55),
        new THREE.MeshBasicMaterial({ map: gt, transparent: true, opacity: 0.92, side: THREE.DoubleSide,
          depthWrite: false, fog: false }));
      pane.position.set(x, 1.31, END - 0.1); pane.layers.set(NOINK); pane.renderOrder = 2; R.add(pane);
    }
    // exterior: dark tarmac, a couple of parked-car silhouettes, a distant lamp
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(26, 12),
      new THREE.MeshBasicMaterial({ color: "#0d1424", fog: false }));
    lot.position.set(0, 3, END + 8); lot.layers.set(NOINK); R.add(lot);
    const cars = new THREE.Group();
    for (const [x, y, w, h] of [[-4.6, 0.75, 3.4, 1.3], [4.2, 0.7, 3.0, 1.2]] as [number, number, number, number][]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: "#151c2e", fog: false }));
      c.position.set(x, y, END + 4); cars.add(c);
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, h * 0.5),
        new THREE.MeshBasicMaterial({ color: "#1b2438", fog: false }));
      roof.position.set(x, y + h * 0.65, END + 4); cars.add(roof);
    }
    cars.traverse((o) => { o.layers.set(NOINK); }); R.add(cars);
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex("nsOutsideGlow", "rgba(255,222,160,0.9)"),
      color: new THREE.Color(1.2, 1.0, 0.7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    lamp.position.set(6.5, 4.6, END + 5); lamp.scale.set(6, 6, 1); lamp.layers.set(NOINK); R.add(lamp);
    // steel security shutter: parks above the opening, grinds down over the glass in shot 6
    this.shutter = new THREE.Mesh(new THREE.PlaneGeometry(5.25, 2.72),
      new THREE.MeshLambertMaterial({ map: rep(shutterTex(), 1, 1), side: THREE.DoubleSide }));
    this.shutter.position.set(0, 4.06, END - 0.22);
    this.shutter.rotation.y = Math.PI; this.shutter.layers.set(0); R.add(this.shutter);
    // red shutter-control button on the right jamb
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.1),
      new THREE.MeshBasicMaterial({ color: "#d8433e" }));
    btn.position.set(2.92, 1.38, END - 0.3); btn.layers.set(NOINK); R.add(btn);

    // 24 HOURS box above the doors
    const hours = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.58),
      new THREE.MeshBasicMaterial({ map: hoursTex(), side: THREE.DoubleSide, fog: false }));
    hours.position.set(0, 3.16, END - 0.18); hours.rotation.y = Math.PI; hours.layers.set(NOINK); R.add(hours);
  }

  private buildGlows() {
    const t = glowTex("nsLampGlow", "rgba(255,255,255,0.95)");
    for (let z = -24; z <= 30; z += 6) for (const x of [0, -4.9, 4.9]) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: new THREE.Color(1.5, 1.6, 1.9),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      s.position.set(x, 3.5, z); s.scale.set(x === 0 ? 3.6 : 2.8, 1.5, 1); s.layers.set(NOINK);
      this.glows.push(s); this.root.add(s);
      // pool of light on the floor
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: t,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.015, z); pool.layers.set(NOINK); this.root.add(pool);
    }
  }

  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], L = LIGHTS[s.light], K = LOOK[s.light];
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.2; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    cam.layers.enable(NOINK);
    const focus = V(dofAt(f).focus[0], dofAt(f).focus[1], dofAt(f).focus[2]);
    const dist = cam.position.distanceTo(focus);

    // camera-relative key light, frozen per shot (overhead fluorescent feel: high elevation, slight right bias)
    const az = THREE.MathUtils.degToRad(L.az), el = THREE.MathUtils.degToRad(L.el);
    let fx = c.look[0] - c.pos[0], fz = c.look[2] - c.pos[2]; const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    const sunDir = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    const Rr = THREE.MathUtils.clamp(dist * 1.2 + 8, 14, 95);
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

    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    scene.fog = this.fog; scene.background = null;
    // the shutter drops 2.72 m from its parked position above the doors
    this.shutter.position.y = 4.06 - 2.72 * shutterAt(f);

    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, { pos: cam.position, right });
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let ai = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc2 = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 3.5 * sc2))) continue;
      const a = this.actor(ai++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      a.mesh.scale.set(sc2, sc2, sc2);
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
}

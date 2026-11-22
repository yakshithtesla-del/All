// One painted three.js world for the zombie sample: a derelict night street, plus a purple mechanism zoom.
// Geometry is ink-outlined by InkPass; the flat cartoon cast, glows, mist and diagram cards live on NOINK.
import * as THREE from "three";
import { Batch, V, lam, quad, boxGeo, groundQuad, beamBetween } from "./build";
import { rep, ctex, facadeHD, cobbleHD, planksHD, roofHD, dirtHD, cloudHD } from "./paint";
import { LIGHTS, LOOK } from "./lights";
import { TONE, CHAR, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage } from "./cast";
import { FPS, SHOTS, camAt, dofAt, V3 } from "./story";

type Mats = Record<string, THREE.Material>;

const glowTex = (key: string, inner: string) => ctex(key, 256, 256, (g) => {
  const gr = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  gr.addColorStop(0, inner); gr.addColorStop(0.32, "rgba(255,201,111,0.36)"); gr.addColorStop(1, "rgba(255,180,80,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
});
const bloodTex = () => ctex("bloodPool", 256, 256, (g, r) => {
  g.fillStyle = "rgba(0,0,0,0)"; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#5a1b24";
  g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2, rr = 76 + 26 * Math.sin(a * 3) + 12 * (r() - 0.5);
    const x = 128 + Math.cos(a) * rr, y = 128 + Math.sin(a) * rr * 0.62;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.closePath(); g.fill();
});

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight; private fill: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#1c2947", 30, 400);
  private moon: THREE.Sprite; private glows: THREE.Sprite[] = [];
  private cloudMaps: THREE.Texture[]; private clouds: THREE.Mesh[] = [];
  private scene = new THREE.Group();
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();
  private sunCache = new Map<number, THREE.Vector3>();

  constructor() {
    const R = this.root, M: Mats = {};
    // ---- sky ----
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
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex("moon", "rgba(226,236,255,1)"), color: new THREE.Color(0.7, 0.8, 1.1),
      fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.moon.scale.setScalar(46); this.moon.renderOrder = -0.5; this.moon.frustumCulled = false; this.moon.layers.set(NOINK); R.add(this.moon);

    this.hemi = new THREE.HemisphereLight("#101a38", "#141a2c", 0.5);
    this.sun = new THREE.DirectionalLight("#bcd0ff", 1.6);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    this.fill = new THREE.DirectionalLight("#8ea0d8", 0.2);
    R.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);

    this.cloudMaps = [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.night.cloud));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps[i % 4],
        color: new THREE.Color(0.85, 0.9, 1.0), transparent: true, depthWrite: false, fog: false }));
      const w = 150 + (i % 4) * 40;
      m.position.set(Math.cos(a) * d, 130 + (i % 4) * 40, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK); this.clouds.push(m); R.add(m);
    }

    // ---- painted materials ----
    M.road = lam("zbRoad", () => ({ map: rep(cobbleHD(), 16, 16) }));
    M.dirt = lam("zbDirt", () => ({ map: rep(dirtHD(), 8, 8) }));
    M.wallA = lam("zbWallA", () => ({ map: facadeHD("zbWallA", 8, 11, { wall: "#5f6270", shutter: "#33384a", door: true }) }));
    M.wallB = lam("zbWallB", () => ({ map: facadeHD("zbWallB", 9, 9, { wall: "#6a5d62", shutter: "#3b3641", door: true }) }));
    M.wallC = lam("zbWallC", () => ({ map: facadeHD("zbWallC", 8, 13, { wall: "#545c68", shutter: "#2f3542", door: true }) }));
    M.roof = lam("zbRoof", () => ({ map: rep(roofHD("#3e424e"), 3, 3) }));
    M.wood = lam("zbWood", () => ({ map: rep(planksHD(), 2, 2) }));
    M.metal = lam("zbMetal", () => ({ color: "#3d4750" }));
    M.rust = lam("zbRust", () => ({ color: "#7a4a3e" }));
    M.carA = lam("zbCarA", () => ({ color: "#4b6b7a" }));
    M.carB = lam("zbCarB", () => ({ color: "#7b4c4f" }));
    M.glass = lam("zbGlass", () => ({ color: "#1b2534" }));
    M.lamp = lam("zbLamp", () => ({ color: "#f2c57c" }));
    M.dark = lam("zbDark", () => ({ color: "#242634" }));

    this.scene = this.buildStreet(M);
    R.add(this.scene);
    this.buildGlows();
    const bt = bloodTex();
    for (const [x, z, s] of [[-1.8, 2.4, 1.2], [2.5, 6.2, 0.9], [-4.5, 4.4, 0.7]] as [number, number, number][]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.1 * s, 1.4 * s),
        new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, fog: true }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, z); m.layers.set(NOINK); R.add(m);
    }
  }

  private buildStreet(M: Mats) {
    const g = new THREE.Group(), b = new Batch();
    // road, kerbs, broken paving
    b.add(groundQuad(-70, 70, -70, 70, 0, 30, 30), M.dirt);
    b.add(groundQuad(-7, 7, -70, 70, 0.02, 8, 30), M.road);
    for (const s of [-1, 1]) b.add(boxGeo(V(s * 7.1, 0, -70), V(s * 7.8, 0.22, 70)), M.wallA);
    for (let z = -60; z < 70; z += 6) for (const x of [-3.6, 0, 3.6])
      b.add(boxGeo(V(x - 0.09, 0.035, z), V(x + 0.09, 0.04, z + 2.4)), M.lamp);
    // derelict facades, both sides of the street
    const blocks: [number, number, number, number, number, THREE.Material, string][] = [
      [-14, -30, 8, 11, 8, M.wallA, "roof"], [-14, -10, 9, 9, 9, M.wallB, "roof"],
      [-14, 12, 8, 13, 8, M.wallC, "roof"], [-14, 34, 10, 10, 9, M.wallA, "roof"],
      [14, -34, 9, 12, 9, M.wallC, "roof"], [14, -12, 8, 10, 8, M.wallA, "roof"],
      [14, 10, 10, 13, 9, M.wallB, "roof"], [14, 32, 8, 9, 8, M.wallC, "roof"],
    ];
    for (const [x, z, w, h, d, mat] of blocks) {
      b.add(boxGeo(V(x - w / 2, 0, z - d / 2), V(x + w / 2, h, z + d / 2)), mat);
      b.add(boxGeo(V(x - w / 2 - 0.3, h, z - d / 2 - 0.3), V(x + w / 2 + 0.3, h + 0.45, z + d / 2 + 0.3)), M.roof);
    }
    // abandoned cars
    const cars: [number, number, number, THREE.Material, number][] = [
      [-3.6, 8.5, 0.1, M.carA, 1], [3.8, 12.5, -0.2, M.carB, 1], [-4.0, -12, 0.15, M.rust, 1],
      [4.2, -18, 0.05, M.carA, 1], [-3.2, 26, -0.1, M.carB, 1],
    ];
    for (const [x, z, yaw, mat, s] of cars) {
      const c = new THREE.Matrix4().compose(V(x, 0, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(s, s, s));
      b.add(boxGeo(V(-1.1, 0.42, -2.3), V(1.1, 1.12, 2.3)), mat, c);
      b.add(boxGeo(V(-0.92, 1.12, -1.0), V(0.92, 1.72, 1.1)), M.glass, c);
      for (const wx of [-1.12, 1.12]) for (const wz of [-1.45, 1.45]) {
        const wg = new THREE.CylinderGeometry(0.43, 0.43, 0.25, 12);
        wg.rotateZ(Math.PI / 2); wg.translate(wx, 0.43, wz); b.add(wg, M.dark, c);
      }
    }
    // street lamps (poles + arms + glass heads)
    for (const [x, z, dir] of [[-6.6, -3, 1], [6.6, 6, -1], [-6.6, 17, 1], [6.6, 25, -1]] as [number, number, number][]) {
      b.add(beamBetween(V(x, 0.2, z), V(x, 6.6, z), 0.11), M.metal);
      b.add(beamBetween(V(x, 6.6, z), V(x + dir * 1.5, 6.8, z), 0.09), M.metal);
      b.add(boxGeo(V(x + dir * 1.25, 6.6, z - 0.45), V(x + dir * 1.75, 6.95, z + 0.45)), M.lamp);
    }
    // knocked-over barricade and rubble
    for (const [x, z, r] of [[-2.2, 3.8, 0.4], [0.6, 4.4, -0.3], [3.0, 3.2, 0.25]] as [number, number, number][]) {
      const m = new THREE.Matrix4().compose(V(x, 0.55, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r, 0.22)), V(1, 1, 1));
      b.add(boxGeo(V(-2.2, -0.12, -0.14), V(2.2, 0.12, 0.14)), M.wood, m);
    }
    for (let i = 0; i < 24; i++) {
      const x = -8 + ((i * 37) % 160) / 10, z = -14 + ((i * 53) % 480) / 10, s = 0.1 + (i % 4) * 0.05;
      b.add(boxGeo(V(x - s, 0.02, z - s), V(x + s, 0.08 + s, z + s)), i % 3 ? M.dirt : M.wallB);
    }
    b.build(g);
    return g;
  }

  private buildGlows() {
    const t = glowTex("zbLampGlow", "rgba(255,232,170,0.9)");
    for (const [x, z, dir] of [[-6.6, -3, 1], [6.6, 6, -1], [-6.6, 17, 1], [6.6, 25, -1]] as [number, number, number][]) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: new THREE.Color(1.7, 1.15, 0.55),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      s.position.set(x + dir * 1.5, 6.75, z); s.scale.setScalar(5.2); s.layers.set(NOINK);
      this.glows.push(s); this.root.add(s);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: t, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(x + dir * 1.2, 0.03, z); pool.layers.set(NOINK); this.root.add(pool);
    }
  }

  private shotSun(id: number, L: typeof LIGHTS[string]) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    const s = SHOTS[id - 1];
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

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene): THREE.Vector3 {
    const t = f / FPS, s = SHOTS[id - 1], L = LIGHTS[s.light], K = LOOK[s.light];
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.2; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    cam.layers.enable(NOINK);
    const focus = V(...dofAt(f).focus), dist = cam.position.distanceTo(focus);

    const sunDir = this.shotSun(id, L);
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

    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    scene.fog = this.fog; scene.background = null;
    this.moon.position.copy(cam.position).addScaledVector(sunDir, 800).add(new THREE.Vector3(-70, 190, 0));
    this.moon.visible = s.light === "night";
    for (const m of this.glows) (m.material as THREE.SpriteMaterial).color.set(s.light === "purple" ? "#c07ad8" : "#ffc16d");
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i]; m.lookAt(cam.position.x, m.position.y, cam.position.z);
      (m.material as THREE.MeshBasicMaterial).map = this.cloudMaps[i % 4];
    }

    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, { pos: cam.position, right });
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const tint = s.light === "purple" ? "#e0c8ff" : "#dce8ff";
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

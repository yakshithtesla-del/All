// The whole world as one three.js scene: 21 sets on a 400 m grid (story.ts SET_HOME), each built once as
// static two-tone batches (build.ts) plus a few dynamic sub-groups (trucks, chip, calendar, orb, icons).
// update(id, f, camera, scene) poses everything for shot `id` at frame f (pure function of id + f):
// camera = camAt(id, f) local + set home offset + kick shake, sun frozen per shot and camera-relative,
// two-tone uniforms (shade.ts), sky shader + fog per light preset, cast billboards (cast.ts) placed per
// shot with frustum culling, dynamic props, and the returned focus point for DOF.
import * as THREE from "three";
import { Batch, boxGeo, quad, V, lam } from "./build";
import { ctex, cobbleHD, grassHD, planksHD, stoneHD } from "./paint";
import { LIGHTS, LOOK, type LightPreset } from "./lights";
import { TONE, CHAR, twoTone, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, person, blob, setLight, setSun, viewOf, CamInfo, Stage, Who } from "./cast";
import { FPS, SHOTS, SET_HOME, camAt, kickAt, easeOut, smooth, clamp01 } from "./story";
import { type Set as WSet, type V3 } from "./story";
import { Pen, type Outfit, type Expr, type FrontOpts, type SideOpts, INK } from "./toon";

// ---------------- small canvas / pen helpers ----------------
type G = CanvasRenderingContext2D;
const rrPath = (g: G, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
};
const T = (g: G, s: string, x: number, y: number, px: number, col = "#fff", align: CanvasTextAlign = "center", weight = 900) => {
  g.fillStyle = col; g.font = `${weight} ${px}px Arial, sans-serif`; g.textAlign = align; g.textBaseline = "middle"; g.fillText(s, x, y);
};
const tex = (key: string, w: number, h: number, draw: (g: G, r: () => number) => void) => ctex(key, w, h, (g, r) => { draw(g, r); });
/** pen-space rounded rect */
const rrP = (x0: number, y0: number, x1: number, y1: number, r: number): [number, number][] => {
  const k = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2), p: [number, number][] = [];
  const arc = (cx: number, cy: number, a0: number, a1: number, n = 6) => {
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; p.push([cx + k * Math.cos(a), cy + k * Math.sin(a)]); }
  };
  arc(x1 - k, y0 + k, -Math.PI / 2, 0); arc(x1 - k, y1 - k, 0, Math.PI / 2);
  arc(x0 + k, y1 - k, Math.PI / 2, Math.PI); arc(x0 + k, y0 + k, Math.PI, Math.PI * 1.5);
  return p;
};
const HDR = (r: number, g: number, b: number) => new THREE.Color(r, g, b);

// ---------------- painted signs / screens / icons ----------------
const newsT = tex("news", 256, 320, (g) => {
  g.fillStyle = "#f4f1e8"; g.fillRect(0, 0, 256, 320);
  g.fillStyle = "#181820"; g.fillRect(14, 12, 228, 4);
  T(g, "GOOGLE AI FAILS?", 128, 46, 34, "#181820");
  T(g, "IS GOOGLE FINISHED?", 128, 76, 19, "#5a564e", "center", 700);
  g.fillStyle = "#8a867c";
  for (let c = 0; c < 3; c++) for (let i = 0; i < 12; i++) g.fillRect(16 + c * 82, 100 + i * 17, 70, 7);
  g.strokeStyle = "#3a3830"; g.lineWidth = 3; g.strokeRect(4, 4, 248, 312);
});
const rainT = tex("rain", 24, 128, (g) => {
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, "rgba(210,225,245,0)"); gr.addColorStop(0.35, "rgba(210,225,245,0.75)");
  gr.addColorStop(1, "rgba(210,225,245,0)");
  g.fillStyle = gr; g.fillRect(9, 0, 5, 128);
});
const puddleT = tex("puddle", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  gr.addColorStop(0, "rgba(24,30,42,0.85)"); gr.addColorStop(0.8, "rgba(24,30,42,0.55)"); gr.addColorStop(1, "rgba(24,30,42,0)");
  g.fillStyle = gr; g.beginPath(); g.ellipse(64, 64, 60, 38, 0, 0, 7); g.fill();
});
const cityT = tex("city", 1024, 512, (g, r) => {
  g.fillStyle = "#0b1024"; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 46; i++) {
    const w = 40 + r() * 90, x = r() * 1024, h = 90 + r() * 330, y = 512 - h;
    g.fillStyle = `rgb(${14 + (r() * 12) | 0},${16 + (r() * 14) | 0},${34 + (r() * 18) | 0})`;
    g.fillRect(x, y, w, h);
    g.fillStyle = "rgba(255,214,140,0.5)";
    for (let wy = y + 14; wy < 500; wy += 22) for (let wx = x + 8; wx < x + w - 10; wx += 16) if (r() < 0.3) g.fillRect(wx, wy, 7, 10);
  }
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, "rgba(10,14,34,0.9)"); gr.addColorStop(0.55, "rgba(10,14,34,0)"); gr.addColorStop(1, "rgba(40,44,80,0.35)");
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
});
const xpostT = tex("xpost", 768, 512, (g) => {
  g.fillStyle = "#0b0e14"; rrPath(g, 8, 8, 752, 496, 44); g.fill();
  g.strokeStyle = "#3a4050"; g.lineWidth = 5; rrPath(g, 8, 8, 752, 496, 44); g.stroke();
  g.fillStyle = "#dfe3ec"; g.beginPath(); g.arc(76, 84, 36, 0, 7); g.fill();      // avatar
  g.fillStyle = "#12141c"; g.beginPath(); g.arc(76, 84, 36, 0, 7); g.moveTo(52, 96); g.arc(76, 108, 30, Math.PI, 0, true); g.fill();
  T(g, "X", 132, 62, 26, "#dfe3ec", "left");
  T(g, "@latestpost", 132, 96, 20, "#7a8294", "left", 600);
  // big X glyph
  g.strokeStyle = "#dfe3ec"; g.lineWidth = 22; g.lineCap = "round";
  g.beginPath(); g.moveTo(690, 52); g.lineTo(726, 100); g.moveTo(726, 52); g.lineTo(690, 100); g.stroke();
  T(g, "Google will win", 92, 220, 52, "#f2f4fa", "left");
  T(g, "the AI race in the West.", 92, 286, 52, "#f2f4fa", "left");
  T(g, "12:47 PM", 92, 372, 22, "#7a8294", "left", 600);
  T(g, "2.1M   84K   610K", 92, 428, 30, "#aab2c4", "left");
});
const boardT = tex("board", 1024, 512, (g) => {
  g.fillStyle = "#f6f7f4"; g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = "#d8dad4"; g.lineWidth = 6; g.strokeRect(8, 8, 1008, 496);
  g.lineCap = "round";
  g.strokeStyle = "#2f6fd0"; g.lineWidth = 10;
  g.strokeRect(90, 110, 300, 190);
  T(g, "AI", 240, 205, 110, "#2f6fd0");
  g.strokeStyle = "#d04a2f"; g.lineWidth = 10;
  g.beginPath(); g.moveTo(470, 300); g.quadraticCurveTo(560, 120, 650, 300); g.stroke();
  g.beginPath(); g.moveTo(650, 300); g.lineTo(620, 250); g.moveTo(650, 300); g.lineTo(676, 262); g.stroke();
  g.strokeStyle = "#2f9d54"; g.lineWidth = 9;
  g.strokeRect(760, 150, 180, 120);
  T(g, "TPU?", 850, 210, 62, "#2f9d54");
  T(g, "chips -> data -> model", 470, 420, 34, "#3a3a44", "center", 700);
});
const nvidiaT = tex("nvidia", 768, 256, (g) => {
  g.fillStyle = "#17181a"; g.fillRect(0, 0, 768, 256);
  g.fillStyle = "#76b900"; rrPath(g, 70, 78, 96, 96, 20); g.fill();
  g.fillStyle = "#17181a"; g.beginPath(); g.arc(118, 126, 22, 0, 7); g.fill();
  g.fillStyle = "#76b900"; g.beginPath(); g.arc(118, 126, 12, 0, 7); g.fill();
  T(g, "NVIDIA", 430, 126, 96, "#76b900");
});
const chipDieT = tex("die", 512, 288, (g) => {
  g.fillStyle = "#0a0a12"; g.fillRect(0, 0, 512, 288);
  g.fillStyle = "#1a1a2e"; rrPath(g, 96, 44, 320, 200, 10); g.fill();
  g.strokeStyle = "#6a5cff"; g.lineWidth = 4; rrPath(g, 96, 44, 320, 200, 10); g.stroke();
  for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) {
    g.fillStyle = `rgba(${90 + i * 14},${70 + j * 10},255,${0.25 + ((i + j) % 3) * 0.22})`;
    g.fillRect(112 + i * 37, 62 + j * 35, 27, 25);
  }
});
const tpuCardT = tex("tpucard", 640, 256, (g) => {
  g.fillStyle = "rgba(16,18,30,0.92)"; rrPath(g, 6, 6, 628, 244, 36); g.fill();
  g.strokeStyle = "#8a7cff"; g.lineWidth = 5; rrPath(g, 6, 6, 628, 244, 36); g.stroke();
  g.fillStyle = "#c8beff"; g.beginPath(); g.arc(96, 128, 52, 0, 7); g.fill();
  g.fillStyle = "#211a4a"; g.beginPath(); g.arc(96, 128, 38, 0, 7); g.fill();
  T(g, "TPU", 372, 128, 120, "#f0edff");
  T(g, "TENSOR PROCESSING UNIT", 372, 208, 22, "#9a90d8", "center", 700);
});
const rackT = tex("rack", 256, 512, (g, r) => {
  g.fillStyle = "#101018"; g.fillRect(0, 0, 256, 512);
  for (let u = 0; u < 10; u++) {
    const y = 14 + u * 49;
    g.fillStyle = "#191926"; g.fillRect(10, y, 236, 38);
    g.fillStyle = "#22222f"; g.fillRect(10, y, 236, 8);
    for (let i = 0; i < 9; i++) if (r() < 0.75) {
      g.fillStyle = ["#e879f9", "#22d3ee", "#a78bfa", "#f472b6"][(r() * 4) | 0];
      g.globalAlpha = 0.9; g.fillRect(18 + i * 26, y + 14, 14, 8);
    }
    g.globalAlpha = 1;
    g.fillStyle = "#0c0c14"; g.fillRect(120, y + 12, 60, 16);
  }
});
const ytPlayT = tex("ytplay", 512, 512, (g) => {
  g.fillStyle = "#ff0033"; rrPath(g, 26, 26, 460, 460, 96); g.fill();
  g.fillStyle = "#ffffff"; g.beginPath(); g.moveTo(206, 156); g.lineTo(206, 356); g.lineTo(376, 256); g.closePath(); g.fill();
});
const shelfRowsT = tex("shelves", 512, 1024, (g, r) => {
  g.fillStyle = "#5a3a22"; g.fillRect(0, 0, 512, 1024);
  for (let s = 0; s < 9; s++) {
    const y = 30 + s * 110;
    g.fillStyle = "#4a2e1a"; g.fillRect(0, y + 84, 512, 16);
    for (let b = 0; b < 15; b++) {
      const w = 16 + r() * 22, x = 6 + b * 34;
      if (x + w > 506) break;
      const cols = ["#b34a3a", "#3a6ab3", "#3a9a5a", "#c9a23a", "#8a5ab3", "#c96a3a", "#4a8a8a"];
      g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(x, y + 8, w, 76);
      g.fillStyle = "rgba(255,240,210,0.5)"; g.fillRect(x + 4, y + 20, Math.max(2, w - 10), 4);
    }
  }
});
const skyOpenT = tex("skyopen", 512, 512, (g) => {
  const gr = g.createRadialGradient(256, 256, 30, 256, 256, 256);
  gr.addColorStop(0, "#dff0ff"); gr.addColorStop(0.5, "#9fd0ff"); gr.addColorStop(1, "#6aa8f0");
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  g.fillStyle = "rgba(255,255,255,0.85)";
  for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(80 + i * 90, 140 + ((i * 67) % 160), 60, 22, 0, 0, 7); g.fill(); }
});
const gmailT = tex("gmail", 512, 320, (g) => {
  g.fillStyle = "#f8f9fb"; rrPath(g, 6, 6, 500, 308, 28); g.fill();
  g.strokeStyle = "#2b2430"; g.lineWidth = 6; rrPath(g, 6, 6, 500, 308, 28); g.stroke();
  g.fillStyle = "#fff"; g.fillRect(40, 52, 84, 60);
  g.strokeStyle = "#ea4335"; g.lineWidth = 9; g.lineCap = "round"; g.lineJoin = "round";
  g.beginPath(); g.moveTo(46, 58); g.lineTo(82, 92); g.lineTo(118, 58); g.stroke();
  g.strokeStyle = "#4285f4"; g.beginPath(); g.moveTo(46, 108); g.lineTo(46, 58); g.stroke();
  g.strokeStyle = "#34a853"; g.beginPath(); g.moveTo(118, 108); g.lineTo(118, 58); g.stroke();
  T(g, "Password reset", 150, 76, 30, "#202124", "left");
  T(g, "code", 150, 112, 30, "#202124", "left");
  T(g, "4 7 2 9", 372, 210, 64, "#1a73e8");
  T(g, "Gmail", 372, 268, 24, "#5f6368", "center", 700);
});
const earthT = tex("earth", 1024, 512, (g, r) => {
  g.fillStyle = "#2a6bc9"; g.fillRect(0, 0, 1024, 512);
  g.fillStyle = "rgba(255,255,255,0.16)";
  for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse(r() * 1024, r() * 512, 30 + r() * 60, 12 + r() * 20, 0, 0, 7); g.fill(); }
  g.fillStyle = "#3f9d4f";
  for (let i = 0; i < 14; i++) {
    const x = r() * 1024, y = 80 + r() * 340, w = 60 + r() * 160, h = 40 + r() * 100;
    g.beginPath(); g.ellipse(x, y, w / 2, h / 2, r() * 3, 0, 7); g.fill();
    g.beginPath(); g.ellipse(x + w * 0.4, y - h * 0.4, w / 3, h / 3.5, 0, 0, 7); g.fill();
  }
  g.fillStyle = "rgba(120,190,255,0.5)"; g.fillRect(0, 470, 1024, 42);
});
const androidScreenT = tex("androds", 128, 256, (g) => {
  g.fillStyle = "#0c0d12"; g.fillRect(0, 0, 128, 256);
  g.fillStyle = "#a4c639"; rrPath(g, 40, 96, 88, 118, 18); g.fill();
  g.beginPath(); g.arc(64, 92, 22, Math.PI, 0); g.fill();
  g.strokeStyle = "#a4c639"; g.lineWidth = 5;
  g.beginPath(); g.moveTo(50, 74); g.lineTo(44, 62); g.moveTo(78, 74); g.lineTo(84, 62); g.stroke();
  g.fillStyle = "#0c0d12"; g.beginPath(); g.arc(56, 88, 3, 0, 7); g.arc(72, 88, 3, 0, 7); g.fill();
  g.fillRect(36, 118, 12, 40); g.fillRect(80, 118, 12, 40); g.fillRect(42, 164, 10, 26); g.fillRect(76, 164, 10, 26);
});
const iphoneScreenT = tex("iphs", 128, 256, (g) => {
  g.fillStyle = "#111114"; g.fillRect(0, 0, 128, 256);
  g.fillStyle = "#e8eaf0"; g.beginPath(); g.arc(64, 118, 26, 0, 7); g.fill();
  g.fillStyle = "#111114"; g.fillRect(58, 96, 8, 34); g.beginPath(); g.arc(66, 96, 8, 0, 7); g.fill();
  g.fillStyle = "#3a3a44"; g.fillRect(24, 30, 80, 8);
});
const chromeHistT = tex("chromeh", 768, 480, (g) => {
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 768, 480);
  g.fillStyle = "#f1f3f4"; g.fillRect(0, 0, 768, 64);
  g.fillStyle = "#ea4335"; g.beginPath(); g.arc(52, 32, 18, 0, 7); g.fill();
  g.fillStyle = "#fbbc05"; g.beginPath(); g.arc(40, 24, 10, 0, 7); g.fill();
  T(g, "History", 100, 32, 30, "#202124", "left", 700);
  T(g, "3:04 AM   why is the sky blue", 40, 120, 28, "#3c4043", "left", 600);
  T(g, "3:11 AM   how do satellites work", 40, 168, 28, "#3c4043", "left", 600);
  T(g, "3:15 AM   cheapest flights", 40, 216, 28, "#3c4043", "left", 600);
  T(g, "3:40 AM   is google finished", 40, 264, 28, "#d93025", "left", 600);
  T(g, "7:21 AM   weather today", 40, 312, 28, "#3c4043", "left", 600);
  g.strokeStyle = "#e0e0e0"; g.lineWidth = 2;
  for (const y of [96, 144, 192, 240, 288, 336]) { g.beginPath(); g.moveTo(24, y); g.lineTo(744, y); g.stroke(); }
  g.fillStyle = "#e8eaed"; g.fillRect(24, 360, 720, 96);
});
const ytWatchT = tex("ytw", 768, 480, (g) => {
  g.fillStyle = "#0f0f0f"; g.fillRect(0, 0, 768, 480);
  g.fillStyle = "#1c1c22"; g.fillRect(24, 24, 720, 270);
  g.fillStyle = "#ff0033"; rrPath(g, 330, 130, 108, 66, 18); g.fill();
  g.fillStyle = "#fff"; g.beginPath(); g.moveTo(364, 144); g.lineTo(364, 182); g.lineTo(404, 163); g.closePath(); g.fill();
  T(g, "Recommended for you", 40, 330, 26, "#f1f1f1", "left", 700);
  for (let i = 0; i < 3; i++) {
    g.fillStyle = "#282830"; g.fillRect(40 + i * 240, 356, 200, 110);
    g.fillStyle = "#ff3838"; rrPath(g, 100 + i * 240, 470, 80, 26, 8); g.fill();
  }
});
const mapT = tex("map", 1024, 1024, (g, r) => {
  g.fillStyle = "#dcd6c8"; g.fillRect(0, 0, 1024, 1024);
  g.fillStyle = "#ece8dc";
  for (let gx = 0; gx < 8; gx++) for (let gy = 0; gy < 8; gy++) if (r() < 0.8) g.fillRect(30 + gx * 124, 30 + gy * 124, 100, 100);
  g.fillStyle = "#7fbf8f"; g.fillRect(560, 560, 330, 330);
  g.fillStyle = "#f7f5ee";
  g.fillRect(0, 496, 1024, 32); g.fillRect(496, 0, 32, 1024);
  g.fillRect(236, 0, 20, 1024); g.fillRect(0, 236, 1024, 20); g.fillRect(756, 0, 20, 1024);
  g.strokeStyle = "#f0b33c"; g.lineWidth = 16; g.beginPath(); g.moveTo(0, 620); g.lineTo(1024, 620); g.stroke();
  g.fillStyle = "#c4c8d2";
  for (let i = 0; i < 24; i++) { g.beginPath(); g.ellipse(r() * 1024, r() * 1024, 40, 24, 0, 0, 7); g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1; }
});
const googleT = tex("glogo", 768, 224, (g) => {
  g.fillStyle = "rgba(255,255,255,0.94)"; rrPath(g, 8, 8, 752, 208, 30); g.fill();
  const cols = ["#4285f4", "#ea4335", "#fbbc05", "#4285f4", "#34a853", "#ea4335"];
  let x = 120; const word = "Google", W = [58, 52, 30, 30, 52, 46];
  g.font = "900 118px Arial, sans-serif"; g.textBaseline = "middle"; g.textAlign = "left";
  for (let i = 0; i < word.length; i++) { g.fillStyle = cols[i]; g.fillText(word[i], x, 112); x += W[i] + 8; }
});
const argonT = tex("argon", 1024, 320, (g) => {
  g.fillStyle = "rgba(14,10,32,0.85)"; rrPath(g, 6, 6, 1012, 308, 40); g.fill();
  g.strokeStyle = "#b8a8ff"; g.lineWidth = 6; rrPath(g, 6, 6, 1012, 308, 40); g.stroke();
  T(g, "GEMINI", 512, 120, 118, "#e8e2ff");
  T(g, "A R G O N", 512, 240, 76, "#a48cff");
});
const cal2018T = tex("cal18", 512, 512, (g) => {
  g.fillStyle = "#fafaf6"; g.fillRect(0, 0, 512, 512);
  g.fillStyle = "#e8e4da"; g.fillRect(0, 0, 512, 120);
  T(g, "2018", 256, 62, 84, "#33323a");
  T(g, "MAY", 256, 172, 40, "#8a877e", "center", 700);
  g.fillStyle = "#3a3a42";
  for (let r2 = 0; r2 < 5; r2++) for (let c = 0; c < 7; c++) g.fillRect(56 + c * 60, 220 + r2 * 52, 6, 6);
  g.strokeStyle = "#c9c4b8"; g.lineWidth = 4; g.strokeRect(20, 20, 472, 472);
});
const cal2015T = tex("cal15", 512, 512, (g) => {
  g.fillStyle = "#fafaf6"; g.fillRect(0, 0, 512, 512);
  g.fillStyle = "#e8e4da"; g.fillRect(0, 0, 512, 120);
  T(g, "2015", 256, 62, 84, "#33323a");
  T(g, "APRIL 14", 256, 180, 44, "#c0392b");
  T(g, "TUESDAY", 256, 236, 30, "#8a877e", "center", 700);
  g.fillStyle = "#3a3a42";
  for (let r2 = 0; r2 < 5; r2++) for (let c = 0; c < 7; c++) g.fillRect(56 + c * 60, 280 + r2 * 40, 6, 6);
  g.strokeStyle = "#c9c4b8"; g.lineWidth = 4; g.strokeRect(20, 20, 472, 472);
});
const checkT = tex("check", 256, 96, (g) => {
  g.fillStyle = "#16161c"; g.fillRect(0, 0, 256, 96);
  g.fillStyle = "#f2f2f4";
  for (let cx = 0; cx < 8; cx++) for (let cy = 0; cy < 3; cy++) if ((cx + cy) % 2 === 0) g.fillRect(cx * 32, cy * 32, 32, 32);
});
const sparkT = tex("spark", 256, 256, (g) => {
  g.fillStyle = "#e9eaff";
  g.beginPath(); g.moveTo(128, 18); g.quadraticCurveTo(142, 114, 238, 128); g.quadraticCurveTo(142, 142, 128, 238);
  g.quadraticCurveTo(114, 142, 18, 128); g.quadraticCurveTo(114, 114, 128, 18); g.fill();
});
// additive glow sprite (replaces the postprocessing BloomEffect, which renders white under headless SwiftShader)
const glowT = tex("glow", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, "rgba(255,255,255,0.9)");
  gr.addColorStop(0.35, "rgba(255,255,255,0.45)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
/** additive halo sprite; `s` = brightness (colour multiplier, linear) */
const gln = (parent: THREE.Object3D, x: number, y: number, z: number, r: number, c: [number, number, number], s: number) => {
  const m = new THREE.SpriteMaterial({ map: glowT, color: HDR(c[0] * s, c[1] * s, c[2] * s), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true });
  const sp = new THREE.Sprite(m);
  sp.position.set(x, y, z); sp.scale.set(r * 2, r * 2, 1);
  sp.castShadow = false; sp.receiveShadow = false; sp.frustumCulled = false;
  parent.add(sp);
  return sp;
};
const coneT = tex("cone", 128, 256, (g) => {
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "rgba(255,244,214,0.5)"); gr.addColorStop(1, "rgba(255,244,214,0.03)");
  g.fillStyle = gr; g.beginPath(); g.moveTo(60, 4); g.lineTo(68, 4); g.lineTo(126, 252); g.lineTo(2, 252); g.closePath(); g.fill();
});
const thumbT = tex("thumb", 128, 96, (g, r) => {
  const cols = ["#3a6ab3", "#b34a3a", "#3a9a5a", "#c9a23a", "#8a5ab3"];
  g.fillStyle = cols[(r() * 5) | 0]; g.fillRect(0, 0, 128, 96);
  g.fillStyle = "rgba(255,255,255,0.4)"; g.fillRect(14, 14, 50, 34);
  g.fillStyle = "#ff3838"; g.beginPath(); g.arc(64, 48, 15, 0, 7); g.fill();
});
const asphaltT = tex("asph", 512, 512, (g, r) => {
  g.fillStyle = "#3c3f45"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? "#45484e" : "#34373d"; g.fillRect(r() * 512, r() * 512, 3 + r() * 4, 2 + r() * 3); }
});
const plazaT = cobbleHD();
const lawnT = grassHD();
const woodT = planksHD();
const marbleT = tex("marble", 512, 512, (g, r) => {
  g.fillStyle = "#d9d5cc"; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "rgba(120,116,108,0.5)"; g.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    g.beginPath(); let x = r() * 512, y = r() * 512; g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 160; y += (r() - 0.5) * 160; g.lineTo(x, y); }
    g.stroke();
  }
});
const carpetT = tex("carpet", 512, 512, (g, r) => {
  g.fillStyle = "#a02c30"; g.fillRect(0, 0, 512, 512);
  g.fillStyle = "#b83a3e"; for (let i = 0; i < 300; i++) g.fillRect(r() * 512, r() * 512, 5, 5);
  g.fillStyle = "#d8b04a"; g.fillRect(0, 18, 512, 10); g.fillRect(0, 484, 512, 10);
});
const metalT = tex("metal", 512, 512, (g, r) => {
  g.fillStyle = "#191922"; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "#26263a"; g.lineWidth = 3;
  for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 512); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(512, i * 64); g.stroke(); }
  for (let i = 0; i < 60; i++) { g.fillStyle = "rgba(255,255,255,0.03)"; g.fillRect(r() * 512, r() * 512, 30, 4); }
});
// ---------------- materials (shared) ----------------
const M: Record<string, THREE.Material> = {
  stone: lam("stW", () => ({ map: stoneHD("stW", ["#cfc4b2", "#c4b8a5", "#d8cdbb", "#bab0a0"], "#948a78") })),
  stoneD: lam("stD", () => ({ map: stoneHD("stD", ["#8a8478", "#7e786c", "#948e82", "#6f695e"], "#4e4a42") })),
  white: lam("white", () => ({ color: "#f1f2f4" })),
  cream: lam("cream", () => ({ color: "#e7e2d8" })),
  wood: lam("wood", () => ({ map: woodT })),
  woodD: lam("woodD", () => ({ color: "#4a2e1a" })),
  woodL: lam("woodL", () => ({ color: "#8a5a34" })),
  asphalt: lam("asph", () => ({ map: asphaltT })),
  plaza: lam("plaza", () => ({ map: plazaT })),
  grass: lam("lawn", () => ({ map: lawnT })),
  marble: lam("marb", () => ({ map: marbleT })),
  carpet: lam("carp", () => ({ map: carpetT })),
  metal: lam("metal", () => ({ map: metalT })),
  dark: lam("dark", () => ({ color: "#26262e" })),
  rackDark: lam("rackD", () => ({ color: "#15151d" })),
  silver: twoTone(new THREE.MeshPhongMaterial({ color: "#b8bcc4", specular: "#e8e8ee", shininess: 60 }), 0.15),
  gold: twoTone(new THREE.MeshPhongMaterial({ color: "#d8a53c", specular: "#ffe9b0", shininess: 70 }), 0.15),
  goldD: twoTone(new THREE.MeshPhongMaterial({ color: "#a87824", specular: "#ffd888", shininess: 50 }), 0.15),
  red: lam("red", () => ({ color: "#c0392b" })),
  glass: new THREE.MeshBasicMaterial({ color: "#bcd8f0", transparent: true, opacity: 0.16, depthWrite: false }),
};
const UN = (map: THREE.Texture | null, boost = 1, opacity = 1) => {
  const m = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide });
  if (boost !== 1) m.color = HDR(boost, boost, boost);
  if (opacity !== 1) { m.transparent = true; m.opacity = opacity; }
  return m;
};
const NEON = (c: [number, number, number]) => new THREE.MeshBasicMaterial({ color: HDR(...c) });
// unlit sign faces (readability trap: side-lit sign faces go grey-blue — keep them unlit)
const SIGN: Record<string, THREE.MeshBasicMaterial> = {
  news: UN(newsT), xpost: UN(xpostT), board: UN(boardT), nvidia: UN(nvidiaT), die: UN(chipDieT, 1.15),
  tpu: UN(tpuCardT), rack: UN(rackT), play: UN(ytPlayT), shelves: UN(shelfRowsT), sky: UN(skyOpenT, 1.3),
  gmail: UN(gmailT), earth: UN(earthT), andr: UN(androidScreenT), iph: UN(iphoneScreenT),
  chromeh: UN(chromeHistT), ytw: UN(ytWatchT, 1.05), map: UN(mapT), glogo: UN(googleT), argon: UN(argonT, 1.1),
  cal18: UN(cal2018T), cal15: UN(cal2015T), check: UN(checkT), spark: UN(sparkT, 1.25), cone: UN(coneT),
  thumb: UN(thumbT), puddle: new THREE.MeshBasicMaterial({ map: puddleT, transparent: true, depthWrite: false }),
  city: UN(cityT, 1.1), rain: new THREE.MeshBasicMaterial({ map: rainT, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
};
// ---------------- service icon cards (Fx) ----------------
type Svc = { name: string; sub: string; draw: (g: G, S: number) => void };
const SERVICES: Svc[] = [
  { name: "Photos", sub: "faces & places", draw: (g, S) => {
      const c = ["#fbbc05", "#ea4335", "#4285f4", "#34a853"];
      for (let i = 0; i < 4; i++) { g.fillStyle = c[i]; g.save(); g.translate(S / 2, S / 2 - 20); g.rotate((i * Math.PI) / 2); g.beginPath(); g.ellipse(0, -34, 24, 46, 0, 0, 7); g.fill(); g.restore(); }
    } },
  { name: "Maps", sub: "everywhere you go", draw: (g, S) => {
      g.fillStyle = "#ea4335"; g.beginPath(); g.arc(S / 2, S / 2 - 46, 42, 0, 7); g.fill();
      g.beginPath(); g.moveTo(S / 2 - 22, S / 2 - 24); g.lineTo(S / 2, S / 2 + 36); g.lineTo(S / 2 + 22, S / 2 - 24); g.closePath(); g.fill();
      g.fillStyle = "#fff"; g.beginPath(); g.arc(S / 2, S / 2 - 46, 16, 0, 7); g.fill();
    } },
  { name: "Chrome", sub: "3 AM searches", draw: (g, S) => {
      g.fillStyle = "#4285f4"; g.beginPath(); g.arc(S / 2, S / 2 - 34, 52, 0, 7); g.fill();
      g.fillStyle = "#fff"; g.beginPath(); g.arc(S / 2, S / 2 - 34, 20, 0, 7); g.fill();
      g.fillStyle = "#ea4335"; g.beginPath(); g.moveTo(S / 2 - 50, S / 2 - 40); g.lineTo(S / 2 + 12, S / 2 - 96); g.lineTo(S / 2 + 44, S / 2 - 40); g.closePath(); g.fill();
      g.fillStyle = "#34a853"; g.beginPath(); g.moveTo(S / 2 - 50, S / 2 - 28); g.lineTo(S / 2 - 16, S / 2 + 22); g.lineTo(S / 2 - 50, S / 2 + 18); g.closePath(); g.fill();
    } },
  { name: "Music", sub: "every song", draw: (g, S) => {
      g.fillStyle = "#ff0033"; g.beginPath(); g.ellipse(S / 2 - 16, S / 2 - 6, 26, 20, -0.3, 0, 7); g.fill();
      g.fillRect(S / 2 + 4, S / 2 - 92, 10, 90);
      g.beginPath(); g.ellipse(S / 2 + 22, S / 2 - 4, 24, 18, -0.3, 0, 7); g.fill();
      g.fillRect(S / 2 + 22, S / 2 - 96, 10, 94);
    } },
  { name: "Contacts", sub: "who they talk to", draw: (g, S) => {
      g.fillStyle = "#4285f4"; g.beginPath(); g.arc(S / 2 - 18, S / 2 - 58, 24, 0, 7); g.fill();
      g.beginPath(); g.ellipse(S / 2 - 18, S / 2 + 6, 34, 26, 0, Math.PI, 0); g.fill();
      g.fillStyle = "#a8c7fa"; g.beginPath(); g.arc(S / 2 + 26, S / 2 - 52, 18, 0, 7); g.fill();
      g.beginPath(); g.ellipse(S / 2 + 26, S / 2 + 4, 26, 20, 0, Math.PI, 0); g.fill();
    } },
  { name: "Meet", sub: "who they meet", draw: (g, S) => {
      g.fillStyle = "#00832d"; rrPath(g, S / 2 - 52, S / 2 - 74, 76, 72, 12); g.fill();
      g.fillStyle = "#ea4335"; g.beginPath(); g.moveTo(S / 2 + 24, S / 2 - 52); g.lineTo(S / 2 + 54, S / 2 - 72); g.lineTo(S / 2 + 54, S / 2 + 6); g.lineTo(S / 2 + 24, S / 2 - 14); g.closePath(); g.fill();
    } },
  { name: "Drive", sub: "what they store", draw: (g, S) => {
      g.fillStyle = "#fbbc05"; g.beginPath(); g.moveTo(S / 2 - 50, S / 2 + 20); g.lineTo(S / 2 - 10, S / 2 - 78); g.lineTo(S / 2 + 30, S / 2 - 78); g.lineTo(S / 2 - 10, S / 2 + 20); g.closePath(); g.fill();
      g.fillStyle = "#34a853"; g.beginPath(); g.moveTo(S / 2 - 50, S / 2 + 20); g.lineTo(S / 2 + 30, S / 2 + 20); g.lineTo(S / 2 + 50, S / 2 - 14); g.lineTo(S / 2 - 30, S / 2 - 14); g.closePath(); g.fill();
      g.fillStyle = "#4285f4"; g.beginPath(); g.moveTo(S / 2 + 50, S / 2 - 14); g.lineTo(S / 2 + 30, S / 2 - 78); g.lineTo(S / 2 + 10, S / 2 - 78); g.lineTo(S / 2 + 30, S / 2 - 14); g.closePath(); g.fill();
    } },
  { name: "Keep", sub: "what they note", draw: (g, S) => {
      g.fillStyle = "#fbbc05"; rrPath(g, S / 2 - 44, S / 2 - 80, 88, 104, 10); g.fill();
      g.fillStyle = "#fff"; g.beginPath(); g.arc(S / 2, S / 2 - 36, 22, 0, 7); g.fill();
      g.fillStyle = "#fbbc05"; g.fillRect(S / 2 - 12, S / 2 + 24, 24, 14);
      g.strokeStyle = "#fbbc05"; g.lineWidth = 8; g.beginPath(); g.moveTo(S / 2, S / 2 - 60); g.lineTo(S / 2, S / 2 - 40); g.stroke();
    } },
  { name: "Sheets", sub: "their numbers", draw: (g, S) => {
      g.fillStyle = "#0f9d58"; rrPath(g, S / 2 - 46, S / 2 - 76, 92, 112, 8); g.fill();
      g.fillStyle = "#fff"; g.fillRect(S / 2 - 28, S / 2 - 52, 56, 64);
      g.strokeStyle = "#0f9d58"; g.lineWidth = 4;
      for (let i = 0; i <= 3; i++) { g.beginPath(); g.moveTo(S / 2 - 28, S / 2 - 52 + i * 16); g.lineTo(S / 2 + 28, S / 2 - 52 + i * 16); g.stroke(); }
      for (let i = 0; i <= 3; i++) { g.beginPath(); g.moveTo(S / 2 - 28 + i * 19, S / 2 - 52); g.lineTo(S / 2 - 28 + i * 19, S / 2 + 12); g.stroke(); }
    } },
  { name: "Fitbit", sub: "their health", draw: (g, S) => {
      const c = "#00b0b9";
      g.fillStyle = c; g.beginPath(); g.arc(S / 2, S / 2 - 34, 12, 0, 7); g.fill();
      g.fillRect(S / 2 - 8, S / 2 - 76, 16, 30); g.fillRect(S / 2 - 8, S / 2 - 4, 16, 56);
      g.fillRect(S / 2 - 44, S / 2 - 42, 30, 16); g.fillRect(S / 2 + 14, S / 2 - 42, 30, 16);
      g.fillRect(S / 2 - 30, S / 2 - 62, 16, 56); g.fillRect(S / 2 + 14, S / 2 - 62, 16, 56);
    } },
  { name: "Passwords", sub: "every key", draw: (g, S) => {
      g.strokeStyle = "#4285f4"; g.lineWidth = 16; g.lineCap = "round";
      g.beginPath(); g.arc(S / 2 - 22, S / 2 - 52, 26, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(S / 2 - 2, S / 2 - 34); g.lineTo(S / 2 + 40, S / 2 + 14); g.stroke();
      g.beginPath(); g.moveTo(S / 2 + 24, S / 2 + 2); g.lineTo(S / 2 + 40, S / 2 - 12); g.stroke();
      g.fillStyle = "#4285f4"; g.beginPath(); g.arc(S / 2 + 20, S / 2 + 26, 6, 0, 7); g.fill();
      g.fillStyle = "#5f6368";
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(S / 2 - 40 + i * 26, S / 2 + 52, 7, 0, 7); g.fill(); }
    } },
];
const svcCard = (s: Svc) => (p: Pen) => {
  const g = p.g;
  g.fillStyle = "#f7f7fa"; rrPath(g, 10, 10, 246, 246, 40); g.fill();
  g.strokeStyle = "#2b2430"; g.lineWidth = 7; rrPath(g, 10, 10, 246, 246, 40); g.stroke();
  s.draw(g, 256);
  T(g, s.name, 128, 288, 30, "#1c1a22");
  T(g, s.sub, 128, 318, 19, "#6a6572", "center", 700);
};
// ---------------- set builders ----------------
type SB = { g: THREE.Group; b: Batch; dyn: Record<string, THREE.Object3D> };
const bx = (s: SB, mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tile = 0) =>
  s.b.add(boxGeo(V(x0, y0, z0), V(x1, y1, z1), tile), mat);
const fq = (s: SB, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, y = 0, u = 1, v = 1) =>
  s.b.add(quad(V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0), u, v), mat);
const qm = (s: SB, mat: THREE.Material, ...pts: [number, number, number][]) =>
  s.b.add(quad(V(...pts[0]), V(...pts[1]), V(...pts[2]), V(...pts[3]), 1, 1), mat);
const cy = (s: SB, mat: THREE.Material, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 14, m?: THREE.Matrix4) => {
  const geo = new THREE.CylinderGeometry(r0, r1, h, seg);
  geo.translate(0, h / 2, 0);
  s.b.add(geo, mat, m ?? new THREE.Matrix4().makeTranslation(x, y, z));
};
const sp = (s: SB, mat: THREE.Material, x: number, y: number, z: number, r: number, seg = 18) =>
  s.b.add(new THREE.SphereGeometry(r, seg, seg), mat, new THREE.Matrix4().makeTranslation(x, y, z));
const beamMesh = (a: THREE.Vector3, b: THREE.Vector3, mat: THREE.Material, w = 0.022) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, a.distanceTo(b), w), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
};
const stars = (g: THREE.Group, n = 70, rMin = 40, rMax = 110) => {
  const p: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * 0.42, d = rMin + Math.random() * (rMax - rMin);
    p.push(Math.cos(a) * Math.cos(e) * d, Math.sin(e) * d * 0.7 + 6, Math.sin(a) * Math.cos(e) * d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#cfd8ff", size: 3, sizeAttenuation: false, transparent: true, opacity: 0.85 }));
  pts.layers.set(NOINK); pts.frustumCulled = false;
  g.add(pts);
};
const truckMk = (cab: string, boxC: string) => {
  const g = new THREE.Group();
  const mm = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
  };
  mm(new THREE.BoxGeometry(2.0, 2.1, 2.3), lam("cab" + cab, () => ({ color: cab })), 2.1, 1.45, 0);
  mm(new THREE.BoxGeometry(1.6, 0.8, 2.1), M.dark, 2.2, 2.0, 0);
  mm(new THREE.BoxGeometry(4.6, 2.7, 2.5), lam("bx" + boxC, () => ({ color: boxC })), -1.1, 1.65, 0);
  const wg = new THREE.CylinderGeometry(0.5, 0.5, 0.42, 12);
  wg.rotateZ(Math.PI / 2);
  for (const [x, z] of [[2.2, 1.02], [2.2, -1.02], [-0.6, 1.02], [-0.6, -1.02], [-2.6, 1.02], [-2.6, -1.02]] as [number, number][]) mm(wg, M.dark, x, 0.5, z);
  return g;
};
const carMk = (col: string) => {
  const g = new THREE.Group();
  const mm = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
  };
  mm(new THREE.BoxGeometry(2.6, 0.55, 1.3), lam("cb" + col, () => ({ color: col })), 0, 0.45, 0);
  mm(new THREE.BoxGeometry(1.4, 0.5, 1.15), lam("ct" + col, () => ({ color: "#2a2c34" })), -0.1, 0.95, 0);
  const wg = new THREE.CylinderGeometry(0.3, 0.3, 0.24, 10);
  wg.rotateZ(Math.PI / 2);
  for (const [x, z] of [[0.9, 0.56], [0.9, -0.56], [-0.9, 0.56], [-0.9, -0.56]] as [number, number][]) mm(wg, M.dark, x, 0.3, z);
  return g;
};
const treeMk = (s: SB, x: number, z: number, h = 3.4, r = 1.3) => {
  cy(s, M.woodD, x, 0, z, 0.12, 0.2, h * 0.52, 8);
  sp(s, M.leaf, x, h * 0.6, z, r, 10);
  sp(s, M.leaf, x, h * 0.88, z, r * 0.68, 10);
};
const sign500T = tex("sign500", 768, 288, (g) => {
  g.fillStyle = "#f6f2e6"; rrPath(g, 8, 8, 760, 280, 28); g.fill();
  g.strokeStyle = "#b8342a"; g.lineWidth = 10; rrPath(g, 16, 16, 752, 264, 22); g.stroke();
  T(g, "500 HOURS / MINUTE", 384, 96, 62, "#20242c");
  T(g, "UPLOADED TO YOUTUBE", 384, 200, 34, "#8a3a30", "center", 700);
});
const buildCampus = (s: SB) => {
  fq(s, M.plaza, -17, -19, 17, 13, 0, 7, 7);
  // main hall + tower
  bx(s, M.stone, -15, 0, 3, 15, 11.5, 13);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++)
    qm(s, M.win, [-13 + c * 3.6, 2.2 + r * 3.1, 2.94], [-13 + c * 3.6 + 2.2, 2.2 + r * 3.1, 2.94], [-13 + c * 3.6 + 2.2, 2.2 + r * 3.1 + 1.9, 2.94], [-13 + c * 3.6, 2.2 + r * 3.1 + 1.9, 2.94]);
  bx(s, M.stoneD, -10.5, 0, 5, -8.3, 17.5, 8);
  qm(s, SIGN.clock, [-10.2, 13.4, 4.94], [-8.6, 13.4, 4.94], [-8.6, 15.0, 4.94], [-10.2, 15.0, 4.94]);
  bx(s, M.stoneD, -10.9, 17.5, 4.6, -7.9, 19.3, 7.4);
  treeMk(s, 13.5, -6, 4.2, 1.5); treeMk(s, -15, -4, 3.6, 1.3); treeMk(s, 9, 9, 3.0, 1.1);
  for (const [x, z] of [[-4, -11], [6, -13]] as [number, number][]) {
    cy(s, M.dark, x, 0, z, 0.07, 0.1, 3.6, 8);
    sp(s, NEON([1.9, 1.7, 1.2]), x, 3.7, z, 0.14, 10);
    gln(s.g, x, 3.7, z, 0.7, [1.9, 1.7, 1.2], 0.8);
  }
  for (const [x, z, w] of [[-6, -6, 1.6], [3.5, -3, 2.2], [8, -9, 1.3]] as [number, number, number][])
    s.b.add(quad(V(x - w, 0.012, z - w * 0.6), V(x + w, 0.012, z - w * 0.6), V(x + w, 0.012, z + w * 0.6), V(x - w, 0.012, z + w * 0.6)), SIGN.puddle);
};
const buildElon = (s: SB) => {
  fq(s, M.wood, -6.5, -9, 6.5, 2.5, 0, 3, 3);
  bx(s, M.cream, -6.5, 0, 0, -2.2, 3.5, 0.35);
  bx(s, M.cream, 2.2, 0, 0, 6.5, 3.5, 0.35);
  bx(s, M.cream, -2.2, 2.3, 0, 2.2, 3.5, 0.35);
  bx(s, M.cream, -2.2, 0, 0, 2.2, 0.4, 0.35);
  qm(s, UN(cityT, 1.55), [-2.2, 0.45, 0.16], [2.2, 0.45, 0.16], [2.2, 2.65, 0.16], [-2.2, 2.65, 0.16]);
  gln(s.g, 0, 1.55, 0.05, 1.9, [0.5, 0.6, 1.1], 0.4);
  bx(s, M.woodD, 2.6, 0, -1.6, 4.6, 0.78, 0.1);
  cy(s, M.dark, 3.9, 0.78, -0.9, 0.05, 0.07, 0.5, 8);
  sp(s, NEON([2.0, 1.6, 0.9]), 3.9, 1.32, -0.9, 0.11, 10);
  bx(s, M.woodD, -6.2, 0, -2.4, -5.7, 2.3, -0.9);
  const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.3), NEON([0.9, 1.05, 1.7]));
  ph.position.set(0.34, 1.33, -4.6); ph.castShadow = false; s.g.add(ph);
  gln(s.g, 0.34, 1.33, -4.6, 0.32, [0.9, 1.05, 1.7], 0.7);
};
const buildXpost = (s: SB) => {
  fq(s, M.dark, -40, -34, 40, 30, 0, 1, 1);
  qm(s, SIGN.city, [-32, 0, 14], [32, 0, 14], [32, 13, 14], [-32, 13, 14]);
  for (let i = 0; i < 9; i++) {
    const x = -24 + i * 6, h = 3 + ((i * 7919) % 9);
    bx(s, M.dark, x, 0, 4 + (i % 3) * 2.4, x + 4.4, h, 6 + (i % 3) * 2.4);
  }
  const g = new THREE.Group();
  g.position.set(0, 3.7, 0);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.05), SIGN.xpost);
  card.castShadow = false;
  g.add(card);
  gln(g, 0, 0, 0.2, 2.4, [0.55, 0.65, 1.0], 0.5);
  s.g.add(g);
  s.dyn.xpost = g;
};
const buildOffice = (s: SB) => {
  fq(s, M.wood, -6.5, -8, 6.5, 3.5, 0, 3, 3);
  bx(s, M.white, -6.5, 0, 0, 6.5, 3.4, 0.35);
  qm(s, SIGN.board, [-5.35, 3.3, 0.38], [5.35, 3.3, 0.38], [5.35, 0.75, 0.38], [-5.35, 0.75, 0.38]);
  bx(s, M.silver, -2.5, 0.82, -0.02, -1.3, 0.92, 0.22);
  for (const [x, c] of [[-2.3, "#d04a2f"], [-2.0, "#2f6fd0"], [-1.7, "#2f9d54"]] as [number, string][])
    s.b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), lam("pen" + c, () => ({ color: c })), new THREE.Matrix4().makeTranslation(x, 0.97, 0.1));
  bx(s, M.woodL, -0.9, 0, 0.0, 1.1, 0.75, 0.9);
  cy(s, M.white, 0.1, 0.75, 0.3, 0.09, 0.11, 0.18, 12);
  const chip = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.045, 0.17), M.gold);
  chip.position.set(0.1, 0.98, 0.3); s.g.add(chip);
  gln(s.g, 0.1, 0.98, 0.3, 0.45, [2.2, 1.8, 1.0], 0.7);
  cy(s, M.red, 3.9, 0, -1.0, 0.16, 0.13, 0.3, 10);
  sp(s, M.leaf, 3.9, 0.62, -1.0, 0.3, 10); sp(s, M.leaf, 3.65, 0.85, -1.0, 0.2, 10);
  // wall detail: two posters + shelf strip (adds edges/bright patches for the board setup)
  for (const [px, col] of [[-3.6, "#3a6ab3"], [3.6, "#b34a3a"]] as [number, string][]) {
    bx(s, lam("pos" + col, () => ({ color: col })), px - 0.35, 2.1, 0.38, px + 0.35, 2.8, 0.44);
    bx(s, M.white, px - 0.32, 2.13, 0.4, px + 0.32, 2.77, 0.42);
  }
  bx(s, M.woodL, -4.4, 2.05, 0.38, 4.4, 2.2, 0.46);
  for (let i = 0; i < 9; i++) {
    const x = -4.0 + i * 0.95;
    bx(s, lam("bk" + i, () => ({ color: ["#b34a3a", "#3a9a5a", "#c9a23a", "#8a5ab3"][i % 4] })), x - 0.32, 2.2, 0.4, x + 0.32, 2.9, 0.46);
  }
};
const buildNvidia = (s: SB) => {
  fq(s, M.asphalt, -15, -11, 15, 8, 0, 6, 6);
  bx(s, M.rackDark, -15, 0, -8, -14.2, 7, 8);
  bx(s, M.rackDark, 14.2, 0, -8, 15, 7, 8);
  bx(s, M.rackDark, -15, 0, 6.2, 15, 7, 7);
  bx(s, M.rackDark, -15, 7, -8, 15, 7.7, 7);
  for (const x of [-9.5, -4.5, 4.5, 9.5]) {
    bx(s, M.rackDark, x - 1.1, 0, -2.4, x + 1.1, 3.3, 4.6);
    qm(s, SIGN.rack, [x - 1.0, 0.15, -2.46], [x + 1.0, 0.15, -2.46], [x + 1.0, 3.15, -2.46], [x - 1.0, 3.15, -2.46]);
    bx(s, NEON([1.4, 2.6, 0.5]), x - 0.95, 2.55, -2.5, x + 0.95, 2.67, -2.42);
    gln(s.g, x, 2.61, -2.46, 1.2, [1.4, 2.6, 0.5], 0.8);
  }
  qm(s, SIGN.nvidia, [-4.2, 4.4, 6.1], [4.2, 4.4, 6.1], [4.2, 5.8, 6.1], [-4.2, 5.8, 6.1]);
  gln(s.g, 0, 5.1, 6.05, 1.5, [0.5, 1.1, 0.25], 0.55);
  // tall green light bars flanking the stage (always in view); no additive glow (it blows the bar to white)
  for (const x of [-1.4, 1.4]) {
    bx(s, NEON([0.25, 1.7, 0.12]), x - 0.2, 0, -1.4, x + 0.2, 4.8, -1.1);
  }

  for (let i = 0; i < 4; i++) {
    bx(s, i % 2 ? M.dark : M.greenD, -13.2 + (i % 2) * 1.3, (i >> 1) * 0.55, -6.8, -11.9 + (i % 2) * 1.3, 0.5 + (i >> 1) * 0.55, -5.5);
  }
  const t = truckMk("#e8e8ea", "#f0f0f2");
  t.position.set(-11, 0, -12.5); s.g.add(t); s.dyn.nvtruck = t;
};
const buildGate = (s: SB) => {
  fq(s, M.grass, -30, -20, 30, 20, 0, 8, 8);
  fq(s, M.asphalt, -30, -2.6, 30, 2.6, 0.02, 10, 1);
  bx(s, M.stoneD, -6.6, 0, -0.9, -5.4, 4.2, 0.9);
  bx(s, M.stoneD, 5.4, 0, -0.9, 6.6, 4.2, 0.9);
  qm(s, SIGN.glogo, [-2.7, 4.4, 0], [2.7, 4.4, 0], [2.7, 5.85, 0], [-2.7, 5.85, 0]);
  gln(s.g, 0, 5.12, -0.2, 1.7, [1.0, 1.15, 1.5], 0.4);
  bx(s, M.leaf, -30, 0, 1.4, 30, 2.3, 2.2);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.09, 0.09), lam("barrier", () => ({ color: "#e8e8e8" })));
  bar.position.set(-3.4, 2.9, -0.2); bar.rotation.z = -0.55; s.g.add(bar);
  treeMk(s, -12, -8, 3.6, 1.4); treeMk(s, 11, -9, 4.0, 1.5); treeMk(s, 18, -5, 3.2, 1.2);
  const t1 = truckMk("#e8e8ea", "#f2f2f4"), t2 = truckMk("#e8e8ea", "#f2f2f4");
  s.g.add(t1, t2); s.dyn.gt1 = t1; s.dyn.gt2 = t2;
};
const buildTpuStage = (s: SB) => {
  fq(s, M.metal, -11, -9, 11, 7, 0, 5, 4);
  bx(s, M.dark, -11, 0, 5.4, 11, 6.8, 6);
  qm(s, SIGN.die, [-3.4, 1.7, 5.3], [3.4, 1.7, 5.3], [3.4, 5.3, 5.3], [-3.4, 5.3, 5.3]);
  cy(s, M.white, 0, 0, 0, 0.52, 0.62, 0.95, 16);
  const chip = new THREE.Group(); chip.position.set(0, 1.0, 0);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.07, 0.58), M.gold);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.4), M.goldD);
  top.position.y = 0.06; chip.add(slab, top); chip.castShadow = false;
  gln(chip, 0, 0.1, 0, 0.8, [2.2, 1.8, 1.0], 0.8);
  s.g.add(chip); s.dyn.chip = chip;
  const card = new THREE.Group(); card.position.set(0, 3.6, 1.6);
  card.add(new THREE.Mesh(new THREE.PlaneGeometry(3.5, 1.4), SIGN.tpu));
  card.visible = false; s.g.add(card); s.dyn.tpucard = card;
  for (const x of [-3.2, 3.2]) { cy(s, M.dark, x, 0, 2.5, 0.12, 0.16, 5.6, 8); sp(s, NEON([1.8, 1.6, 1.1]), x, 5.7, 2.5, 0.16, 10); gln(s.g, x, 5.7, 2.5, 0.7, [1.8, 1.6, 1.1], 0.75); }
};
// extra shared materials/textures used above and below
const clockT = tex("clock", 256, 256, (g) => {
  g.fillStyle = "#f4f1e6"; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill();
  g.strokeStyle = "#33323a"; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.stroke();
  g.strokeStyle = "#33323a"; g.lineWidth = 9; g.lineCap = "round";
  g.beginPath(); g.moveTo(128, 128); g.lineTo(128, 48); g.moveTo(128, 128); g.lineTo(182, 148); g.stroke();
});
SIGN.clock = UN(clockT);
M.win = lam("winD", () => ({ color: "#2a3648" }));
M.leaf = lam("leaf", () => ({ color: "#4a9142" }));
M.greenD = lam("grnD", () => ({ color: "#2f5c30" }));
M.rug = lam("rug", () => ({ color: "#9a948c" }));
M.couch = lam("couch", () => ({ color: "#b0a89c" }));
M.wallN = lam("wallN", () => ({ color: "#6e6a72" }));

const SERV_POS: THREE.Vector3[] = SERVICES.map((_, i) => {
  const a = (i / SERVICES.length) * Math.PI * 2 + Math.PI / 2;
  return new THREE.Vector3(Math.cos(a) * 2.45, 2.35 + 0.55 * Math.sin(i * 2.4), Math.sin(a) * 2.45);
});
const buildData = (s: SB) => {
  fq(s, M.metal, -15, -8, 15, 8, 0, 6, 4);
  for (const x of [-2.3, -4.6, 2.3, 4.6]) bx(s, NEON([0.55, 0.25, 1.9]), x - 0.035, 0.005, -7.6, x + 0.035, 0.03, 7.6);
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) {
    const x = sx * (7.4 + (k % 2) * 2.6), z = -5 + k * 2.9;
    bx(s, M.rackDark, x - 0.85, 0, z - 0.55, x + 0.85, 3.5, z + 0.55);
    qm(s, SIGN.rack, [x - 0.78, 0.15, z - 0.59], [x + 0.78, 0.15, z - 0.59], [x + 0.78, 3.35, z - 0.59], [x - 0.78, 3.35, z - 0.59]);
  }
  cy(s, M.dark, 0, 0, 0, 1.2, 1.32, 0.12, 24);
  cy(s, NEON([1.1, 0.6, 2.6]), 0, 0.12, 0, 1.34, 1.34, 0.025, 24);
  gln(s.g, 0, 0.14, 0, 1.6, [1.1, 0.6, 2.6], 0.4);
  const orb = new THREE.Group(); orb.position.set(0, 2.3, 0);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 24), lam("orb", () => ({ color: "#7c58e8" })));
  core.castShadow = false;
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.86, 24, 24), new THREE.MeshBasicMaterial({ color: HDR(0.9, 0.5, 2.4), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  orb.add(core, glow);
  gln(orb, 0, 0, 0, 1.7, [1.1, 0.6, 2.6], 0.85);
  s.g.add(orb); s.dyn.orb = orb;
  const beams = new THREE.Group();
  for (const p of SERV_POS) beams.add(beamMesh(new THREE.Vector3(0, 2.3, 0), p.clone().setY(p.y - 0.18), NEON([1.4, 1.4, 1.7])));
  s.g.add(beams); s.dyn.beams = beams;
  const argon = new THREE.Group(); argon.position.set(0, 4.9, 1.4);
  argon.add(new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.62), SIGN.argon));
  gln(argon, 0, 0, 0.2, 2.3, [1.0, 0.7, 2.0], 0.5);
  argon.visible = false; s.g.add(argon); s.dyn.argon = argon;
  for (const p of SERV_POS) gln(s.g, p.x, p.y, p.z, 0.8, [0.8, 0.7, 1.6], 0.45);
};
const buildLibraryExt = (s: SB) => {
  fq(s, M.plaza, -18, -16, 18, 12, 0, 7, 6);
  bx(s, M.stone, -10.5, 0, 2.5, 10.5, 11, 10);
  for (const x of [-8.4, -5.04, -1.68, 1.68, 5.04, 8.4]) cy(s, M.stoneD, x, 0, 1.1, 0.42, 0.48, 8.6, 14);
  bx(s, M.stoneD, -10.5, 0, 0.2, 10.5, 0.55, 1.3);
  qm(s, SIGN.play, [-1.75, 5.7, 1.5], [1.75, 5.7, 1.5], [1.75, 9.2, 1.5], [-1.75, 9.2, 1.5]);
  gln(s.g, 0, 7.45, 1.45, 1.3, [2.2, 0.55, 0.5], 0.7);
  bx(s, M.woodD, -12, 0, 2.5, -10.8, 0.5, 6); bx(s, M.woodD, 10.8, 0, 2.5, 12, 0.5, 6);
  fq(s, M.asphalt, -30, -8.4, 30, -5.4, 0.015, 10, 1);
  treeMk(s, -15, -2, 3.8, 1.4); treeMk(s, 15.5, -1.5, 4.2, 1.5);
  const t1 = truckMk("#d8d8dc", "#c0392b"), t2 = truckMk("#d8d8dc", "#c0392b");
  s.g.add(t1, t2); s.dyn.lb1 = t1; s.dyn.lb2 = t2;
};
const buildLibraryInt = (s: SB) => {
  fq(s, M.marble, -13, -14, 13, 7, 0, 5, 4);
  fq(s, M.carpet, -1.05, -13, 1.05, 5.5, 0.012, 1, 6);
  for (const x of [-9, -5.6, 5.6, 9]) for (const z of [-9.5, -4.8, -0.1, 4.6]) {
    bx(s, M.woodD, x - 1.35, 0, z - 0.55, x + 1.35, 8.8, z + 0.55);
    qm(s, SIGN.shelves, [x - 1.28, 0.2, z - 0.575], [x + 1.28, 0.2, z - 0.575], [x + 1.28, 8.6, z - 0.575], [x - 1.28, 8.6, z - 0.575]);
  }
  qm(s, SIGN.sky, [-3.4, 10.6, -3.4], [3.4, 10.6, -3.4], [3.4, 10.6, 3.4], [-3.4, 10.6, 3.4]);
  const sg = new THREE.Group(); sg.position.set(0, 5.2, -6);
  sg.add(new THREE.Mesh(new THREE.PlaneGeometry(4.1, 1.54), UN(sign500T)));
  for (const x of [-1.7, 1.7]) s.b.add(new THREE.CylinderGeometry(0.014, 0.014, 5.0, 6), M.dark, new THREE.Matrix4().makeTranslation(x, 7.72, -6));
  s.g.add(sg); s.dyn.sign500 = sg;
  for (const z of [-9.5, -6, -2.5, 1, 4]) {
    for (const x of [-4.5, -2.3, 2.3, 4.5]) {
      cy(s, M.dark, x, 0, z, 0.035, 0.05, 1.1, 8);
      sp(s, NEON([2.2, 1.85, 1.2]), x, 1.2, z, 0.26, 12);
      gln(s.g, x, 1.2, z, 1.05, [2.2, 1.85, 1.2], 0.95);
    }
  }
  gln(s.g, 0, 10.6, 0, 2.6, [0.65, 0.8, 1.5], 0.35);
  bx(s, M.stone, -13, 0, 6.2, 13, 10, 6.8);
};
const buildBedroom = (s: SB) => {
  fq(s, M.rug, -5.5, -7, 5.5, 3, 0, 4, 3);
  bx(s, M.wallN, -5.5, 0, 0.1, 5.5, 3.1, 0.4);
  qm(s, UN(cityT, 1.5), [1.1, 0.9, 0.32], [3.7, 0.9, 0.32], [3.7, 2.5, 0.32], [1.1, 2.5, 0.32]);
  gln(s.g, 2.4, 1.7, 0.25, 1.5, [0.6, 0.8, 1.4], 0.55);
  bx(s, M.woodD, -4.6, 0, -4.7, -1.5, 0.42, -1.9);
  bx(s, M.white, -4.5, 0.42, -4.6, -1.6, 0.62, -2.0);
  bx(s, M.red, -2.9, 0.62, -4.55, -1.5, 0.78, -2.05);
  bx(s, M.white, -4.4, 0.62, -2.35, -3.2, 0.85, -2.05);
  bx(s, M.woodL, 2.2, 0, -3.4, 4.4, 0.72, -1.8);
  cy(s, M.dark, 3.9, 0.72, -2.4, 0.05, 0.07, 0.42, 8);
  sp(s, NEON([2.0, 1.6, 0.9]), 3.9, 1.2, -2.4, 0.1, 10);
  gln(s.g, 3.9, 1.2, -2.4, 0.55, [2.0, 1.6, 0.9], 0.7);
  gln(s.g, 2.4, 1.7, 0.2, 1.4, [0.6, 0.8, 1.4], 0.5);
  const tb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.5), M.dark);
  tb.position.set(-2.15, 0.65, -2.9); tb.rotation.y = 0.4; s.g.add(tb);
};
const buildEarth = (s: SB) => {
  stars(s.g, 90);
  const globe = new THREE.Group(); globe.position.set(0, 1.7, 0);
  const gm = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 32), lam("earthM", () => ({ map: earthT })));
  gm.castShadow = false;
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.92, 24, 24), new THREE.MeshBasicMaterial({ color: HDR(0.8, 0.45, 2.0), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  globe.add(gm, halo); s.g.add(globe); s.dyn.globe = globe;
  const bot = new THREE.Group(); bot.position.set(0, 3.3, 0); bot.rotation.z = 0.08;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.3, 6, 12), lam("bot", () => ({ color: "#a4c639" })));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), lam("botH", () => ({ color: "#a4c639" })));
  head.position.y = 0.38;
  for (const sx of [-1, 1]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6), lam("botA", () => ({ color: "#a4c639" })));
    ant.position.set(sx * 0.1, 0.55, 0);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), M.dark);
    eye.position.set(sx * 0.09, 0.44, 0.23);
    bot.add(ant, eye);
  }
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 8), lam("botAr", () => ({ color: "#a4c639" })));
    arm.position.set(sx * 0.34, 0.05, 0); arm.rotation.z = sx * 0.5; bot.add(arm);
  }
  bot.add(body, head);
  s.g.add(bot); s.dyn.bot = bot;
};
const buildShelf = (s: SB) => {
  stars(s.g, 80);
  const g2 = new THREE.Group(); g2.position.set(-5.9, 3.7, -5.5);
  const gm = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 24), lam("earthS", () => ({ map: earthT })));
  g2.add(gm); s.g.add(g2); s.dyn.globe2 = g2;
  bx(s, M.dark, -3.1, 0.4, -0.24, 3.1, 2.7, -0.14);
  bx(s, M.woodL, -3.2, 1.06, -0.2, 3.2, 1.24, 0.1);
  for (let i = 0; i < 10; i++) {
    const x = -2.7 + i * 0.6, iph = i < 3;
    bx(s, iph ? M.silver : M.dark, x - 0.14, 1.24, -0.07, x + 0.14, 1.8, 0.01);
    qm(s, iph ? SIGN.iph : SIGN.andr, [x - 0.12, 1.28, -0.085], [x + 0.12, 1.28, -0.085], [x + 0.12, 1.76, -0.085], [x - 0.12, 1.76, -0.085]);
    if (!iph) {
      bx(s, NEON([0.4, 1.9, 0.55]), x - 0.16, 1.245, -0.15, x + 0.16, 1.262, -0.09);
      gln(s.g, x, 1.28, -0.12, 0.42, [0.4, 1.9, 0.55], 0.7);
    }
  }
};
const buildApple = (s: SB) => {
  fq(s, M.metal, -10, -9, 10, 5, 0, 4, 3);
  fq(s, M.wood, -9.5, -3, 9.5, 5, 0.02, 6, 4);
  qm(s, M.glass, [-9.5, 0, -7], [9.5, 0, -7], [9.5, 4.4, -7], [-9.5, 4.4, -7]);
  bx(s, M.white, -10, 0, 2.0, 10, 4.6, 2.3);
  cy(s, M.silver, 0, 1.5, 1.9, 1.05, 1.05, 0.05, 28);
  bx(s, M.woodL, -1.7, 0, -2.4, 3.1, 0.75, -0.9);
  for (const [x, z] of [[0.7, -1.75], [1.4, -1.5], [2.1, -1.8]] as [number, number][]) {
    bx(s, M.gold, x - 0.1, 0.75, z - 0.1, x + 0.1, 0.82, z + 0.1);
  }
  cy(s, M.white, 4.4, 0, -1.4, 0.36, 0.42, 0.9, 16);
  bx(s, M.gold, 4.25, 0.9, -1.55, 4.55, 0.97, -1.25);
  const spk = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), SIGN.spark);
  spk.position.set(4.4, 1.45, -1.4); s.g.add(spk);
  gln(s.g, 4.4, 1.45, -1.4, 0.55, [2.4, 1.9, 0.9], 0.7);
  gln(s.g, 0, 1.5, 1.9, 1.3, [0.8, 0.85, 1.0], 0.3);
  treeMk(s, -7.5, -6.5, 3.2, 1.2);
};
const buildDesk = (s: SB) => {
  fq(s, M.wood, -3.6, -3.2, 3.6, 3.2, 0, 4, 4);
  bx(s, M.wood, -3.0, 0.8, -2.0, 3.0, 0.92, 2.0, 0);
  bx(s, M.woodD, -2.1, 0, -1.3, -1.85, 0.8, 1.3);
  bx(s, M.woodD, 1.85, 0, -1.3, 2.1, 0.8, 1.3);
  qm(s, SIGN.cal15, [0.2, 0.92, -0.14], [0.8, 0.92, -0.14], [0.8, 1.34, -0.14], [0.2, 1.34, -0.14]);
  const pg = new THREE.Group(); pg.position.set(0.5, 1.34, -0.12);
  const geo = new THREE.PlaneGeometry(0.6, 0.42); geo.translate(0, -0.21, 0);
  pg.add(new THREE.Mesh(geo, SIGN.cal18));
  s.g.add(pg); s.dyn.calpage = pg;
  for (const [x, z, c, r] of [[-0.9, 0.3, "#f7e04a", 0.2], [-0.55, 0.55, "#7ad05a", -0.15], [-1.25, 0.6, "#f29ab0", 0.35]] as [number, number, string, number][]) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), lam("note" + c, () => ({ color: c })));
    q.rotation.x = -Math.PI / 2; q.rotation.z = r; q.position.set(x, 0.925, z); s.g.add(q);
  }
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), M.dark);
  pen.rotation.z = Math.PI / 2; pen.rotation.y = 0.5; pen.position.set(1.35, 0.945, 0.1); s.g.add(pen);
  cy(s, M.white, -1.75, 0.92, 0.15, 0.09, 0.1, 0.17, 12);
  s.b.add(new THREE.CircleGeometry(0.085, 12), lam("cof", () => ({ color: "#3a2a20" })), new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(-1.75, 1.093, 0.15));
};
const buildLaptop = (s: SB) => {
  fq(s, M.wood, -3.6, -3.2, 3.6, 3.2, 0, 4, 4);
  bx(s, M.wood, -3.0, 0.76, -2.0, 3.0, 0.88, 2.0, 0);
  bx(s, M.woodD, -2.1, 0, -1.3, -1.85, 0.76, 1.3);
  bx(s, M.woodD, 1.85, 0, -1.3, 2.1, 0.76, 1.3);
  bx(s, M.silver, -0.48, 0.88, -0.32, 0.48, 0.93, 0.32);
  const lg = new THREE.Group(); lg.position.set(0, 0.915, -0.28); lg.rotation.x = -0.32;
  const geo = new THREE.PlaneGeometry(0.92, 0.6); geo.translate(0, 0.3, 0);
  const scr = new THREE.Mesh(geo, SIGN.chromeh);
  lg.add(scr);
  gln(lg, 0, 0.3, 0.25, 1.2, [0.6, 0.75, 1.4], 0.55);
  s.g.add(lg); s.dyn.lap = lg;
  cy(s, M.white, -1.55, 0.88, 0.2, 0.09, 0.1, 0.17, 12);
  for (const [x, z, c] of [[1.5, 0.35, "#f7e04a"], [1.75, 0.05, "#7ad05a"]] as [number, number, string][]) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), lam("note2" + c, () => ({ color: c })));
    q.rotation.x = -Math.PI / 2; q.rotation.z = 0.3; q.position.set(x, 0.885, z); s.g.add(q);
  }
};
const buildAerial = (s: SB) => {
  fq(s, SIGN.map, -19, -19, 19, 19, 0, 1, 1);
  const cars = new THREE.Group();
  for (let i = 0; i < 7; i++) cars.add(carMk(["#4285f4", "#ea4335", "#fbbc05", "#34a853", "#e8e8ea", "#2a2c34", "#c9a23a"][i]));
  s.g.add(cars); s.dyn.acars = cars;
  const pin = new THREE.Group(); pin.position.set(2, 0, -3.5);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.62, 12), lam("pin", () => ({ color: "#ea4335" })));
  cone.rotation.x = Math.PI; cone.position.y = 0.85;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), lam("pinb", () => ({ color: "#ea4335" })));
  ball.position.y = 1.2; pin.add(cone, ball);
  gln(pin, 0, 1.35, 0, 0.7, [2.2, 0.55, 0.4], 0.75);
  s.g.add(pin); s.dyn.pin = pin;
};
const buildQuantum = (s: SB) => {
  fq(s, M.wood, -7.5, -7.5, 7.5, 4, 0, 3, 3);
  bx(s, M.cream, -7.5, 0, 0.4, 7.5, 3.8, 0.75);
  qm(s, SIGN.glogo, [1.6, 1.8, 0.68], [4.2, 1.8, 0.68], [4.2, 2.57, 0.68], [1.6, 2.57, 0.68]);
  qm(s, new THREE.MeshBasicMaterial({ color: HDR(1.5, 1.1, 0.75) }), [-7.2, 0.9, -4.2], [-7.2, 0.9, -1.4], [-7.2, 2.6, -1.4], [-7.2, 2.6, -4.2]);
  bx(s, M.woodD, -7.5, 0, -4.4, -7.3, 2.85, -1.2);
  const ch = new THREE.Group(); ch.position.set(0, 2.75, 0);
  for (const [r, y] of [[0.95, 0], [0.62, 0.55], [0.34, 1.0]] as [number, number][]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 10, 40), M.gold); t.rotation.x = Math.PI / 2; t.position.y = y; ch.add(t);
  }
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.15, 14), M.goldD); core.position.y = 0.5; ch.add(core);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.6, 6), M.goldD);
    w.position.set(Math.cos(a) * 0.9, 1.95, Math.sin(a) * 0.9); ch.add(w);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), NEON([2.4, 1.9, 0.9]));
    gl.position.set(Math.cos(a) * 0.9, 0.02, Math.sin(a) * 0.9); ch.add(gl);
    gln(ch, Math.cos(a) * 0.9, 0.02, Math.sin(a) * 0.9, 0.38, [2.4, 1.9, 0.9], 0.6);
  }
  cy(s, M.goldD, 0, 3.55, 0, 0.3, 0.34, 0.16, 14, new THREE.Matrix4().makeTranslation(0, 0, 0));
  gln(ch, 0, 1.1, 0, 1.9, [2.4, 1.9, 0.9], 0.85);
  s.g.add(ch); s.dyn.chand = ch;
};
const buildTrack = (s: SB) => {
  fq(s, M.grass, -30, -16, 30, 16, 0, 8, 6);
  fq(s, M.asphalt, -24, -2.5, 10, 2.5, 0.02, 10, 1);
  for (let x = -22; x < 9; x += 3.2) bx(s, M.white, x, 0.03, -0.09, x + 1.5, 0.05, 0.09);
  cy(s, M.silver, 6, 0, -2.9, 0.09, 0.12, 4.2, 10);
  cy(s, M.silver, 6, 0, 2.9, 0.09, 0.12, 4.2, 10);
  qm(s, SIGN.check, [6, 3.1, -2.9], [6, 3.1, 2.9], [6, 3.95, 2.9], [6, 3.95, -2.9]);
  const cars = new THREE.Group();
  cars.add(carMk("#f2f2f4")); cars.add(carMk("#c0392b")); cars.add(carMk("#2a5fc9"));
  s.g.add(cars); s.dyn.tcars = cars;
  treeMk(s, -18, -8, 3.4, 1.3); treeMk(s, -4, -9, 3.8, 1.5); treeMk(s, 14, -7, 3.6, 1.4);
};
const buildCouch = (s: SB) => {
  fq(s, M.rug, -7, -7, 7, 4, 0, 4, 3);
  bx(s, M.cream, -7, 0, 2.4, 7, 3.5, 2.75);
  qm(s, new THREE.MeshBasicMaterial({ color: HDR(1.7, 1.25, 0.8) }), [-5.6, 0.9, 2.36], [-3.0, 0.9, 2.36], [-3.0, 2.6, 2.36], [-5.6, 2.6, 2.36]);
  bx(s, M.woodD, -5.8, 0.8, 2.32, -2.8, 0.95, 2.42);
  bx(s, M.dark, -0.35, 0, -3.4, 1.35, 0.5, -3.0);
  qm(s, SIGN.ytw, [-0.6, 0.9, -3.2], [1.6, 0.9, -3.2], [1.6, 2.28, -3.2], [-0.6, 2.28, -3.2]);
  bx(s, M.couch, -3.15, 0, -2.35, -0.75, 0.46, -1.05);
  bx(s, M.couch, -3.15, 0.46, -2.35, -0.75, 1.05, -2.1);
  bx(s, M.couch, -3.15, 0.46, -1.35, -2.95, 0.95, -1.05);
  bx(s, M.couch, -0.95, 0.46, -1.35, -0.75, 0.95, -1.05);
  cy(s, M.dark, 2.9, 0, -2.3, 0.05, 0.08, 1.5, 8);
  sp(s, NEON([2.4, 1.9, 1.1]), 2.9, 1.62, -2.3, 0.16, 12);
  gln(s.g, 2.9, 1.62, -2.3, 1.7, [2.0, 1.7, 1.1], 0.6);
  bx(s, M.rug, -3.4, 0, 0.4, -2.0, 0.09, 1.6);
};
// ---------------- cast ----------------
const OUTFITS: Record<string, Outfit> = {
  student0: { jacket: "#4a72c9", pants: "#3b3f52", boots: "#4a3020", hat: "hair", hair: "#4a3020" },
  student1: { jacket: "#c95a9a", pants: "#2a2c34", boots: "#f4f1ea" },
  student2: { jacket: "#4a9a6a", pants: "#3b3f52", boots: "#4a3020", hat: "cap", cap: "#e2453c" },
  elon: { jacket: "#23232b", pants: "#1c1c22", boots: "#1a1a20" },
  engineer: { jacket: "#e8eaee", pants: "#3b3f52", boots: "#4a3020" },
  worker: { jacket: "#8ab300", pants: "#2a2c34", boots: "#1a1a20", hat: "cap", cap: "#76b900" },
  guard: { jacket: "#2f4a8a", pants: "#22242c", boots: "#1a1a20", hat: "cap", cap: "#2f4a8a" },
  presenter: { jacket: "#3a3f4c", pants: "#26262e", boots: "#1a1a20" },
  audience: { jacket: "#5a5f6c", pants: "#3b3f52", boots: "#2a2c34" },
  audience2: { jacket: "#7a4a9a", pants: "#26262e", boots: "#2a2c34" },
  avatar: { jacket: "#f29938", pants: "#d87a20", boots: "#a85a10" },
  kid: { jacket: "#f08a2c", pants: "#3b5b9a", boots: "#f4f1ea", hat: "cap", cap: "#e2453c", build: "kid" },
  apple: { jacket: "#26262e", pants: "#26262e", boots: "#1a1a20" },
  qeng: { jacket: "#f2f3f5", pants: "#3b3f52", boots: "#e8e8ea" },
  flag: { jacket: "#e8eaee", pants: "#2a2c34", boots: "#1a1a20", hat: "cap", cap: "#c0392b" },
  couch: { jacket: "#6a8a4a", pants: "#3b3f52", boots: "#e8e8ea" },
};
const WHO: Record<string, Who> = {};
Object.entries(OUTFITS).forEach(([k, o], i) => { WHO[k] = { i: i * 3 + 1, o, okey: k }; });
import { lidAt } from "./cast";
import { fxBurst } from "./toon";
const drawCone = (p: Pen) => {
  const g = p.g, gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "rgba(255,244,214,0.5)"); gr.addColorStop(1, "rgba(255,244,214,0.03)");
  g.fillStyle = gr; g.beginPath(); g.moveTo(60, 4); g.lineTo(68, 4); g.lineTo(126, 252); g.lineTo(2, 252); g.closePath(); g.fill();
};

// ---------------- World ----------------
type PoolFor = { actors: Actor[]; fxs: Fx[] };
const ALIAS: Partial<Record<WSet, WSet>> = { argon: "data" };
const BUILDERS: Record<string, (s: SB) => void> = {
  campus: buildCampus, elon: buildElon, xpost: buildXpost, office: buildOffice, nvidia: buildNvidia, gate: buildGate,
  tpuStage: buildTpuStage, data: buildData, libraryExt: buildLibraryExt, libraryInt: buildLibraryInt, bedroom: buildBedroom,
  earth: buildEarth, shelf: buildShelf, apple: buildApple, desk: buildDesk, laptop: buildLaptop, aerial: buildAerial,
  argon: buildData, quantum: buildQuantum, track: buildTrack, couch: buildCouch,
};
const SUN_OV: Record<number, { az: number; el: number }> = {
  2: { az: -40, el: 30 }, 7: { az: -30, el: 45 }, 8: { az: -30, el: 45 }, 11: { az: 10, el: 65 }, 37: { az: -35, el: 50 },
};
const DATA_IDS = new Set([9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 31, 36, 39]);
const PANEL_IDS = new Set([15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private pools = new Map<WSet, PoolFor>();
  private castG = new Map<WSet, THREE.Group>();
  private groups = {} as Record<WSet, THREE.Group>;
  private dyns = {} as Record<WSet, Record<string, THREE.Object3D>>;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private sunCache = new Map<number, THREE.Vector3>();
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private sph = new THREE.Sphere();
  private dbg = new Map<number, number>();

  constructor() {
    const R = this.root;
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
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    R.add(this.sky);
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.fill = new THREE.DirectionalLight("#9fb8ff", 0.35);
    R.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);
    for (const [k, home] of Object.entries(SET_HOME) as [WSet, V3][]) {
      const src = ALIAS[k] ?? k;
      if (this.groups[src]) {
        this.groups[k] = this.groups[src]; this.dyns[k] = this.dyns[src];
        this.castG.set(k, this.castG.get(src)!);
        continue;
      }
      const g = new THREE.Group();
      g.position.set(...home);
      const b = new Batch();
      const s: SB = { g, b, dyn: {} };
      BUILDERS[src](s);
      b.build(g);
      g.visible = false;
      R.add(g);
      this.groups[k] = g;
      this.dyns[k] = s.dyn;
      const cg = new THREE.Group();
      g.add(cg);
      this.castG.set(k, cg);
    }
  }

  private poolFor(set: WSet): PoolFor {
    let p = this.pools.get(set);
    if (!p) { p = { actors: [], fxs: [] }; this.pools.set(set, p); }
    return p;
  }

  private shotSun(id: number, s: (typeof SHOTS)[number], L: (typeof LIGHTS)[string]) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1;
      fx += x / n; fz += z / n;
    }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const ov = SUN_OV[id], az = THREE.MathUtils.degToRad(ov?.az ?? L.az), el = THREE.MathUtils.degToRad(ov?.el ?? L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], Lp = LIGHTS[s.light], K = LOOK[s.light];
    const L: LightPreset = s.lightO ? { ...Lp, ...s.lightO } as LightPreset : Lp;
    setLight(s.light);
    // ---- camera: local framing + set home + kick shake ----
    const c = camAt(id, f), home = SET_HOME[s.set], kick = kickAt(f);
    cam.position.set(home[0] + c.pos[0], home[1] + c.pos[1] + kick * 0.05, home[2] + c.pos[2]);
    cam.up.set(0, 1, 0);
    cam.lookAt(home[0] + c.look[0], home[1] + c.look[1], home[2] + c.look[2] + kick * 0.02);
    cam.rotateZ(c.roll + kick * 0.012);
    cam.fov = c.fov; cam.near = 0.2; cam.far = 1500;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = this.v.set(home[0] + c.look[0], home[1] + c.look[1], home[2] + c.look[2]).clone();
    const dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    // ---- light rig: camera-relative sun frozen per shot, shadow fit, two-tone uniforms ----
    const sunDir = this.shotSun(id, s, L);
    setSun(sunDir);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 95);
    if (s.light === "golden") Rr = Math.max(Rr, 30);
    this.sun.position.copy(focus).addScaledVector(sunDir, 220);
    this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -Rr; sc.right = sc.top = Rr; sc.near = 40; sc.far = 480;
    sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias;
    this.fill.position.set(cam.position.x - 30, cam.position.y + 60, cam.position.z - 40);
    this.fill.target.position.copy(focus);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term;
    TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    // ---- sky + fog ----
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const ee = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(ee[1], ee[2], ee[3], ee[4]);
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    if (s.set === "aerial") { this.fog.near = 70; this.fog.far = 800; } // overhead view: kill haze
    scene.fog = this.fog; scene.background = null;
    // ---- only the active set is on stage ----
    const grp = this.groups[s.set];
    for (const k of Object.keys(this.groups)) this.groups[k as WSet].visible = false;
    grp.visible = true;
    this.poseDynamics(id, t);
    // ---- cast ----
    const right = this.v.setFromMatrixColumn(cam.matrixWorld, 0).clone();
    const lcam: CamInfo = { pos: cam.position.clone().sub(new THREE.Vector3(home[0], home[1], home[2])), right, sun: sunDir };
    const st: Stage = { places: [], fx: [] };
    this.poseCast(id, t, st, lcam);
    // ---- frustum-culled placement of actors + fx (template loop, local coords + home for world cull) ----
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const pf = this.poolFor(s.set), cg = this.castG.get(s.set)!;
    let ai = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc2 = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x + home[0], p.y + 1.1 * sc2 + home[1], p.z + home[2]), 3.5))) continue;
      while (pf.actors.length <= ai) pf.actors.push(new Actor(cg));
      const a = pf.actors[ai++];
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(lcam.pos.x - p.x, lcam.pos.z - p.z), p.roll ?? 0);
      a.mesh.scale.set(p.mirror ? -sc2 : sc2, sc2, sc2);
      used.push(a);
    }
    for (let i = ai; i < pf.actors.length; i++) pf.actors[i].mesh.visible = false;
    let fi = 0;
    const fused: Fx[] = [];
    for (const p of st.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x + home[0], p.y + home[1], p.z + home[2]), Math.max(p.w, p.h)))) continue;
      while (pf.fxs.length <= fi) pf.fxs.push(new Fx(cg));
      const e = pf.fxs[fi++];
      e.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e.use(!!p.soft);
      e.mesh.visible = true;
      e.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e.mesh.quaternion.copy(cam.quaternion); e.mesh.rotateZ(p.rot ?? 0); }
      e.mesh.scale.set(p.w, p.h, 1);
      fused.push(e);
    }
    for (let i = fi; i < pf.fxs.length; i++) pf.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const e of fused) e.bind();
    return focus;
  }
  private poseDynamics(id: number, t: number) {
    const dyn = this.dyns[SHOTS[id - 1].set] ?? {};
    const D = (k: string) => dyn[k];
    const ez = (u: number) => easeOut(clamp01(u));
    if (DATA_IDS.has(id)) {
      const orb = D("orb");
      if (orb) { orb.position.y = 2.3 + 0.06 * Math.sin(t * 1.3); if (id === 9) orb.scale.setScalar(0.55 + 0.45 * ez(t / 0.8)); }
      const beams = D("beams");
      if (beams) beams.visible = !PANEL_IDS.has(id) && id !== 36;
      const argon = D("argon");
      if (argon) { argon.visible = id === 36; if (id === 36) { argon.scale.setScalar(0.6 + 0.4 * ez(t / 0.7)); argon.position.y = 4.9 + 0.05 * Math.sin(t * 0.9); } }
    }
    switch (id) {
      case 3: { const g = D("xpost"); if (g) { const u = ez(t / 0.5); g.scale.setScalar(0.2 + 0.8 * u); g.position.y = 3.7 + 0.07 * Math.sin(t * 1.3); } break; }
      case 5: { const g = D("nvtruck"); if (g) g.position.x = -11 + t * 1.7; break; }
      case 6: { const a = D("gt1"), b = D("gt2"); if (a) a.position.set(-16 + ((t * 3.2) % 30), 0, -1.0); if (b) b.position.set(-1 + ((t * 3.2 + 15) % 30), 0, 1.0); break; }
      case 7: { const g = D("chip"); if (g) { const u = ez(t / 0.9); g.position.y = 1.0 + 0.55 * u; g.rotation.y = t * 1.1; } break; }
      case 8: { const g = D("chip"); if (g) { g.position.y = 1.55; g.rotation.y = 2.0 + t * 1.1; } const card = D("tpucard"); if (card) { card.visible = true; const u = ez(t / 0.4); card.scale.setScalar(0.25 + 0.75 * u); card.position.y = 3.6 + 0.05 * Math.sin(t * 1.6); } break; }
      case 10: { const a = D("lb1"), b = D("lb2"); if (a) a.position.set(-18 + ((t * 2.7) % 34), 0, -6.9); if (b) b.position.set(0 + ((t * 2.7 + 17) % 34), 0, -6.9); break; }
      case 11: { const g = D("sign500"); if (g) g.rotation.z = 0.045 * Math.sin(t * 0.9); break; }
      case 27: { const g = D("globe"); if (g) g.rotation.y = t * 0.25; const b2 = D("bot"); if (b2) b2.position.y = 3.3 + 0.05 * Math.sin(t * 1.1); break; }
      case 28: case 29: { const g = D("globe2"); if (g) g.rotation.y = -t * 0.14; break; }
      case 32: { const g = D("calpage"); if (g) g.rotation.x = -Math.PI * smooth(clamp01((t - 2.0) / 1.0)); break; }
      case 33: case 34: { const lap = D("lap"); if (lap) { const m = (lap.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial; const want = id === 34 ? ytWatchT : chromeHistT; if (m.map !== want) m.map = want; } break; }
      case 35: { const cars = D("acars"); if (cars) cars.children.forEach((c, i) => {
          if (i < 4) { c.position.set(-15 + ((t * 3 + i * 7) % 29), 0.02, -3.0); c.rotation.y = 0; }
          else { c.position.set(2.0, 0.02, -15 + ((t * 2.5 + i * 6) % 29)); c.rotation.y = -Math.PI / 2; }
        }); const pin = D("pin"); if (pin) pin.position.y = 0.12 + 0.09 * Math.abs(Math.sin(t * 2.1)); break; }
      case 37: { const g = D("chand"); if (g) g.rotation.y = t * 0.16; break; }
      case 38: { const cars = D("tcars"); if (cars) {
          const lead = -16 + t * 5.0;
          cars.children[0].position.set(lead, 0, -1.1);
          cars.children[1].position.set(lead - 2.3 - Math.min(1.6, t * 0.2), 0, 1.2);
          cars.children[2].position.set(lead - 4.6 - Math.min(3.0, t * 0.4), 0, -0.2);
        } break; }
    }
  }

  private poseCast(id: number, t: number, st: Stage, cam: CamInfo) {
    const W = WHO, FRONT = { side: false, mirror: false };
    const bl = (i: number) => lidAt(t, i);
    const iconFx = (i: number, p: THREE.Vector3, w = 0.55) =>
      st.fx.push({ key: `svc|${i}`, cw: 256, ch: 330, draw: svcCard(SERVICES[i]), x: p.x, y: p.y + 0.05 * Math.sin(t * 1.6 + i * 1.7), z: p.z, w, h: (w * 330) / 256 });
    const avatarAt = (x: number, z: number) => {
      st.places.push(person(cam, W.avatar, x, 0.135, z, FRONT,
        { mode: "stand", expr: "grin", blink: bl(9), light: 0, seed: 10 }, { mode: "stand", light: 0, seed: 10 }, 0.72));
      blob(st, x, 0.145, z, 0.7);
    };
    const stander = (key: string, x: number, y: number, z: number, expr: string, i: number, look = 0) => {
      st.places.push(person(cam, W[key], x, y, z, FRONT,
        { mode: "stand", expr: expr as Expr, blink: bl(i), look, light: 0, seed: i }, { mode: "stand", light: 0, seed: i }));
      blob(st, x, y + 0.01, z);
    };
    switch (id) {
      case 1: {
        for (let i = 0; i < 3; i++) {
          const x = 7.5 - ((t * 2.1 + i * 1.4) % 15), z = -2.6 - i * 1.15;
          const view = viewOf(cam, x, z, -1, 0), ph = (t * 1.9 + i * 0.31) % 1;
          st.places.push(person(cam, W[`student${i}`], x, 0, z, view,
            { phase: ph, mode: "stroll", expr: "neutral", blink: bl(i), light: 0, seed: i + 1 },
            { phase: ph, mode: "march", blink: bl(i), stride: 0.85, light: 0, seed: i + 1 }));
          blob(st, x, 0, z);
        }
        for (let i = 0; i < 22; i++) {
          const x = -7.5 + (i % 6) * 3.0, z = -13 + (i % 5) * 3.4, y = 7.6 - ((t * 7.5 + i * 1.13) % 8.6);
          st.fx.push({ key: "rain", cw: 24, ch: 128, draw: (p) => { const g = p.g, gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "rgba(210,225,245,0)"); gr.addColorStop(0.35, "rgba(210,225,245,0.8)"); gr.addColorStop(1, "rgba(210,225,245,0)"); g.fillStyle = gr; g.fillRect(9, 0, 5, 128); }, x, y, z, w: 0.05, h: 1.5, soft: true, rot: -0.14 });
        }
        for (let i = 0; i < 4; i++) {
          const u = (t * 0.5 + i * 0.29) % 1;
          st.fx.push({ key: "news", cw: 256, ch: 320, draw: (p) => p.g.drawImage(newsT.image as CanvasImageSource, 0, 0),
            x: 4.5 - i * 2.8 + u * 2.2, y: 6.8 - u * 5.8, z: -6 + i * 1.4, w: 0.55, h: 0.69, rot: (i * 0.7 + u * 3.2) % 6.28 });
        }
        break;
      }
      case 2: stander("elon", 0, 0, -4.7, "stern", 3, 0.12); break;
      case 4: {
        const x = -1.7, z = -2.0, view = viewOf(cam, x, z, 0.55, 0.83);
        st.places.push(person(cam, W.engineer, x, 0, z, view,
          { mode: "stand", expr: "stern", blink: bl(4), headTilt: 0.12, light: 0, seed: 5 }, { mode: "stand", light: 0, seed: 5 }));
        blob(st, x, 0, z);
        break;
      }
      case 5: {
        const x = 1.9, z = -3.6, view = viewOf(cam, x, z, 0.25, 0.97);
        st.places.push(person(cam, W.worker, x, 0, z, view,
          { mode: "stand", expr: "neutral", blink: bl(5), light: 0, seed: 6 }, { mode: "stand", light: 0, seed: 6 }));
        blob(st, x, 0, z);
        break;
      }
      case 6: stander("guard", 3.2, 0, -3.4, "stern", 6); break;
      case 7: case 8: {
        stander("presenter", -2.4, 0, -2.2, "grin", 7);
        for (let i = 0; i < 8; i++) {
          const x = -3.8 + (i % 4) * 2.5, z = 0.9 + Math.floor(i / 4) * 1.7;
          st.places.push(person(cam, W[i % 3 ? "audience" : "audience2"], x, 0, z, FRONT,
            { mode: "stand", expr: i % 2 ? "grin" : "smile", blink: bl(10 + i), light: 0, seed: 20 + i }, { mode: "stand", light: 0, seed: 20 + i }, 0.92));
          blob(st, x, 0, z, 0.9);
        }
        for (const [x, r] of [[-3.2, 0.14], [3.2, -0.14]] as [number, number][])
          st.fx.push({ key: "conefx", cw: 128, ch: 256, draw: drawCone, x, y: 3.3, z: 2.4, w: 1.5, h: 3.0, soft: true, rot: r });
        break;
      }
      case 9: case 13: case 36: {
        avatarAt(0, 0.8);
        for (let i = 0; i < SERVICES.length; i++) iconFx(i, SERV_POS[i]);
        break;
      }
      case 12: {
        avatarAt(0, 0.8);
        for (let i = 0; i < SERVICES.length; i++) iconFx(i, SERV_POS[i]);
        for (let i = 0; i < 6; i++) {
          const u = smooth(((t * 0.65 + i * 0.167) % 1));
          const a = i * 1.05 + 0.4, s = new THREE.Vector3(Math.cos(a) * 3.4, 1.1 + ((i * 37) % 10) / 9 * 2.2, Math.sin(a) * 3.4);
          const p = s.lerp(new THREE.Vector3(0, 2.3, 0), u);
          st.fx.push({ key: "thumb", cw: 128, ch: 96, draw: (pg) => pg.g.drawImage(thumbT.image as CanvasImageSource, 0, 0), x: p.x, y: p.y, z: p.z, w: 0.52 * (1 - u * 0.35), h: 0.39 * (1 - u * 0.35) });
        }
        break;
      }
      case 14: case 31: case 39: {
        avatarAt(0, 0.8);
        const u = smooth(clamp01(t / 1.1));
        for (let i = 0; i < SERVICES.length; i++) {
          const p = SERV_POS[i].clone().lerp(new THREE.Vector3(-3.1 + (6.2 * i) / 10, 1.6 + 1.3 * Math.sin((Math.PI * i) / 10), -2.7), u);
          iconFx(i, p, 0.6);
        }
        break;
      }
      case 15: case 16: case 17: case 18: case 19: case 20: case 21: case 22: case 23: case 24: case 25: {
        avatarAt(0.15, 0.9);
        const hi = id - 15;
        for (let i = 0; i < SERVICES.length; i++) iconFx(i, i === hi ? new THREE.Vector3(0.55, 2.55, -2.5) : SERV_POS[i], i === hi ? 1.5 : 0.55);
        break;
      }
      case 26: {
        st.places.push(person(cam, W.kid, -3.0, 0.63, -3.0, FRONT,
          { mode: "sit", expr: "nervous", blink: bl(11), look: 0.15, light: 0, seed: 12 }, { mode: "stand", light: 0, seed: 12 }));
        blob(st, -3.0, 0.64, -3.0, 0.85);
        st.fx.push({ key: "glowsoft", cw: 128, ch: 128, draw: (p) => { const g = p.g, gr = g.createRadialGradient(64, 64, 6, 64, 64, 62); gr.addColorStop(0, "rgba(255,255,255,0.5)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); },
          x: -1.75, y: 1.42, z: -2.9, w: 1.7, h: 1.7, soft: true });
        st.fx.push({ key: "gmail", cw: 512, ch: 320, draw: (p) => p.g.drawImage(gmailT.image as CanvasImageSource, 0, 0),
          x: -1.75, y: 1.42 + 0.05 * Math.sin(t * 1.4), z: -2.9, w: 0.95, h: 0.6 });
        break;
      }
      case 30: {
        const u = clamp01(t / 5.6), x = -7 + 9.9 * u, z = -2.2;
        if (u < 1) {
          const view = viewOf(cam, x, z, 1, 0), ph = (t * 1.8) % 1;
          st.places.push(person(cam, W.apple, x, 0, z, view,
            { phase: ph, mode: "stroll", expr: "stern", blink: bl(13), light: 0, seed: 14 },
            { phase: ph, mode: "march", blink: bl(13), stride: 0.9, light: 0, seed: 14 }));
        } else {
          stander("apple", x, 0, z, "stern", 13);
        }
        blob(st, x, 0, z);
        break;
      }
      case 37: stander("qeng", -2.5, 0, -3.0, "smile", 15, -0.3); break;
      case 38: {
        stander("flag", 7.8, 0, 3.2, "grin", 16);
        st.fx.push({ key: "wflag", cw: 256, ch: 256, draw: (p) => {
            const g = p.g; g.strokeStyle = "#2b2430"; g.lineWidth = 9; g.lineCap = "round";
            g.beginPath(); g.moveTo(40, 250); g.lineTo(40, 20); g.stroke();
            g.drawImage(checkT.image as CanvasImageSource, 44, 26, 168, 63);
          }, x: 7.45, y: 1.75, z: 3.15, w: 1.1, h: 1.1, rot: Math.sin(t * 6) * 0.25 });
        if (t > 4.4) {
          const u = clamp01((t - 4.4) / 0.55);
          for (const [x, z, k] of [[6.4, -1.4, 0], [5.4, 1.6, 2], [7.2, 0.4, 4]] as [number, number, number][])
            st.fx.push({ key: `burst|${k}|${Math.round(u * 8)}`, cw: 256, ch: 256, draw: (p) => fxBurst(p, u, "#fff3b0", 12, 30, 210), x, y: 1.7 + k * 0.2, z, w: 2.4, h: 2.4, soft: true });
        }
        break;
      }
      case 40: {
        st.places.push(person(cam, W.couch, -1.95, 0.47, -1.7, FRONT,
          { mode: "sit", expr: "smile", blink: bl(17), look: 0.2, light: 0, seed: 18 }, { mode: "stand", light: 0, seed: 18 }));
        blob(st, -1.95, 0.48, -1.7, 0.95);
        break;
      }
    }
  }
}


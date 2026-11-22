// Render the supermarket opening frame from NightShiftShort with the three.js + Remotion pipeline.
// usage: node scripts/nightshift-stills.mjs <outPrefix> <frame,frame,...> [scale] [gl] [fast]
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const [prefix, frames, scale = "1", gl = "angle-egl", fastArg = "false"] = process.argv.slice(2);
if (!prefix || !frames) throw new Error("usage: node scripts/nightshift-stills.mjs <outPrefix> <frame,frame,...> [scale] [gl] [fast]");

if (process.env.REMOTION_TMP) {
  fs.mkdirSync(process.env.REMOTION_TMP, { recursive: true });
  process.env.TEMP = process.env.TMP = process.env.REMOTION_TMP;
}
const browserExecutable = process.env.CHROME_PATH
  || "/home/codespace/.cache/puppeteer/chrome-headless-shell/linux-157.0.8103.78/chrome-headless-shell-linux64/chrome-headless-shell";
const chromiumOptions = { gl };
const inputProps = { fast: fastArg === "true" };

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
const composition = await selectComposition({ serveUrl, id: "NightShiftShort", browserExecutable, chromiumOptions, inputProps });
const onBrowserLog = (l) => { if (l.type === "error" || l.type === "warning") console.log(`[${l.type}]`, l.text.slice(0, 400)); };

for (const f of frames.split(",").map(Number)) {
  const t0 = Date.now();
  const output = `${prefix}${f}.jpg`;
  await renderStill({ composition, serveUrl, frame: f, output, imageFormat: "jpeg", jpegQuality: 92,
    scale: Number(scale), browserExecutable, chromiumOptions, inputProps,
    timeoutInMilliseconds: 240000, onBrowserLog });
  console.log("still", f, "->", output, ((Date.now() - t0) / 1000).toFixed(1) + "s");
}

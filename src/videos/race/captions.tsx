// Burned-in captions, timed to the narration word list (words.json). The reference short carries
// 1-3 word captions at the bottom center; we mirror that rhythm with our own cue list.
import React from "react";
import { AbsoluteFill } from "remotion";
import words from "../../../public/voice/words.json";

type W = { word: string; start: number; end: number };
const W_ = words as W[];

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, "");
const at = (w: string, from = 0): number => {
  const t = norm(w);
  for (let i = from; i < W_.length; i++) if (norm(W_[i].word) === t) return i;
  if (process.env.NODE_ENV !== "production") console.warn(`caption anchor not found: "${w}" (from ${from})`);
  return -1;
};

/** caption cues: text + the word index it snaps to (+ optional last word index for the hold span). */
type Cue = { text: string; i: number; j?: number };
const HOLD = 0.9;
const cues: Cue[] = (() => {
  const c: Cue[] = [];
  const push = (text: string, w: string, from = 0) => {
    const i = at(w, from);
    if (i >= 0) c.push({ text, i });
  };
  push("Everyone said Google was", "everyone");
  push("was finished.", "finished.");
  push("posted", "posted", 5);
  push("win the AI race", "race", 8);
  push("in the West.", "West.", 12);
  push("But how?", "how");
  push("chips.", "chips.", 20);
  push("for Nvidia", "Nvidia", 30);
  push("GPUs.", "GPUs.", 33);
  push("So you build", "build", 40);
  push("your own.", "own.", 42);
  push("Tensor Processing Unit", "Tensor", 45);
  push("TPU.", "TPU.", 50);
  push("data to train", "data", 52);
  push("your AI.", "AI.", 56);
  push("You own the largest", "largest", 67);
  push("video library", "library", 70);
  push("on Earth.", "Earth.", 72);
  push("500 HOURS / MINUTE", "hundreds", 74);
  push("every single minute.", "minute.", 82);
  push("to train your AI.", "AI.", 95);
  push("to be personal.", "personal.", 98);
  push("own products.", "products.", 105);
  push("lives.", "lives.", 110);
  push("looked", "looked", 115);
  push("at 15", "15", 119);
  push("Photos.", "Photos.", 121);
  push("visit", "visit", 130);
  push("Maps.", "Maps.", 134);
  push("browsing", "browsing", 143);
  push("3 AM", "3", 140);
  push("listen", "listen");
  push("Music.", "Music.");
  push("Who they", "talk", 158);
  push("Contacts.", "Contacts.", 162);
  push("Meet.", "Meet.", 167);
  push("Drive.", "Drive.", 174);
  push("Keep.", "Keep.", 180);
  push("Sheets.", "Sheets.", 186);
  push("Fitbit.", "Fitbit.", 191);
  push("passwords", "passwords", 194);
  push("manager.", "manager.", 198);
  push("their", "their", 201);
  push("reset", "reset", 206);
  push("in Gmail.", "Gmail.", 209);
  push("you own the world's", "world's", 213);
  push("Android.", "Android.", 219);
  push("7 out of 10 phones", "seven", 231);
  push("on Earth.", "Earth.", 236);
  push("iPhone.", "iPhone.", 242);
  push("in and picks", "picks", 249);
  push("the new Siri.", "Siri.", 253);
  push("dot is connected.", "connected.", 263);
  push("someone", "someone", 268);
  push("existed.", "existed.", 273);
  push("in Chrome", "Chrome", 281);
  push("on YouTube", "YouTube", 288);
  push("took.", "took.", 296);
  push("Where they went.", "went.", 298);
  push("a new class", "class", 305);
  push("Argon.", "Argon.", 309);
  push("you have", "have", 315);
  push("quantum", "quantum", 318);
  push("lab.", "lab.", 321);
  push("and now you own the AI race.", "race.", 338);
  push("lives.", "lives.", 344);
  push("you are watching", "watching", 349);
  push("the video on YouTube.", "YouTube.", 353);
  // auto-fill any word that no authored caption covers (guarantees 100% narration coverage)
  c.sort((a, b) => W_[a.i].start - W_[b.i].start);
  const endOf = (q: { i: number; j?: number }) => W_[q.j ?? q.i].end;
  const covered = (t: number) => {
    let cur: Cue | null = null;
    for (const q of c) if (t >= W_[q.i].start) cur = q;
    if (!cur) return false;
    return t <= endOf(cur) + HOLD;
  };
  const fill: Cue[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length) {
      const text = run.map((k) => W_[k].word).join(" ");
      fill.push({ text: text.charAt(0).toUpperCase() + text.slice(1), i: run[0], j: run[run.length - 1] });
      run = [];
    }
  };
  for (let k = 0; k < W_.length; k++) {
    if (!covered(W_[k].start)) {
      run.push(k);
      if (run.length >= 6) flush();
    } else flush();
  }
  flush();
  return c.concat(fill).sort((a, b) => W_[a.i].start - W_[b.i].start);
})();

export const Captions: React.FC<{ f: number }> = ({ f }) => {
  const t = f / 30;
  let cur: Cue | null = null;
  for (const q of cues) if (t >= W_[q.i].start) cur = q;
  if (!cur) return null;
  const wEnd = W_[cur.j ?? cur.i].end;
  if (t > wEnd + HOLD) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", pointerEvents: "none" }}>
      <div
        style={{
          marginBottom: 170, fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 800,
          fontSize: 66, color: "#fff", letterSpacing: 1, whiteSpace: "pre",
          textShadow: "0 0 6px rgba(0,0,0,.55)", WebkitTextStroke: "8px #101014",
          paintOrder: "stroke fill", transform: "translateZ(0)",
        }}
      >
        {cur.text}
      </div>
    </AbsoluteFill>
  );
};

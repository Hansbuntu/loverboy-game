// Draws every image in assets/ from code: node tools/make-art.js   (npm run art)
//
// Draws only images that are MISSING (add --force to redraw all). Output: assets/sprites/*.png (runner, spike, block), assets/tiles/tile-01..07.png (unlock icons),
//         assets/backgrounds/level-01..07.png (level scenes), assets/icons/* (favicon).
// The palettes come from js/config.js, so change a level's colours there and re-run this.
//
// These are the game's starting art. To use your own instead, just replace any PNG with the same name
// (or point config.js at a different file). Nothing else needs to change.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "../js/config.js";
import { Px, hex, mix, shade, WHITE } from "./pixel.js";
import { drawScene } from "./scenes.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORCE = process.argv.includes("--force");
// Only fills in images that are missing, so it can never overwrite art you generated yourself.
// Use --force to redraw everything (for example after changing a palette in config.js).
const out = (file, px) => {
  const p = path.join(root, file);
  if (fs.existsSync(p) && !FORCE) {
    console.log("kept ", file, "(already exists; --force to overwrite)");
    return;
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, px.toPNG());
  console.log("wrote", file, px.w + "x" + px.h);
};
const erase = (px, cx, cy, r) => {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) px.set(x, y, [0, 0, 0, 0]);
  }
};
const INK = hex("#1a1220");

// ---------- the runner: a small figure in a pink hoodie, 32x32 ----------
const SKIN = hex("#f0c39a"), HAIR = hex("#2b1f33"), HOOD = hex("#e0568a"), HOOD_D = hex("#b8386b");
const PANTS = hex("#35447a"), PANTS_D = hex("#26325c"), SHOE = hex("#f4f0ea");

function person(pose) {
  const p = new Px(32, 32);
  const b = pose.bob || 0;
  const arm = (to, c) => { p.line(15 + (to === pose.armL ? -1 : 4), 17 + b, to[0], to[1], c, 3); p.disk(to[0], to[1], 1.6, SKIN); };
  const leg = (to, c) => { p.line(17, 24 + b, to[0], to[1] - 1, c, 3); p.rect(Math.round(to[0]) - 2, Math.round(to[1]) - 1, 5, 2, SHOE); };

  arm(pose.armL, HOOD_D);                 // far arm and leg sit behind the body
  leg(pose.legL, PANTS_D);
  p.rect(12, 14 + b, 10, 11, HOOD);       // hoodie
  p.rect(12, 14 + b, 3, 11, HOOD_D);
  p.rect(13, 13 + b, 8, 2, HOOD_D);       // hood at the neck
  p.rect(16, 18 + b, 1, 1, WHITE); p.rect(18, 18 + b, 1, 1, WHITE); p.rect(16, 19 + b, 3, 1, WHITE); p.rect(17, 20 + b, 1, 1, WHITE);   // heart on the chest
  p.rect(12, 24 + b, 10, 2, PANTS);
  leg(pose.legR, PANTS);
  arm(pose.armR, HOOD);
  p.disk(17, 8 + b, 6, SKIN);             // head
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {   // hair: the top and back of the head
    if ((x - 16.5) ** 2 + (y - (7.5 + b)) ** 2 <= 6.6 ** 2 && (y <= 7 + b || x <= 12)) p.set(x, y, HAIR);
  }
  if (pose.eyes === "x") {
    p.set(19, 9 + b, INK); p.set(21, 9 + b, INK); p.set(20, 10 + b, INK); p.set(19, 11 + b, INK); p.set(21, 11 + b, INK);
  } else {
    p.rect(20, 9 + b, 2, 2, INK);
  }
  p.set(21, 12 + b, hex("#c2725f"));
  p.outline(INK);
  return p;
}

const POSES = {
  "run-1": { legR: [24, 30], legL: [9, 26], armR: [10, 21], armL: [25, 19], bob: 0 },
  "run-2": { legR: [19, 31], legL: [13, 27], armR: [13, 23], armL: [21, 23], bob: 1 },
  "run-3": { legR: [10, 27], legL: [24, 30], armR: [25, 19], armL: [9, 21], bob: 0 },
  "run-4": { legR: [13, 27], legL: [19, 31], armR: [21, 23], armL: [13, 23], bob: 1 },
  jump: { legR: [23, 27], legL: [16, 28], armR: [25, 12], armL: [9, 13], bob: 0 },
  fall: { legR: [21, 31], legL: [13, 30], armR: [27, 19], armL: [6, 18], bob: 0 }
};
for (const [name, pose] of Object.entries(POSES)) out(`assets/sprites/${name}.png`, person(pose));

const hurt = person({ legR: [22, 30], legL: [11, 30], armR: [26, 12], armL: [7, 12], bob: 0, eyes: "x" });
[0, 40, 75, 90].forEach((deg, i) => out(`assets/sprites/death-${i + 1}.png`, hurt.rotatedOnFloor(deg)));

// ---------- obstacles: light grey art that the game tints to each level's palette ----------
{
  const s = new Px(28, 28);
  s.poly([[1, 27], [14, 1], [27, 27]], hex("#f2f2f2"));
  s.poly([[14, 1], [27, 27], [14, 27]], hex("#bcbcbc"));
  s.poly([[14, 1], [17, 27], [14, 27]], hex("#d6d6d6"));
  s.line(14, 3, 3, 26, WHITE);
  s.outline(hex("#4a4a4a"));
  out("assets/sprites/spike.png", s);

  const b = new Px(16, 16);
  b.rect(0, 0, 16, 16, hex("#dcdcdc"));
  b.rect(0, 7, 16, 1, hex("#a0a0a0")); b.rect(0, 15, 16, 1, hex("#a0a0a0"));
  b.rect(3, 0, 1, 7, hex("#a0a0a0")); b.rect(11, 8, 1, 7, hex("#a0a0a0"));
  for (const [x, y] of [[6, 2], [9, 4], [1, 4], [14, 3], [5, 11], [8, 13], [14, 10], [2, 12]]) b.set(x, y, hex("#c4c4c4"));
  out("assets/sprites/block.png", b);

  const cap = new Px(16, 5);
  [WHITE, hex("#f0f0f0"), hex("#d0d0d0"), hex("#a8a8a8"), hex("#8c8c8c")].forEach((c, y) => cap.rect(0, y, 16, 1, c));
  out("assets/sprites/blockcap.png", cap);
}

// ---------- unlock tiles: one icon per track, in that level's palette ----------
function heart(p, cx, cy, s, c) {
  for (let y = Math.floor(cy - 1.4 * s); y <= Math.ceil(cy + 1.2 * s); y++) for (let x = Math.floor(cx - 1.3 * s); x <= Math.ceil(cx + 1.3 * s); x++) {
    const u = (x + 0.5 - cx) / s, v = -(y + 0.5 - cy) / s + 0.15;
    if ((u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0) p.set(x, y, c);
  }
}

const ICONS = [
  // 1 the closed gate: a key
  (p, a, g) => {
    p.disk(11, 12, 8, a); erase(p, 11, 12, 3.6);
    p.rect(17, 10, 13, 4, a); p.rect(24, 14, 3, 5, a); p.rect(28, 14, 3, 4, a);
    p.line(6, 8, 10, 5, g, 2); p.rect(18, 10, 10, 1, g);
  },
  // 2 the ember: a flame
  (p, a, g) => {
    p.poly([[16, 1], [23, 10], [27, 19], [24, 27], [16, 31], [8, 27], [5, 19], [9, 12], [13, 15], [14, 8]], a);
    p.poly([[16, 11], [21, 19], [19, 27], [16, 29], [12, 26], [11, 19], [14, 17]], g);
    p.poly([[16, 20], [18, 25], [16, 28], [14, 25]], WHITE);
  },
  // 3 the storm: lightning
  (p, a, g) => {
    p.poly([[20, 1], [7, 18], [14, 18], [10, 31], [25, 13], [17, 13], [24, 1]], a);
    p.poly([[20, 5], [12, 16], [18, 16], [15, 25], [21, 14], [15, 14], [21, 5]], g);
    p.poly([[19, 8], [15, 14], [17, 14]], WHITE);
  },
  // 4 the open hills: a rising sun
  (p, a, g) => {
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * Math.PI * 2;
      p.line(16 + Math.cos(t) * 11, 16 + Math.sin(t) * 11, 16 + Math.cos(t) * 15, 16 + Math.sin(t) * 15, a, 2);
    }
    p.disk(16, 16, 8, a); p.disk(16, 16, 5.5, g); p.disk(14, 14, 2, WHITE);
  },
  // 5 the twin mountains, mirrored: two hearts
  (p, a, g) => {
    heart(p, 10, 19, 6.2, a);
    heart(p, 22, 13, 6.2, g);
    p.rect(7, 13, 2, 1, WHITE); p.rect(20, 7, 2, 1, WHITE);
  },
  // 6 the quiet dome: a moon
  (p, a, g) => {
    p.disk(15, 16, 12, a); erase(p, 22, 12, 10);
    p.disk(8, 14, 2, g);
    p.rect(24, 21, 1, 5, WHITE); p.rect(22, 23, 5, 1, WHITE);
  },
  // 7 the open gate: a crown
  (p, a, g) => {
    p.poly([[3, 26], [3, 9], [10, 16], [16, 5], [22, 16], [29, 9], [29, 26]], a);
    p.rect(3, 22, 26, 5, g);
    for (const x of [9, 16, 23]) p.disk(x, 24.5, 1.8, hex("#ff7fa8"));
    p.rect(5, 12, 1, 6, WHITE);
  }
];

CONFIG.levels.forEach((level, i) => {
  const p = new Px(32, 32);
  ICONS[i](p, hex(level.colors.accent), mix(hex(level.colors.glow), WHITE, 0.35));
  p.outline(shade(hex(level.colors.skyDeep), 0.6));
  out(`assets/tiles/tile-${String(i + 1).padStart(2, "0")}.png`, p);
});

// ---------- level scenes (320x200, shown at 2x) ----------
CONFIG.levels.forEach((level, i) => {
  out(`assets/backgrounds/level-${String(i + 1).padStart(2, "0")}.png`, drawScene(i, level.colors));
});

// ---------- favicon: a pink pixel heart on a dark tile ----------
function faviconBase(n) {
  const p = new Px(n, n);
  const c = hex("#16181c");
  p.rect(0, 0, n, n, c);
  for (const [x, y] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]]) p.set(x, y, [0, 0, 0, 0]);
  heart(p, n / 2, n / 2 + n * 0.04, n * 0.27, hex("#ff5d8f"));
  p.rect(Math.round(n * 0.3), Math.round(n * 0.3), Math.max(1, Math.round(n * 0.08)), Math.max(1, Math.round(n * 0.08)), WHITE);
  return p;
}
out("assets/icons/favicon-16.png", faviconBase(16));
out("assets/icons/favicon-32.png", faviconBase(32));
out("assets/icons/apple-touch-icon.png", faviconBase(36).scale(5));

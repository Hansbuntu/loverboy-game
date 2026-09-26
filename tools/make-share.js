// Makes the link-preview image (assets/share/og-image.png, 1200x630): a level background blown up as
// crisp pixel art, with the title in a small hand-made pixel font.
//
//   node tools/make-share.js [--bg assets/backgrounds/level-07.png] [--out assets/share/og-image.png]
import fs from "node:fs";
import path from "node:path";
import { Px } from "./pixel.js";
import { loadImage } from "./load-image.js";

const argv = process.argv.slice(2);
const flag = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const bgFile = flag("--bg", "assets/backgrounds/level-07.png");
const out = flag("--out", "assets/share/og-image.png");
const W = 1200, H = 630;

// 5x7 capitals (only what the text needs)
const FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "01010", "01010", "00100"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "'": ["1", "1", "0", "0", "0", "0", "0"],
  " ": ["000", "000", "000", "000", "000", "000", "000"]
};
const HEART = [".##...##.", "####.####", "#########", "#########", ".#######.", "..#####..", "...###...", "....#...."];

const bg = loadImage(bgFile);
const img = new Px(W, H);
// cover-fit at a whole-number scale, centred
const scale = Math.ceil(Math.max(W / bg.w, H / bg.h));
const ox = Math.floor((W - bg.w * scale) / 2), oy = Math.floor((H - bg.h * scale) / 2) + 60;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const sx = Math.min(bg.w - 1, Math.max(0, Math.floor((x - ox) / scale)));
    const sy = Math.min(bg.h - 1, Math.max(0, Math.floor((y - oy) / scale)));
    const i = (sy * bg.w + sx) * 4;
    // darken toward the middle band so the title reads
    const t = 1 - 0.55 * Math.exp(-(((y - H * 0.46) / (H * 0.3)) ** 2));
    img.set(x, y, [bg.data[i] * t, bg.data[i + 1] * t, bg.data[i + 2] * t, 255]);
  }
}

function textWidth(s, px) {
  return [...s].reduce((w, ch) => w + ((FONT[ch] || FONT[" "])[0].length + 1) * px, -px);
}
function drawText(s, cx, y, px, color, shadow) {
  let x = Math.round(cx - textWidth(s, px) / 2);
  for (const ch of s) {
    const g = FONT[ch] || FONT[" "];
    g.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== "1") continue;
        for (const [dy, col] of shadow) img.rect(x + c * px, y + r * px + dy, px, px, col);
        img.rect(x + c * px, y + r * px, px, px, color);
      }
    });
    x += (g[0].length + 1) * px;
  }
}

const pink = [255, 93, 143, 255], deep = [196, 58, 108, 255], darkest = [125, 31, 69, 255], white = [255, 255, 255, 255];
// heart
const hp = 12, hx = Math.round(W / 2 - (9 * hp) / 2), hy = 118;
HEART.forEach((row, r) => { for (let c = 0; c < 9; c++) if (row[c] === "#") img.rect(hx + c * hp, hy + r * hp, hp, hp, pink); });
img.rect(hx + hp, hy + hp, hp, hp, white);
drawText("LOVERBOY O'CLOCK", W / 2, 250, 12, white, [[12, pink], [20, deep], [28, darkest]]);
drawText("PLAY TO UNLOCK THE TAPE", W / 2, 400, 6, [255, 236, 200, 255], [[6, [60, 30, 20, 255]]]);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, img.toPNG());
console.log("wrote", out, `${W}x${H}`);

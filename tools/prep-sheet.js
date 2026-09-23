// Turns an AI-generated asset sheet into the game's image files.
//
//   node tools/prep-sheet.js path/to/sheet.png [--report] [--out assets]
//
// The sheet is expected to look like the one from the art brief: a flat magenta background, a top row of
// 10 runner frames (4 run, 2 air, 4 death), and a bottom row of 3 obstacles then 7 unlock icons.
// It cuts out the background, finds every shape, ignores the text labels, then scales and cleans each one:
//   runner frames -> assets/source/run-1..4 (kept), then an 8-frame run cycle -> assets/sprites/run-1..8, plus jump, fall, death-1..4
//   obstacles     -> assets/sprites/spike, block, blockcap             (made light grey: the game tints them)
//   icons         -> assets/tiles/tile-01..07
// --report only prints what it found. Nothing is written.
import fs from "node:fs";
import path from "node:path";
import { decodePNG } from "./png.js";
import { Px } from "./pixel.js";
import { buildRunCycle } from "./build-run-cycle.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const report = args.includes("--report");
const outRoot = args.includes("--out") ? args[args.indexOf("--out") + 1] : "assets";
if (!file) { console.error("usage: node tools/prep-sheet.js sheet.png [--report] [--out assets]"); process.exit(1); }

const SPRITE_CANVAS = 40;   // runner frames are 40x40, character about 36 tall
const RUN_HEIGHT = 36;
const ICON_CANVAS = 32;

const sheet = decodePNG(fs.readFileSync(file));
const { w: W, h: H, data } = sheet;

// ---------- 1. cut out the background ----------
// Background is the sheet's corner colour. Anything in the magenta family that is bright enough is background
// or its blended edge; dark outline pixels stay.
const bg = [0, 1, 2].map((c) => data[c] + data[(W - 1) * 4 + c] + data[(H - 1) * W * 4 + c]).map((v) => v / 3);
const isBackground = (r, g, b) => {
  const d = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
  if (d < 70) return true;
  return Math.abs(r - b) < 45 && g < 0.45 * Math.max(r, b) && Math.max(r, b) > 90;   // blended purple fringe
};
const keep = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) keep[i] = isBackground(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) ? 0 : 1;

// ---------- 2. find shapes (connected areas) ----------
const label = new Int32Array(W * H);
const shapes = [];
for (let start = 0; start < W * H; start++) {
  if (!keep[start] || label[start]) continue;
  const id = shapes.length + 1;
  const stack = [start];
  label[start] = id;
  let minX = W, minY = H, maxX = 0, maxY = 0, count = 0;
  while (stack.length) {
    const p = stack.pop();
    const x = p % W, y = (p / W) | 0;
    count++;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (keep[q] && !label[q]) { label[q] = id; stack.push(q); }
    }
  }
  shapes.push({ id, minX, minY, maxX, maxY, count, w: maxX - minX + 1, h: maxY - minY + 1 });
}
// text letters are small; sprites and icons are big
const big = shapes.filter((s) => s.count >= 1500);

if (report) {
  console.log(`sheet ${W}x${H}, background colour`, bg.map(Math.round), `| ${shapes.length} shapes, ${big.length} large:`);
  for (const s of big.sort((a, b) => a.minY - b.minY || a.minX - b.minX)) console.log(`  x ${s.minX}-${s.maxX}  y ${s.minY}-${s.maxY}  (${s.w}x${s.h})  ${s.count}px`);
  process.exit(0);
}

// ---------- 3. sort into the sheet's two rows ----------
const rowSplit = H * 0.55;
const top = big.filter((s) => (s.minY + s.maxY) / 2 < rowSplit).sort((a, b) => a.minX - b.minX);
const bottom = big.filter((s) => (s.minY + s.maxY) / 2 >= rowSplit).sort((a, b) => a.minX - b.minX);
if (top.length !== 10 || bottom.length !== 10) {
  console.error(`Expected 10 runner frames on the top row and 10 obstacles/icons on the bottom row, found ${top.length} and ${bottom.length}.`);
  console.error("Run with --report to see what was found. (A frame that split in two, or two that touched, will throw the count off.)");
  process.exit(1);
}

// ---------- 4. cut, scale, clean ----------
const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : y * W + x);

// The shape as an RGBA image, everything outside it transparent.
function extract(s, inset = 0) {
  const ix = Math.round(s.w * inset), iy = Math.round(s.h * inset);
  const img = new Px(s.w - 2 * ix, s.h - 2 * iy);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const p = at(s.minX + ix + x, s.minY + iy + y);
    if (p !== null && label[p] === s.id) img.set(x, y, [data[p * 4], data[p * 4 + 1], data[p * 4 + 2], 255]);
  }
  return img;
}

// Shrink by averaging (weighted by opacity so the removed background can't bleed in), into a w x h box at (ox, oy).
function shrinkInto(dst, src, scaleX, scaleY, ox, oy) {
  const tw = Math.max(1, Math.round(src.w * scaleX)), th = Math.max(1, Math.round(src.h * scaleY));
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const x0 = (x * src.w) / tw, x1 = ((x + 1) * src.w) / tw, y0 = (y * src.h) / th, y1 = ((y + 1) * src.h) / th;
    let r = 0, g = 0, b = 0, a = 0, area = 0;
    for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
      const wgt = (Math.min(x1, sx + 1) - Math.max(x0, sx)) * (Math.min(y1, sy + 1) - Math.max(y0, sy));
      const c = src.get(sx, sy);
      area += wgt;
      if (c[3] > 0) { r += c[0] * wgt; g += c[1] * wgt; b += c[2] * wgt; a += wgt; }
    }
    if (a / area >= 0.5) dst.set(ox + x, oy + y, [Math.round(r / a), Math.round(g / a), Math.round(b / a), 255]);   // hard edges: pixel art
  }
  return { w: tw, h: th };
}

// Reduce to a small shared palette so the result reads as crisp pixel art.
function quantize(images, k) {
  const colors = [];
  for (const im of images) for (let i = 0; i < im.d.length; i += 4) if (im.d[i + 3]) colors.push([im.d[i], im.d[i + 1], im.d[i + 2]]);
  let centers = colors.filter((_, i) => i % Math.max(1, Math.floor(colors.length / k)) === 0).slice(0, k);
  for (let iter = 0; iter < 12; iter++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const c of colors) {
      let best = 0, bd = Infinity;
      for (let j = 0; j < centers.length; j++) {
        const d = (c[0] - centers[j][0]) ** 2 + (c[1] - centers[j][1]) ** 2 + (c[2] - centers[j][2]) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
      sum[best][0] += c[0]; sum[best][1] += c[1]; sum[best][2] += c[2]; sum[best][3]++;
    }
    centers = centers.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c));
  }
  for (const im of images) for (let i = 0; i < im.d.length; i += 4) {
    if (!im.d[i + 3]) continue;
    let best = 0, bd = Infinity;
    for (let j = 0; j < centers.length; j++) {
      const d = (im.d[i] - centers[j][0]) ** 2 + (im.d[i + 1] - centers[j][1]) ** 2 + (im.d[i + 2] - centers[j][2]) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    im.d[i] = centers[best][0]; im.d[i + 1] = centers[best][1]; im.d[i + 2] = centers[best][2];
  }
}

// Stretch the brightness range so it becomes light grey (the game multiplies it by each level's colour).
function toLightGrey(im, low = 0.52) {
  let lo = 255, hi = 0;
  for (let i = 0; i < im.d.length; i += 4) if (im.d[i + 3]) { const l = 0.3 * im.d[i] + 0.59 * im.d[i + 1] + 0.11 * im.d[i + 2]; lo = Math.min(lo, l); hi = Math.max(hi, l); }
  for (let i = 0; i < im.d.length; i += 4) {
    if (!im.d[i + 3]) continue;
    const l = 0.3 * im.d[i] + 0.59 * im.d[i + 1] + 0.11 * im.d[i + 2];
    const v = Math.round(255 * (low + (1 - low) * ((l - lo) / (hi - lo || 1))));
    im.d[i] = im.d[i + 1] = im.d[i + 2] = v;
  }
}

const write = (rel, im) => {
  const p = path.join(outRoot, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, im.toPNG());
  console.log("wrote", rel, im.w + "x" + im.h);
};

// runner: one scale for every frame (so the character stays the same size), feet on the bottom row
const frames = top.map((s) => ({ s, img: extract(s) }));
const runAvg = frames.slice(0, 4).reduce((sum, f) => sum + f.s.h, 0) / 4;
const scale = RUN_HEIGHT / runAvg;
const sprites = frames.map(({ img }) => {
  const out = new Px(SPRITE_CANVAS, SPRITE_CANVAS);
  const tw = Math.round(img.w * scale), th = Math.round(img.h * scale);
  shrinkInto(out, img, tw / img.w, th / img.h, Math.round((SPRITE_CANVAS - tw) / 2), SPRITE_CANVAS - th);
  return out;
});
const names = ["run-1", "run-2", "run-3", "run-4", "jump", "fall", "death-1", "death-2", "death-3", "death-4"];

// obstacles (light grey)
const [spikeS, brickS, capS] = bottom.slice(0, 3);
const spike = new Px(28, 28); shrinkInto(spike, extract(spikeS), 28 / spikeS.w, 28 / spikeS.h, 0, 0); toLightGrey(spike);
const brickSrc = extract(brickS, 0.1);   // the inside of the tile: its outer border would show as a grid when tiled
const brick = new Px(16, 16); shrinkInto(brick, brickSrc, 16 / brickSrc.w, 16 / brickSrc.h, 0, 0); toLightGrey(brick);
const capSrc = extract(capS, 0.12);
const cap = new Px(16, 5); shrinkInto(cap, capSrc, 16 / capSrc.w, 5 / capSrc.h, 0, 0); toLightGrey(cap, 0.45);
// tiles must be fully opaque
for (const im of [brick, cap]) for (let i = 0; i < im.d.length; i += 4) if (!im.d[i + 3]) { im.d[i] = im.d[i + 1] = im.d[i + 2] = 200; im.d[i + 3] = 255; }

// icons
const icons = bottom.slice(3).map((s) => {
  const im = extract(s);
  const k = (ICON_CANVAS - 2) / Math.max(im.w, im.h);
  const tw = Math.round(im.w * k), th = Math.round(im.h * k);
  const out = new Px(ICON_CANVAS, ICON_CANVAS);
  shrinkInto(out, im, tw / im.w, th / im.h, Math.round((ICON_CANVAS - tw) / 2), Math.round((ICON_CANVAS - th) / 2));
  return out;
});

quantize(sprites, 24);
quantize(icons, 28);
// The AI's 4 run frames are kept in assets/source/ and turned into a proper 8-frame cycle (see build-run-cycle.js).
sprites.forEach((im, i) => write(i < 4 ? `source/run-${i + 1}.png` : `sprites/${names[i]}.png`, im));
const cycle = buildRunCycle(path.resolve(outRoot, ".."));
console.log(`built the ${cycle.frames}-frame run cycle -> sprites/run-1..${cycle.frames}.png`);
write("sprites/spike.png", spike);
write("sprites/block.png", brick);
write("sprites/blockcap.png", cap);
icons.forEach((im, i) => write(`tiles/tile-${String(i + 1).padStart(2, "0")}.png`, im));
console.log(`\nDone. Runner scale ${scale.toFixed(3)} (character ~${RUN_HEIGHT}px tall in a ${SPRITE_CANVAS}x${SPRITE_CANVAS} frame).`);

// Turns the second AI sheet (per-world obstacles + extra runner poses) into game images.
//
//   node tools/prep-extras.js sheet.webp [--report] [--out assets]
//
// Expected layout, on a flat magenta background:
//   7 rows at the top, one per level: a spike on the left, a square wall block on the right
//     -> assets/obstacles/spike-01..07.png (28x28) and block-01..07.png (22x22 tile)
//   one row of 8 character poses along the bottom: 4 idle (nodding), 3 victory, 1 "whoa"
//     -> assets/sprites/idle-1..4.png, win-1..3.png, whoa.png (40x40, feet on the bottom row)
// It also prints where each pose's head and neck are (for the headphones and scarf in js/hero.js).
import fs from "node:fs";
import path from "node:path";
import { Px } from "./pixel.js";
import { loadImage } from "./load-image.js";

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
const report = args.includes("--report");
const outRoot = args.includes("--out") ? args[args.indexOf("--out") + 1] : "assets";
if (!file) { console.error("usage: node tools/prep-extras.js sheet.png [--report] [--out assets]"); process.exit(1); }

const FRAME = 40;           // runner frames are 40x40
const STAND = 35;           // a standing pose is this tall (the running frames are about 36 with bent legs)
const SPIKE = 28;
const TILE = 22;            // two tiles make a low block (44 px)

const { w: W, h: H, data } = loadImage(file);

// ---------- background ----------
const bg = [0, 1, 2].map((c) => (data[c] + data[(W - 1) * 4 + c] + data[((H - 1) * W) * 4 + c]) / 3);
const isBackground = (r, g, b) => {
  if (Math.hypot(r - bg[0], g - bg[1], b - bg[2]) < 80) return true;
  return g < 70 && r > 170 && b > 170 && Math.abs(r - b) < 70;                  // magenta fringe (pink art keeps its green)
};
const keep = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) keep[i] = isBackground(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) ? 0 : 1;

// ---------- connected shapes ----------
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
  shapes.push({ ids: [id], minX, minY, maxX, maxY, count });
}
const parts = shapes.filter((s) => s.count >= 25);           // drop specks of noise

// Merge shapes whose boxes (grown by `pad`) overlap: a pose plus its loose bits (sweat marks, a detached hand).
function mergeGroups(list, pad) {
  const groups = list.map((s) => ({ ...s, ids: [...s.ids] }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < groups.length && !changed; i++) {
      for (let j = i + 1; j < groups.length && !changed; j++) {
        const a = groups[i], b = groups[j];
        if (a.minX - pad <= b.maxX && b.minX - pad <= a.maxX && a.minY - pad <= b.maxY && b.minY - pad <= a.maxY) {
          a.ids.push(...b.ids); a.count += b.count;
          a.minX = Math.min(a.minX, b.minX); a.minY = Math.min(a.minY, b.minY); a.maxX = Math.max(a.maxX, b.maxX); a.maxY = Math.max(a.maxY, b.maxY);
          groups.splice(j, 1);
          changed = true;
        }
      }
    }
  }
  return groups.map((g) => ({ ...g, w: g.maxX - g.minX + 1, h: g.maxY - g.minY + 1, cx: (g.minX + g.maxX) / 2, cy: (g.minY + g.maxY) / 2 }));
}

// the character row is the lowest band (tall shapes reaching the bottom); everything above it is obstacles,
// which sit close together, so they are grouped more tightly
const lowest = Math.max(...parts.map((s) => s.maxY));
const tall = mergeGroups(parts, 14).filter((g) => g.maxY > lowest - H * 0.12 && g.h > H * 0.12);
const bandTop = Math.min(...tall.map((g) => g.minY)) - 8;
const people = mergeGroups(parts.filter((s) => s.minY >= bandTop), 14).filter((g) => g.count >= 400).sort((a, b) => a.minX - b.minX);
const obstacles = mergeGroups(parts.filter((s) => s.maxY < bandTop), 3).filter((g) => g.count >= 400);
const groups = [...obstacles, ...people];

if (report) {
  console.log(`sheet ${W}x${H}, background`, bg.map(Math.round), `| ${groups.length} groups: ${obstacles.length} obstacle pieces, ${people.length} poses`);
  for (const g of groups.sort((a, b) => a.minY - b.minY || a.minX - b.minX)) console.log(`  x ${g.minX}-${g.maxX}  y ${g.minY}-${g.maxY}  (${g.w}x${g.h})  ${g.count}px  ${people.includes(g) ? "pose" : "obstacle"}`);
  process.exit(0);
}

// obstacle rows: cluster by height, then left = spike, right = block
const rows = [];
for (const g of obstacles.sort((a, b) => a.cy - b.cy)) {
  const row = rows.find((r) => Math.abs(r.cy - g.cy) < g.h * 0.6);
  if (row) row.items.push(g); else rows.push({ cy: g.cy, items: [g] });
}
if (rows.length !== 7 || rows.some((r) => r.items.length !== 2) || people.length !== 8) {
  console.error(`Expected 7 obstacle rows of 2 (spike, block) and 8 poses; found ${rows.map((r) => r.items.length).join(",")} and ${people.length}. Run with --report.`);
  process.exit(1);
}

// ---------- cut and shrink ----------
function extract(g, inset = 0) {
  const ix = Math.round(g.w * inset), iy = Math.round(g.h * inset);
  const img = new Px(g.w - 2 * ix, g.h - 2 * iy);
  const ids = new Set(g.ids);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const p = (g.minY + iy + y) * W + g.minX + ix + x;
    if (ids.has(label[p])) img.set(x, y, [data[p * 4], data[p * 4 + 1], data[p * 4 + 2], 255]);
  }
  return img;
}

// Shrink by averaging (weighted by opacity, so the cut-out background can't bleed in), into dst at (ox, oy).
function shrinkInto(dst, src, tw, th, ox, oy, solid = false) {
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const x0 = (x * src.w) / tw, x1 = ((x + 1) * src.w) / tw, y0 = (y * src.h) / th, y1 = ((y + 1) * src.h) / th;
    let r = 0, g = 0, b = 0, a = 0, area = 0;
    for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
      const wgt = (Math.min(x1, sx + 1) - Math.max(x0, sx)) * (Math.min(y1, sy + 1) - Math.max(y0, sy));
      const c = src.get(sx, sy);
      area += wgt;
      if (c[3] > 0) { r += c[0] * wgt; g += c[1] * wgt; b += c[2] * wgt; a += wgt; }
    }
    if (a > 0 && (solid || a / area >= 0.5)) dst.set(ox + x, oy + y, [Math.round(r / a), Math.round(g / a), Math.round(b / a), 255]);
  }
}

// a small shared palette per set, so each reads as crisp pixel art
function quantize(images, k) {
  const colors = [];
  for (const im of images) for (let i = 0; i < im.d.length; i += 4) if (im.d[i + 3]) colors.push([im.d[i], im.d[i + 1], im.d[i + 2]]);
  if (!colors.length) return;
  let centers = colors.filter((_, i) => i % Math.max(1, Math.floor(colors.length / k)) === 0).slice(0, k);
  const nearest = (c) => {
    let best = 0, bd = Infinity;
    for (let j = 0; j < centers.length; j++) {
      const d = (c[0] - centers[j][0]) ** 2 + (c[1] - centers[j][1]) ** 2 + (c[2] - centers[j][2]) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  };
  for (let iter = 0; iter < 12; iter++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const c of colors) { const j = nearest(c); sum[j][0] += c[0]; sum[j][1] += c[1]; sum[j][2] += c[2]; sum[j][3]++; }
    centers = centers.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c));
  }
  for (const im of images) for (let i = 0; i < im.d.length; i += 4) {
    if (!im.d[i + 3]) continue;
    const c = centers[nearest([im.d[i], im.d[i + 1], im.d[i + 2]])];
    im.d[i] = Math.round(c[0]); im.d[i + 1] = Math.round(c[1]); im.d[i + 2] = Math.round(c[2]);
  }
}

const write = (rel, im) => {
  const p = path.join(outRoot, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, im.toPNG());
  console.log("wrote", rel, im.w + "x" + im.h);
};

// ---------- obstacles ----------
const n2 = (i) => String(i + 1).padStart(2, "0");
rows.forEach((row, i) => {
  const [sp, bl] = row.items.sort((a, b) => a.minX - b.minX);
  const spike = new Px(SPIKE, SPIKE);
  shrinkInto(spike, extract(sp), SPIKE, SPIKE, 0, 0);
  const block = new Px(TILE, TILE);
  shrinkInto(block, extract(bl), TILE, TILE, 0, 0, true);
  for (let k = 0; k < block.d.length; k += 4) if (!block.d[k + 3]) { block.d[k + 3] = 255; }   // tiles are solid
  quantize([spike, block], 14);
  write(`obstacles/spike-${n2(i)}.png`, spike);
  write(`obstacles/block-${n2(i)}.png`, block);
});

// ---------- poses: one scale for all, from the standing idle frames ----------
const standH = people.slice(0, 4).reduce((s, g) => s + g.h, 0) / 4;
const baseline = Math.max(...people.map((g) => g.maxY));
const scale = STAND / standH;
const names = ["idle-1", "idle-2", "idle-3", "idle-4", "win-1", "win-2", "win-3", "whoa"];
const frames = people.map((g) => {
  const img = extract(g);
  const out = new Px(FRAME, FRAME);
  const tw = Math.round(img.w * scale), th = Math.round(img.h * scale);
  const lift = Math.round((baseline - g.maxY) * scale);                // an airborne pose stays up in the air
  // centre on the feet (the bottom fifth of the pose), so the runner doesn't shift sideways between poses
  let fx = 0, fn = 0;
  for (let y = Math.floor(img.h * 0.8); y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.get(x, y)[3]) { fx += x; fn++; }
  const feetX = fn ? fx / fn : img.w / 2;
  const ox = Math.round(FRAME / 2 - feetX * scale);
  shrinkInto(out, img, tw, th, ox, Math.max(0, FRAME - th - lift));
  return out;
});
quantize(frames, 26);
frames.forEach((im, i) => write(`sprites/${names[i]}.png`, im));

// ---------- head / neck anchors for the headphones and scarf ----------
const skin = (c) => c[3] && c[0] >= 0x55 && c[0] <= 0xc0 && c[1] >= 0x25 && c[1] <= 0x70 && c[2] <= 0x55 && c[0] > c[1] + 0x18;
console.log("\nanchors (paste into ANCHORS in js/hero.js):");
frames.forEach((im, i) => {
  let top = FRAME, tx = 0;
  for (let y = 0; y < FRAME && top === FRAME; y++) for (let x = 0; x < FRAME; x++) if (im.get(x, y)[3]) { top = y; tx = x; break; }
  const face = [];
  for (let y = top; y < Math.min(FRAME, top + 14); y++) for (let x = 0; x < FRAME; x++) if (skin(im.get(x, y))) face.push([x, y]);
  if (!face.length) { console.log(`  "${names[i]}": (no face found)`); return; }
  const fy0 = Math.min(...face.map((p) => p[1]));
  const upper = face.filter((p) => p[1] <= fy0 + 5);
  const fx0 = Math.min(...upper.map((p) => p[0])), fx1 = Math.max(...upper.map((p) => p[0]));
  let hx0 = FRAME, hx1 = 0;                                            // hair width at the eyes
  for (let x = 0; x < FRAME; x++) if (im.get(x, fy0 + 1)[3]) { hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); }
  const front = Math.abs((fx0 + fx1) / 2 - (hx0 + hx1) / 2) < 1.6;
  const neckY = Math.max(...face.map((p) => p[1])) + 1;
  const a = front
    ? `{ front: true, ears: [[${hx0}, ${fy0 + 2}], [${hx1}, ${fy0 + 2}]], top: [${Math.round((hx0 + hx1) / 2)}, ${top}], neck: [${fx0}, ${neckY}] }`
    : `{ ear: [${fx0 - 1}, ${fy0 + 2}], top: [${tx}, ${top}], neck: [${fx0 - 2}, ${neckY}] }`;
  console.log(`  "${names[i]}": ${a},`);
});
console.log(`\nDone. Pose scale ${scale.toFixed(3)}.`);

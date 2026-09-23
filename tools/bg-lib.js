// The image steps used to turn an AI illustration into game-ready pixel art (kept separate so they can be tested).
import { Px, bayer } from "./pixel.js";

// Which level (1-7) a file belongs to, from a number in its name: level-03.png, bg5.webp, "4 hills.png".
// Numbers glued to other digits (IMG_2034) don't count.
export function levelFromName(fileName, max = 7) {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.[^.]*$/, "");
  const m = /(?:^|[^0-9])0?([1-9])(?![0-9])/.exec(base);
  const n = m ? Number(m[1]) : null;
  return n !== null && n >= 1 && n <= max ? n : null;
}

function toPx(img) {
  const p = new Px(img.w, img.h);
  p.d.set(img.data);
  return p;
}

// Centre-crop to a width:height ratio (16:10 = 1.6). Returns a new Px.
export function cropToAspect(img, aspect = 1.6) {
  const src = img instanceof Px ? img : toPx(img);
  let cw = src.w, ch = src.h;
  if (src.w / src.h > aspect) cw = Math.round(src.h * aspect);
  else ch = Math.round(src.w / aspect);
  const x0 = Math.floor((src.w - cw) / 2), y0 = Math.floor((src.h - ch) / 2);
  const out = new Px(cw, ch);
  for (let y = 0; y < ch; y++) {
    const from = ((y0 + y) * src.w + x0) * 4;
    out.d.set(src.d.subarray(from, from + cw * 4), y * cw * 4);
  }
  return out;
}

// Shrink (or enlarge) by averaging every source pixel that falls under each new pixel. Opaque result.
export function boxResize(src, w, h) {
  const out = new Px(w, h);
  for (let y = 0; y < h; y++) {
    const y0 = (y * src.h) / h, y1 = ((y + 1) * src.h) / h;
    for (let x = 0; x < w; x++) {
      const x0 = (x * src.w) / w, x1 = ((x + 1) * src.w) / w;
      let r = 0, g = 0, b = 0, area = 0;
      for (let sy = Math.floor(y0); sy < Math.min(src.h, Math.ceil(y1)); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.min(src.w, Math.ceil(x1)); sx++) {
          const wgt = wy * (Math.min(x1, sx + 1) - Math.max(x0, sx));
          const i = (sy * src.w + sx) * 4;
          const a = src.d[i + 3] / 255;                 // see-through pixels count as black
          r += src.d[i] * a * wgt; g += src.d[i + 1] * a * wgt; b += src.d[i + 2] * a * wgt; area += wgt;
        }
      }
      const o = (y * w + x) * 4;
      out.d[o] = r / area; out.d[o + 1] = g / area; out.d[o + 2] = b / area; out.d[o + 3] = 255;
    }
  }
  return out;
}

// Reduce to k colours (k-means), optionally with ordered dithering (spread 0-1) for the classic dotted pixel-art look.
export function quantize(px, k = 48, spread = 0) {
  const n = px.w * px.h;
  const sample = [];
  for (let i = 0; i < n; i += 3) sample.push([px.d[i * 4], px.d[i * 4 + 1], px.d[i * 4 + 2]]);
  sample.sort((a, b) => 0.3 * a[0] + 0.59 * a[1] + 0.11 * a[2] - (0.3 * b[0] + 0.59 * b[1] + 0.11 * b[2]));
  let centers = Array.from({ length: Math.min(k, sample.length) }, (_, i) => sample[Math.floor(((i + 0.5) * sample.length) / Math.min(k, sample.length))].slice());

  const nearest = (r, g, b) => {
    let best = 0, bd = Infinity;
    for (let j = 0; j < centers.length; j++) {
      const c = centers[j], d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  };
  for (let iter = 0; iter < 10; iter++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const c of sample) { const j = nearest(c[0], c[1], c[2]); sum[j][0] += c[0]; sum[j][1] += c[1]; sum[j][2] += c[2]; sum[j][3]++; }
    centers = centers.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c));
  }
  centers = centers.map((c) => c.map(Math.round));

  const out = new Px(px.w, px.h);
  for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
    const i = (y * px.w + x) * 4;
    const t = spread ? (bayer(x, y) - 0.5) * 64 * spread : 0;
    const c = centers[nearest(px.d[i] + t, px.d[i + 1] + t, px.d[i + 2] + t)];
    out.d[i] = c[0]; out.d[i + 1] = c[1]; out.d[i + 2] = c[2]; out.d[i + 3] = 255;
  }
  return out;
}

// image ({w,h,data} or Px) -> a w x h pixel-art background.
export function processBackground(img, { w = 320, h = 200, colors = 48, dither = 0.12 } = {}) {
  const cropped = cropToAspect(img, w / h);
  return quantize(boxResize(cropped, w, h), colors, dither);
}

export function countColors(px) {
  const seen = new Set();
  for (let i = 0; i < px.d.length; i += 4) seen.add((px.d[i] << 16) | (px.d[i + 1] << 8) | px.d[i + 2]);
  return seen.size;
}

// ---------- backgrounds drawn together on one sheet ----------

// Finds the rectangular panels on a sheet whose panels are separated by a flat gutter colour (the colour at the
// corners, magenta in the art brief). Returns their boxes in reading order: top row left to right, then the next row.
// opts.minArea: smallest panel, as a share of the whole sheet (default 1.5%)
export function findPanels(img, { minArea = 0.015, tolerance = 60 } = {}) {
  const { w, h, data } = img;
  const corner = [0, 1, 2].map((c) => (data[c] + data[(w - 1) * 4 + c] + data[(h - 1) * w * 4 + c] + data[((h - 1) * w + w - 1) * 4 + c]) / 4);
  const keep = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const d = Math.hypot(data[i * 4] - corner[0], data[i * 4 + 1] - corner[1], data[i * 4 + 2] - corner[2]);
    keep[i] = d > tolerance ? 1 : 0;
  }
  const seen = new Uint8Array(w * h);
  const found = [];
  const stack = [];
  for (let start = 0; start < w * h; start++) {
    if (!keep[start] || seen[start]) continue;
    let minX = w, minY = h, maxX = 0, maxY = 0, count = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p / w) | 0;
      count++;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0 && keep[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < w - 1 && keep[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && keep[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
      if (y < h - 1 && keep[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    // a real panel is big and (nearly) a solid rectangle; captions, stray marks and torn shapes are not
    if (bw * bh >= minArea * w * h && count / (bw * bh) >= 0.8) found.push({ x: minX, y: minY, w: bw, h: bh });
  }
  // reading order: group into rows by vertical position, then left to right
  found.sort((a, b) => a.y - b.y);
  const rows = [];
  for (const p of found) {
    const row = rows.find((r) => Math.abs(r.cy - (p.y + p.h / 2)) < p.h * 0.5);
    if (row) { row.items.push(p); row.cy = row.items.reduce((s, q) => s + q.y + q.h / 2, 0) / row.items.length; }
    else rows.push({ cy: p.y + p.h / 2, items: [p] });
  }
  return rows.sort((a, b) => a.cy - b.cy).flatMap((r) => r.items.sort((a, b) => a.x - b.x));
}

// The picture inside a panel box, trimmed a little all round so blended gutter edges never leak in.
export function cutPanel(img, box, trim = 0.012) {
  const tx = Math.round(box.w * trim), ty = Math.round(box.h * trim);
  const out = new Px(box.w - 2 * tx, box.h - 2 * ty);
  for (let y = 0; y < out.h; y++) {
    const from = ((box.y + ty + y) * img.w + box.x + tx) * 4;
    out.d.set(img.data.subarray(from, from + out.w * 4), y * out.w * 4);
  }
  return out;
}

// One image -> the three favicon files: [{ name, size, px }]
export function makeFavicons(img) {
  const square = cropToAspect(img, 1);
  return [["favicon-16.png", 16, 12], ["favicon-32.png", 32, 20], ["apple-touch-icon.png", 180, 32]]
    .map(([name, size, colors]) => ({ name, size, px: quantize(boxResize(square, size, size), colors, 0) }));
}

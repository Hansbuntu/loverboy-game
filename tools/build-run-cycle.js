// Builds the runner's 8-frame run cycle from the 4 AI frames in assets/source/.
//
//   node tools/build-run-cycle.js        (npm run prep runs this automatically)
//
// Why: the AI's four run frames all show the same foot planted in front and the other trailing behind, so the
// animation looks like a limp. A real run cycle needs the legs to swap roles: a foot plants in front, pushes
// back, lifts, and swings forward through the body while the other takes its turn.
//
// So this keeps the AI's head, hoodie and arms (above the hips) and poses NEW legs under them: two-bone legs
// (thigh + shin) following a proper stride, coloured from the AI's own jeans and sneakers.
//   assets/source/run-1..4.png  ->  assets/sprites/run-1..8.png
import fs from "node:fs";
import path from "node:path";
import { decodePNG } from "./png.js";
import { Px } from "./pixel.js";

const SIZE = 40;
const FRAMES = 8;
const FLOOR = SIZE - 1;          // the bottom row is where the soles rest
const STRIDE = 6.5;              // how far a foot travels in front of / behind the hip (px)
const LIFT = 5.5;                // how high a foot lifts while swinging forward (px)

const load = (file) => { const d = decodePNG(fs.readFileSync(file)); const p = new Px(d.w, d.h); p.d.set(d.data); return p; };
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const isJeans = (c) => c[3] && c[2] > c[0] + 25 && c[2] > c[1] + 5 && c[0] < 130;
const isShoe = (c) => c[3] && Math.min(c[0], c[1], c[2]) > 150 && Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) < 50;
const isBody = (c) => c[3] && c[0] > c[1] + 45 && c[0] > c[2] + 15;   // hoodie pink or skin: kept below the hips too

function median(list) {
  const s = [...list].sort((a, b) => lum(a) - lum(b));
  return s[Math.floor(s.length / 2)] || [80, 90, 150, 255];
}
const mult = (c, f) => [0, 1, 2].map((i) => Math.max(0, Math.min(255, Math.round(c[i] * f)))).concat(255);

export function buildRunCycle(root = ".", outDirOverride = null) {
  const srcDir = path.join(root, "assets/source");
  const outDir = outDirOverride || path.join(root, "assets/sprites");
  const sources = [1, 2, 3, 4].map((n) => load(path.join(srcDir, `run-${n}.png`)));

  // colours taken from the AI art itself
  const jeans = [], shoes = [], darks = [];
  for (const f of sources) for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const c = f.get(x, y);
    if (!c[3]) continue;
    if (y > 20 && isJeans(c)) jeans.push(c);
    else if (y > 30 && isShoe(c)) shoes.push(c);
    else if (lum(c) < 45) darks.push(c);
  }
  const JEANS = median(jeans), SHOE = median(shoes), OUTLINE = median(darks);
  const JEANS_LIGHT = mult(JEANS, 1.28), JEANS_FAR = mult(JEANS, 0.72), SHOE_FAR = mult(SHOE, 0.8), SHOE_SHADE = mult(SHOE, 0.68);

  // where the legs start in each source frame, and where the hips are
  const info = sources.map((f) => {
    let top = 26;
    for (let y = 15; y < SIZE; y++) {
      let n = 0;
      for (let x = 0; x < SIZE; x++) if (isJeans(f.get(x, y))) n++;
      if (n >= 3) { top = y; break; }
    }
    let sx = 0, n = 0;
    for (let y = top; y < top + 3; y++) for (let x = 0; x < SIZE; x++) if (isJeans(f.get(x, y))) { sx += x; n++; }
    return { top, hipX: n ? sx / n : 20 };
  });

  // the upper body of a source frame: everything above the jeans, plus pink/skin (hoodie hem, hands) below that line
  const upperBody = (f, top) => {
    const out = new Px(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const c = f.get(x, y);
      if (!c[3]) continue;
      if (y < top || isBody(c)) out.set(x, y, c);
    }
    return out;
  };

  // A foot's position for a stride phase (0..1): plants in front (0.5), slides back on the ground to push off (1),
  // then lifts and swings forward again (0..0.5).
  const foot = (phase) => {
    const t = ((phase % 1) + 1) % 1;
    if (t >= 0.5) return { x: STRIDE - (2 * STRIDE * (t - 0.5)) / 0.5, lift: 0 };                       // on the ground, moving back
    const u = t / 0.5;                                                                                   // swinging forward
    return { x: -STRIDE + 2 * STRIDE * u, lift: LIFT * Math.sin(Math.PI * u) };
  };

  // A two-bone leg from the hip to the foot, drawn on its own layer with an outline.
  const leg = (hip, phase, colors) => {
    const layer = new Px(SIZE, SIZE);
    const f = foot(phase);
    const ankle = { x: hip.x + f.x, y: FLOOR - 3 - f.lift };
    const L1 = 6.0, L2 = 6.6;
    let dx = ankle.x - hip.x, dy = ankle.y - hip.y;
    let d = Math.hypot(dx, dy);
    const reach = L1 + L2 - 0.05;
    if (d > reach) { const k = reach / d; dx *= k; dy *= k; d = reach; }   // can't stretch further than the leg is long
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const knee = { x: hip.x + (a * dx) / d + (h * dy) / d, y: hip.y + (a * dy) / d - (h * dx) / d };   // bends forward
    const end = { x: hip.x + dx, y: hip.y + dy };

    layer.line(hip.x, hip.y, knee.x, knee.y, colors.jeans, 6);
    layer.line(knee.x, knee.y, end.x, end.y, colors.jeans, 5);
    layer.line(hip.x + 0.5, hip.y, knee.x + 0.5, knee.y, colors.light, 1);   // a lit edge, like the AI's folds
    const sx = Math.round(end.x) - 2, sy = Math.round(end.y) + 1;
    layer.rect(sx, sy, 7, 3, colors.shoe);                                    // sneaker, toe pointing forward
    layer.rect(sx, sy + 2, 7, 1, colors.shade);
    layer.outline(OUTLINE);
    return layer;
  };

  // the 8 frames: which source frame supplies the upper body for each
  const bodyFor = [0, 0, 1, 1, 2, 2, 3, 3];
  for (let k = 0; k < FRAMES; k++) {
    const frame = new Px(SIZE, SIZE);
    const s = bodyFor[k];
    const hip = { x: info[s].hipX, y: info[s].top + 1 };
    const phase = k / FRAMES;
    frame.paste(leg(hip, phase + 0.5, { jeans: JEANS_FAR, light: JEANS, shoe: SHOE_FAR, shade: SHOE_SHADE }), 0, 0);   // far leg, behind
    frame.paste(leg(hip, phase, { jeans: JEANS, light: JEANS_LIGHT, shoe: SHOE, shade: SHOE_SHADE }), 0, 0);            // near leg
    frame.paste(upperBody(sources[s], info[s].top), 0, 0);                                                              // hoodie, arms and head on top
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `run-${k + 1}.png`), frame.toPNG());
  }
  return { frames: FRAMES, colors: { JEANS, SHOE, OUTLINE }, info };
}

if (process.argv[1] && process.argv[1].endsWith("build-run-cycle.js")) {
  const r = buildRunCycle(".");
  console.log(`wrote assets/sprites/run-1..${r.frames}.png (jeans ${r.colors.JEANS.slice(0, 3)}, shoes ${r.colors.SHOE.slice(0, 3)}, hips at y ${r.info.map((i) => i.top + 1)})`);
}

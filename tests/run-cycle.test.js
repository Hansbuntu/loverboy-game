import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodePNG } from "../tools/png.js";
import { buildRunCycle } from "../tools/build-run-cycle.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = fs.mkdtempSync(path.join(os.tmpdir(), "run-cycle-"));
buildRunCycle(root, out);   // writes to a temp folder, never to the real assets

const frames = Array.from({ length: 8 }, (_, i) => decodePNG(fs.readFileSync(path.join(out, `run-${i + 1}.png`))));
const opaque = (f, x, y) => f.data[(y * f.w + x) * 4 + 3] > 0;

// positions of the sneakers: light, greyish pixels. The far leg's shoe is drawn a little darker, so both count.
function feet(f) {
  const xs = [];
  for (let y = 30; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const i = (y * f.w + x) * 4;
    const [r, g, b] = [f.data[i], f.data[i + 1], f.data[i + 2]];
    if (f.data[i + 3] && Math.min(r, g, b) > 118 && Math.max(r, g, b) - Math.min(r, g, b) < 55) xs.push({ x, y });
  }
  return xs;
}

describe("run cycle", () => {
  test("has 8 frames of 40x40", () => {
    assert.equal(frames.length, 8);
    for (const f of frames) assert.deepEqual([f.w, f.h], [40, 40]);
  });

  test("every frame stands on the ground: a foot touches the bottom row", () => {
    frames.forEach((f, i) => {
      let touching = false;
      for (let x = 0; x < f.w; x++) if (opaque(f, x, f.h - 1)) touching = true;
      assert.ok(touching, `frame ${i + 1} floats above the floor`);
    });
  });

  test("no two frames are identical (the legs actually move)", () => {
    const keys = frames.map((f) => Buffer.from(f.data).toString("base64"));
    assert.equal(new Set(keys).size, 8);
  });

  test("a foot lifts off the ground in some frames and stays down in others (a real stride)", () => {
    const lifted = frames.map((f) => feet(f).some((p) => p.y < f.h - 4));   // a sneaker visibly above the floor
    assert.ok(lifted.filter(Boolean).length >= 3, "expected several frames with a lifted foot");
    assert.ok(lifted.filter((l) => !l).length >= 2, "expected several frames with both feet down");
  });

  test("the legs SWAP: the front foot in the first half is the back foot in the second half", () => {
    // stride width = how far apart the sneakers are; it must open and close, twice per cycle
    const spread = frames.map((f) => { const xs = feet(f).map((p) => p.x); return xs.length ? Math.max(...xs) - Math.min(...xs) : 0; });
    const wide = spread.map((s) => s >= 10);
    assert.ok(wide[0] && wide[4], `contact frames 1 and 5 should have a wide stride, got ${spread}`);
    assert.ok(!wide[2] && !wide[6], `passing frames 3 and 7 should have the feet together, got ${spread}`);
  });

  test("the head and body stay put from frame to frame (no jitter)", () => {
    const topRow = frames.map((f) => { for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (opaque(f, x, y)) return y; return 0; });
    assert.ok(Math.max(...topRow) - Math.min(...topRow) <= 3, `head height varies by ${Math.max(...topRow) - Math.min(...topRow)}px: ${topRow}`);
  });
});

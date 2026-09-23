import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Px } from "../tools/pixel.js";
import { boxResize, countColors, cropToAspect, levelFromName, processBackground, quantize } from "../tools/bg-lib.js";

// a smooth horizontal + vertical colour ramp, like a soft illustration
function ramp(w, h) {
  const p = new Px(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, [Math.round((255 * x) / w), Math.round((255 * y) / h), 120, 255]);
  return p;
}

describe("which level a file is for", () => {
  test("finds the number in ordinary names", () => {
    assert.equal(levelFromName("level-03.png"), 3);
    assert.equal(levelFromName("level-1.webp"), 1);
    assert.equal(levelFromName("C:\\art\\bg5.jpg"), 5);
    assert.equal(levelFromName("/tmp/4 open hills.png"), 4);
    assert.equal(levelFromName("storm_3_final.png"), 3);
  });

  test("ignores numbers that are part of a longer number, or out of range", () => {
    assert.equal(levelFromName("IMG_2034.png"), null);
    assert.equal(levelFromName("photo-2026.png"), null);
    assert.equal(levelFromName("level-08.png"), null);
    assert.equal(levelFromName("level-9.png"), null);
    assert.equal(levelFromName("castle.png"), null);
  });
});

describe("cropping to 16:10", () => {
  test("a wide image loses its sides", () => {
    const c = cropToAspect(ramp(2000, 1000), 1.6);
    assert.deepEqual([c.w, c.h], [1600, 1000]);
    assert.equal(c.get(0, 500)[0] > 0, true, "the crop is centred: its left edge is not the original's left edge");
  });

  test("a tall or squarish image loses its top and bottom", () => {
    const c = cropToAspect(ramp(1500, 1000), 1.6);
    assert.deepEqual([c.w, c.h], [1500, 938]);
    const sq = cropToAspect(ramp(1000, 1000), 1.6);
    assert.deepEqual([sq.w, sq.h], [1000, 625]);
  });

  test("an image that is already 16:10 is unchanged", () => {
    const c = cropToAspect(ramp(1600, 1000), 1.6);
    assert.deepEqual([c.w, c.h], [1600, 1000]);
  });
});

describe("shrinking", () => {
  test("averages the pixels under each new pixel", () => {
    const p = new Px(2, 2);
    p.set(0, 0, [0, 0, 0, 255]); p.set(1, 0, [100, 100, 100, 255]); p.set(0, 1, [200, 200, 200, 255]); p.set(1, 1, [100, 100, 100, 255]);
    const out = boxResize(p, 1, 1);
    assert.deepEqual([...out.get(0, 0)], [100, 100, 100, 255]);
  });

  test("gives the exact size asked for, opaque", () => {
    const out = boxResize(ramp(1234, 777), 320, 200);
    assert.deepEqual([out.w, out.h], [320, 200]);
    for (let i = 3; i < out.d.length; i += 4) assert.equal(out.d[i], 255);
  });

  test("a see-through pixel counts as black, not as leftover colour", () => {
    const p = new Px(1, 1);
    p.set(0, 0, [255, 255, 255, 0]);
    assert.deepEqual([...boxResize(p, 1, 1).get(0, 0)].slice(0, 3), [0, 0, 0]);
  });
});

describe("palette reduction", () => {
  test("never uses more colours than asked for", () => {
    for (const k of [8, 24, 48]) assert.ok(countColors(quantize(ramp(160, 100), k)) <= k, `k=${k}`);
  });

  test("keeps a single flat colour exactly", () => {
    const p = new Px(20, 20);
    p.rect(0, 0, 20, 20, [10, 200, 90, 255]);
    const q = quantize(p, 16);
    assert.equal(countColors(q), 1);
    assert.deepEqual([...q.get(5, 5)].slice(0, 3), [10, 200, 90]);
  });

  test("more colours means a closer match to the original", () => {
    const src = ramp(160, 100);
    const err = (q) => { let e = 0; for (let i = 0; i < src.d.length; i += 4) e += Math.abs(src.d[i] - q.d[i]) + Math.abs(src.d[i + 1] - q.d[i + 1]); return e; };
    assert.ok(err(quantize(src, 48)) < err(quantize(src, 6)));
  });
});

describe("a whole background", () => {
  test("comes out at the requested size with a limited palette", () => {
    const out = processBackground(ramp(1774, 887), { w: 320, h: 200, colors: 40, dither: 0.12 });
    assert.deepEqual([out.w, out.h], [320, 200]);
    assert.ok(countColors(out) <= 40);
  });

  test("is repeatable: the same image gives the same result", () => {
    const src = ramp(600, 400);
    assert.deepEqual(processBackground(src).d, processBackground(src).d);
  });

  test("supports the 640x400 size too", () => {
    const out = processBackground(ramp(1500, 1000), { w: 640, h: 400 });
    assert.deepEqual([out.w, out.h], [640, 400]);
  });
});

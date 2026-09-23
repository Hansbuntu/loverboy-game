import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Px } from "../tools/pixel.js";
import { cutPanel, findPanels, makeFavicons } from "../tools/bg-lib.js";

const MAGENTA = [255, 0, 255, 255];

// A sheet of `cols` x `rows` panels. Panel i is filled with a colour that encodes i, so order can be checked.
function makeSheet({ cols = 2, rows = 4, pw = 160, ph = 100, gap = 24, jitter = 0 } = {}) {
  const sheet = new Px(gap + cols * (pw + gap), gap + rows * (ph + gap));
  sheet.rect(0, 0, sheet.w, sheet.h, MAGENTA);
  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const jx = jitter ? ((i * 7) % (jitter * 2 + 1)) - jitter : 0, jy = jitter ? ((i * 5) % (jitter * 2 + 1)) - jitter : 0;
    sheet.rect(gap + col * (pw + gap) + jx, gap + row * (ph + gap) + jy, pw - (i % 3), ph - (i % 2), [20 + i * 25, 90, 40 + i * 10, 255]);
  }
  return { w: sheet.w, h: sheet.h, data: sheet.d };
}
const shade = (img, box) => img.data[((box.y + 5) * img.w + box.x + 5) * 4];   // red channel at a panel's inside = its index code

describe("finding panels on a sheet", () => {
  test("finds every panel in a 2 x 4 grid, in reading order", () => {
    const img = makeSheet();
    const panels = findPanels(img);
    assert.equal(panels.length, 8);
    assert.deepEqual(panels.map((p) => shade(img, p)), Array.from({ length: 8 }, (_, i) => 20 + i * 25));
  });

  test("still reads left to right, top to bottom when panels are misaligned and uneven", () => {
    const img = makeSheet({ jitter: 5 });
    const panels = findPanels(img);
    assert.equal(panels.length, 8);
    assert.deepEqual(panels.map((p) => shade(img, p)), Array.from({ length: 8 }, (_, i) => 20 + i * 25));
  });

  test("works for other grids too (3 x 3)", () => {
    const img = makeSheet({ cols: 3, rows: 3 });
    assert.equal(findPanels(img).length, 9);
  });

  test("ignores small marks in the gaps, such as stray captions", () => {
    const sheet = makeSheet();
    const data = sheet.data;
    for (let k = 0; k < 6; k++) for (let y = 4; y < 14; y++) for (let x = 30 + k * 8; x < 35 + k * 8; x++) data.set([255, 255, 255, 255], (y * sheet.w + x) * 4);
    assert.equal(findPanels(sheet).length, 8);
  });

  test("panels that touch merge into one and are NOT found separately (so the tool can warn)", () => {
    const img = makeSheet({ gap: 0, cols: 2, rows: 2 });
    assert.ok(findPanels(img).length < 4);
  });

  test("a blank sheet has no panels", () => {
    const p = new Px(200, 200);
    p.rect(0, 0, 200, 200, MAGENTA);
    assert.equal(findPanels({ w: 200, h: 200, data: p.d }).length, 0);
  });
});

describe("cutting a panel out", () => {
  test("returns the panel's picture without any gap colour at its edges", () => {
    const img = makeSheet();
    const box = findPanels(img)[0];
    const cut = cutPanel(img, box);
    assert.ok(cut.w < box.w && cut.h < box.h);
    for (let x = 0; x < cut.w; x++) for (const y of [0, cut.h - 1]) assert.notDeepEqual([...cut.get(x, y)], MAGENTA, `gap colour at ${x},${y}`);
    for (let y = 0; y < cut.h; y++) for (const x of [0, cut.w - 1]) assert.notDeepEqual([...cut.get(x, y)], MAGENTA, `gap colour at ${x},${y}`);
  });
});

describe("favicons", () => {
  test("makes the three files at the right sizes from any picture", () => {
    const p = new Px(300, 200);
    p.rect(0, 0, 300, 200, [30, 30, 40, 255]);
    p.disk(150, 100, 60, [255, 90, 140, 255]);
    const icons = makeFavicons({ w: 300, h: 200, data: p.d });
    assert.deepEqual(icons.map((f) => [f.name, f.px.w, f.px.h]), [["favicon-16.png", 16, 16], ["favicon-32.png", 32, 32], ["apple-touch-icon.png", 180, 180]]);
  });
});

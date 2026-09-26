// Small pixel-art pieces drawn in code: hearts, music notes, sparkles, chevrons, the headphones that fly off.
// Each glyph is a tiny bitmap ("#" = filled), rendered once per colour into a cached canvas.

const GLYPHS = {
  heart: [
    ".##...##.",
    "####.####",
    "#########",
    "#########",
    ".#######.",
    "..#####..",
    "...###...",
    "....#...."
  ],
  heartShine: [          // the highlight drawn over a heart
    ".........",
    ".#.......",
    ".........",
    ".........",
    ".........",
    ".........",
    ".........",
    "........."
  ],
  halfL: [
    ".##..",
    "####.",
    "#####",
    "####.",
    ".####",
    "..##.",
    "...#.",
    "....."
  ],
  halfR: [
    "..##.",
    ".####",
    "####.",
    "#####",
    "####.",
    "###..",
    "#....",
    "....."
  ],
  heartSmall: [
    "#.#",
    "###",
    ".#."
  ],
  note: [
    "..#..",
    "..##.",
    "..#.#",
    "..#..",
    ".##..",
    "###..",
    ".#..."
  ],
  sparkle: [
    "..#..",
    "..#..",
    "##.##",
    "..#..",
    "..#.."
  ],
  chevL: ["..#", ".#.", "#..", ".#.", "..#"],
  chevR: ["#..", ".#.", "..#", ".#.", "#.."],
  phones: [              // headphones, when they fly off
    ".#####.",
    "#.....#",
    "#.....#",
    "##...##",
    "##...##"
  ]
};

const cache = new Map();

// A cached canvas of the glyph in one colour.
export function glyph(name, color) {
  const key = name + "|" + color;
  let c = cache.get(key);
  if (c) return c;
  const rows = GLYPHS[name];
  c = document.createElement("canvas");
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext("2d");
  g.fillStyle = color;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === "#") g.fillRect(x, y, 1, 1);
  });
  cache.set(key, c);
  return c;
}

// A soft round glow (for additive light), cached per colour.
export function glowSprite(color, size = 64) {
  const key = "glow|" + color + "|" + size;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, withAlpha(color, 0.35));
  grad.addColorStop(1, withAlpha(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  cache.set(key, c);
  return c;
}

// ---- colour helpers ----

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

// Blend two "#rrggbb" colours (t = 0 gives a, 1 gives b).
export function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

// "#rrggbb" darkened (< 1) or lightened (> 1), as "#rrggbb".
export function shadeHex(hex, f) {
  return rgbToHex(hexToRgb(hex).map((v) => v * f));
}

export function withAlpha(color, a) {
  if (color.startsWith("#")) {
    const [r, g, b] = hexToRgb(color);
    return `rgba(${r},${g},${b},${a})`;
  }
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (!m) return color;
  const [r, g, b] = m[1].split(",").map((s) => parseFloat(s));
  return `rgba(${r},${g},${b},${a})`;
}

// A heart-shaped path (for the iris transition), centred on cx, cy, about `s` wide.
export function heartPath(ctx, cx, cy, s) {
  const x = cx;
  const y = cy - s * 0.28;
  ctx.moveTo(x, y + s * 0.2);
  ctx.bezierCurveTo(x, y - s * 0.05, x - s * 0.5, y - s * 0.12, x - s * 0.5, y + s * 0.22);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.5, x - s * 0.12, y + s * 0.62, x, y + s * 0.82);
  ctx.bezierCurveTo(x + s * 0.12, y + s * 0.62, x + s * 0.5, y + s * 0.5, x + s * 0.5, y + s * 0.22);
  ctx.bezierCurveTo(x + s * 0.5, y - s * 0.12, x, y - s * 0.05, x, y + s * 0.2);
  ctx.closePath();
}

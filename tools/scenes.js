// The seven level backgrounds (320x200 pixel art, shown at 2x). One scene per world in the story:
// a guarded heart slowly opening up. Colours come from each level's palette in js/config.js.
import { Px, bayer, hex, mix, shade, rng, WHITE } from "./pixel.js";

const W = 320, H = 200, HORIZON = 168;   // the game's floor covers everything below the horizon

// A vertical gradient in dithered bands.
function sky(p, top, bottom, to = HORIZON, bands = 9) {
  for (let y = 0; y < p.h; y++) {
    const t = Math.min(1, y / to) * bands;
    for (let x = 0; x < p.w; x++) {
      const lo = Math.floor(t), pick = t - lo > bayer(x, y) ? lo + 1 : lo;
      p.set(x, y, mix(top, bottom, Math.min(1, pick / bands)));
    }
  }
}

function stars(p, r, n, ymax, c) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * ymax);
    p.blend(x, y, c, 0.5 + r() * 0.5);
    if (r() < 0.12) { p.blend(x - 1, y, c, 0.4); p.blend(x + 1, y, c, 0.4); p.blend(x, y - 1, c, 0.4); p.blend(x, y + 1, c, 0.4); }
  }
}

// Rolling silhouette from the base line down.
function hills(p, r, base, amp, wave, c) {
  const a = r() * 6, b = r() * 6;
  for (let x = 0; x < W; x++) {
    const top = base - amp * (0.5 + 0.3 * Math.sin(x / wave + a) + 0.2 * Math.sin(x / (wave * 0.41) + b));
    for (let y = Math.floor(top); y < H; y++) p.set(x, y, c);
  }
}

// Translucent light rays fanning out from a point, as dithered wedges.
function rays(p, cx, cy, count, c, alpha, spin = 0) {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const a = (Math.atan2(y - cy, x - cx) + Math.PI * 2 + spin) % (Math.PI * 2);
    if (Math.floor((a / (Math.PI * 2)) * count * 2) % 2 === 0) {
      const d = Math.hypot(x - cx, y - cy);
      const fade = Math.max(0, 1 - d / 260);
      if (fade * alpha * 2 > bayer(x, y)) p.blend(x, y, c, 0.5);
    }
  }
}

function haze(p, y, h, c, strength = 0.5) {
  for (let j = 0; j < h; j++) for (let x = 0; x < W; x++) {
    const t = 1 - j / h;
    if (t * strength > bayer(x, y + j)) p.blend(x, y + j, c, 0.55);
  }
}

// A castle with a gate. state: "closed" | "cracked" | "open"
function castle(p, cx, base, state, c) {
  const wall = shade(mix(c.skyDeep, c.obstacle, 0.28), 0.85), wallLit = mix(wall, c.obstacle, 0.25), door = shade(c.skyDeep, 0.5);
  const lit = mix(c.glow, WHITE, 0.4);
  const tower = (x) => {
    p.rect(x, base - 86, 26, 86, wall);
    for (let k = 0; k < 4; k++) p.rect(x + k * 7, base - 92, 5, 6, wall);
    p.rect(x, base - 86, 3, 86, wallLit);
    p.rect(x + 11, base - 70, 4, 10, state === "open" ? lit : door);
    p.rect(x + 11, base - 46, 4, 10, state === "open" ? lit : door);
  };
  p.rect(cx - 74, base - 50, 148, 50, wall);
  for (let x = cx - 74; x < cx + 74; x += 11) p.rect(x, base - 56, 7, 6, wall);
  for (let y = base - 46; y < base; y += 8) for (let x = cx - 74 + ((y / 8) % 2) * 5; x < cx + 74; x += 10) p.rect(x, y, 1, 1, wallLit);
  tower(cx - 100);
  tower(cx + 74);

  // the gate: an arch
  const gw = 36, top = base - 42;
  const arch = (color) => { p.rect(cx - gw / 2, top, gw, base - top, color); p.disk(cx, top, gw / 2, color); };
  if (state === "open") {
    arch(mix(c.glow, WHITE, 0.55));
    p.glow(cx, top + 10, 34, WHITE, 0.9, 5);
    p.poly([[cx - 18, base - 44], [cx - 30, base - 38], [cx - 30, base], [cx - 18, base]], door);   // doors swung wide
    p.poly([[cx + 18, base - 44], [cx + 30, base - 38], [cx + 30, base], [cx + 18, base]], door);
    p.poly([[cx - 16, base], [cx + 16, base], [cx + 60, HORIZON + 4], [cx - 60, HORIZON + 4]], mix(c.glow, WHITE, 0.4));
  } else {
    arch(door);
    for (let x = cx - gw / 2 + 4; x < cx + gw / 2; x += 6) p.rect(x, top - 6, 1, base - top + 6, shade(c.obstacle, 0.35));
    for (const y of [top + 4, top + 20, top + 34]) p.rect(cx - gw / 2, y, gw, 2, shade(c.obstacle, 0.55));
    if (state === "cracked") {
      const crack = [[cx - 3, top - 15], [cx + 2, top - 7], [cx - 3, top + 1], [cx + 3, top + 10], [cx - 2, top + 20], [cx + 2, base]];
      p.glow(cx, top + 10, 30, c.accent, 0.55, 4);
      for (let i = 0; i + 1 < crack.length; i++) p.line(crack[i][0], crack[i][1], crack[i + 1][0], crack[i + 1][1], c.accent, 3);
      for (let i = 0; i + 1 < crack.length; i++) p.line(crack[i][0], crack[i][1], crack[i + 1][0], crack[i + 1][1], lit, 1);
    }
  }
}

function birds(p, r, n, ymin, ymax, c) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * W), y = ymin + Math.floor(r() * (ymax - ymin));
    p.set(x, y, c); p.set(x + 1, y + 1, c); p.set(x + 2, y, c); p.set(x - 1, y - 1, c); p.set(x + 3, y - 1, c);
  }
}

const scenes = [
  // 1. The closed gate: cold, dark, still.
  (p, c, r) => {
    sky(p, shade(c.skyDeep, 0.7), mix(c.sky, WHITE, 0.08));
    stars(p, r, 90, 110, mix(c.glow, WHITE, 0.6));
    p.glow(250, 42, 40, c.glow, 0.5);
    p.disk(250, 42, 13, mix(c.sky, WHITE, 0.78));            // a thin crescent moon
    p.disk(256, 38, 11, mix(shade(c.skyDeep, 0.7), c.sky, 0.25));
    hills(p, r, 150, 26, 34, shade(mix(c.sky, c.skyDeep, 0.5), 0.9));
    castle(p, 160, 172, "closed", c);
    haze(p, 140, 34, mix(c.sky, WHITE, 0.25), 0.6);
  },
  // 2. The cracked gate: an ember shows through.
  (p, c, r) => {
    sky(p, shade(c.skyDeep, 0.65), mix(c.sky, c.accent, 0.16));
    stars(p, r, 70, 100, mix(c.glow, WHITE, 0.5));
    p.glow(160, 120, 90, c.accent, 0.22, 5);
    hills(p, r, 152, 24, 30, shade(mix(c.sky, c.skyDeep, 0.5), 0.85));
    castle(p, 160, 172, "cracked", c);
    for (let i = 0; i < 26; i++) {   // sparks drifting up from the crack
      const x = 160 + (r() - 0.5) * 70, y = 130 - r() * 90;
      p.blend(x, y, mix(c.accent, WHITE, r() * 0.5), 0.9 - (130 - y) / 120);
    }
    haze(p, 145, 30, mix(c.sky, c.accent, 0.3), 0.5);
  },
  // 3. The storm: rain, cloud, a skyline, and lightning.
  (p, c, r) => {
    sky(p, shade(c.skyDeep, 0.55), mix(c.sky, c.skyDeep, 0.3));
    for (let i = 0; i < 46; i++) {   // heavy cloud
      const x = r() * W, y = r() * 80, rad = 14 + r() * 26;
      for (let j = 0; j < 3; j++) p.glow(x + (r() - 0.5) * 30, y + (r() - 0.5) * 12, rad, shade(c.skyDeep, 0.5), 0.55, 3);
    }
    p.glow(232, 60, 70, mix(c.glow, WHITE, 0.6), 0.6, 5);
    for (const [base, hmin, hmax, col] of [[172, 40, 96, shade(c.skyDeep, 0.7)], [172, 24, 70, shade(c.skyDeep, 0.45)]]) {
      for (let x = 0; x < W; ) {
        const w = 12 + Math.floor(r() * 22), h = hmin + Math.floor(r() * (hmax - hmin));
        p.rect(x, base - h, w, h, col);
        for (let wy = base - h + 5; wy < base - 5; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 5) {
          if (r() < 0.16) p.rect(wx, wy, 2, 3, mix(c.accent, c.glow, 0.5));
        }
        x += w + 1;
      }
    }
    // lightning
    let x = 232, y = 0;
    const bolt = [[x, y]];
    while (y < 128) { x += (r() - 0.5) * 20; y += 12 + r() * 9; bolt.push([x, y]); }
    for (let i = 0; i + 1 < bolt.length; i++) p.line(bolt[i][0], bolt[i][1], bolt[i + 1][0], bolt[i + 1][1], mix(c.accent, WHITE, 0.6), 3);
    for (let i = 0; i + 1 < bolt.length; i++) p.line(bolt[i][0], bolt[i][1], bolt[i + 1][0], bolt[i + 1][1], WHITE, 1);
    for (let i = 0; i < 300; i++) {   // rain
      const sx = r() * (W + 30), sy = r() * HORIZON;
      p.line(sx, sy, sx - 3, sy + 7, mix(c.glow, WHITE, 0.3), 1);
    }
  },
  // 4. The open hills: the world is wide and warm.
  (p, c, r) => {
    sky(p, mix(c.skyDeep, c.sky, 0.6), mix(c.accent, c.glow, 0.5), 150);
    rays(p, 205, 128, 12, mix(c.glow, WHITE, 0.5), 0.55, 0.2);
    p.glow(205, 128, 95, mix(c.glow, WHITE, 0.4), 0.9, 6);
    p.disk(205, 128, 22, mix(c.accent, WHITE, 0.25));
    p.disk(205, 128, 18, mix(c.glow, WHITE, 0.55));
    hills(p, r, 138, 36, 50, mix(c.sky, c.accent, 0.35));
    hills(p, r, 152, 30, 40, mix(c.sky, c.obstacle, 0.5));
    hills(p, r, 170, 24, 32, shade(mix(c.skyDeep, c.obstacle, 0.35), 0.9));
    birds(p, r, 5, 40, 90, shade(c.skyDeep, 0.7));
  },
  // 5. Twin mountains, mirrored, reflected in still water.
  (p, c, r) => {
    const horizon = 148;
    sky(p, shade(c.skyDeep, 0.85), mix(c.sky, c.accent, 0.3), horizon);
    stars(p, r, 40, 70, mix(c.glow, WHITE, 0.6));
    p.glow(160, 100, 80, c.glow, 0.75, 6);
    p.disk(160, 92, 17, mix(c.accent, WHITE, 0.4));
    const left = [[-30, horizon], [72, 52], [138, horizon]];
    const mirror = left.map(([x, y]) => [W - x, y]);
    const dark = shade(c.skyDeep, 0.6), face = shade(mix(c.skyDeep, c.obstacle, 0.4), 0.85);
    for (const [pts, dir] of [[left, 1], [mirror, -1]]) {
      p.poly(pts, face);
      p.poly([pts[1], pts[dir > 0 ? 2 : 0], [pts[1][0], horizon]], dark);
    }
    for (let y = horizon; y < H; y++) for (let x = 0; x < W; x++) {   // the water: a dimmed, rippled reflection
      const sy = Math.floor(horizon - 1 - (y - horizon) * 2.4 + (bayer(x, y) > 0.5 ? 1 : 0));
      const src = sy >= 0 ? p.get(x, sy) : [0, 0, 0, 255];
      const ripple = ((y + Math.floor(Math.sin(x / 5 + y) * 2)) & 3) === 0;
      p.set(x, y, mix(src, mix(c.skyDeep, c.accent, 0.2), ripple ? 0.65 : 0.35));
    }
  },
  // 6. The quiet dome: calm, symmetrical, unhurried.
  (p, c, r) => {
    sky(p, mix(c.sky, c.skyDeep, 0.4), mix(c.sky, WHITE, 0.32));
    for (let i = 0; i < 6; i++) {   // long, slow clouds
      const y = 22 + i * 15 + r() * 8, x = r() * W;
      for (let j = 0; j < 4; j++) p.glow(x + j * 22, y, 18 + r() * 8, mix(c.accent, WHITE, 0.5), 0.5, 3);
    }
    p.disk(70, 52, 9, mix(c.sky, WHITE, 0.85));
    hills(p, r, 152, 14, 60, mix(c.sky, c.obstacle, 0.55));
    const dome = mix(c.obstacle, WHITE, 0.15), rib = shade(c.obstacle, 0.7);
    p.rect(78, 150, 164, 22, shade(c.obstacle, 0.82));
    p.disk(160, 150, 74, dome);
    p.rect(60, 150, 200, 30, shade(c.obstacle, 0.82));
    for (let k = -3; k <= 3; k++) p.line(160 + k * 3, 78, 160 + k * 24, 150, rib, 1);
    for (let y = 100; y < 150; y += 14) p.rect(96, y, 128, 1, rib);
    p.rect(150, 94, 20, 3, shade(c.skyDeep, 0.6));   // the slit that opens to the sky
    p.glow(160, 120, 70, WHITE, 0.25, 5);
    p.rect(146, 138, 28, 14, shade(c.skyDeep, 0.65)); p.disk(160, 138, 14, shade(c.skyDeep, 0.65));
    haze(p, 132, 40, mix(c.sky, WHITE, 0.5), 0.5);
  },
  // 7. The wide-open gate, and a sunburst.
  (p, c, r) => {
    sky(p, mix(c.sky, c.accent, 0.1), mix(c.accent, WHITE, 0.4));
    rays(p, 160, 128, 14, WHITE, 0.75);   // the sunburst
    p.glow(160, 128, 120, WHITE, 0.95, 7);
    hills(p, r, 152, 22, 44, mix(c.obstacle, c.skyDeep, 0.35));
    castle(p, 160, 172, "open", { ...c, obstacle: shade(c.obstacle, 0.75), skyDeep: shade(c.skyDeep, 0.9) });
    birds(p, r, 7, 30, 96, shade(c.skyDeep, 0.6));
    for (let i = 0; i < 44; i++) p.rect(Math.floor(r() * W), Math.floor(r() * 150), 2, 2, i % 2 ? hex("#ff7fa8") : WHITE);   // confetti
  }
];

export function drawScene(index, colors) {
  const c = { sky: hex(colors.sky), skyDeep: hex(colors.skyDeep), obstacle: hex(colors.obstacle), accent: hex(colors.accent), glow: hex(colors.glow) };
  const p = new Px(W, H);
  p.rect(0, 0, W, H, c.skyDeep);
  scenes[index](p, c, rng(4242 + index * 97));
  return p;
}



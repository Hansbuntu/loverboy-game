import { glowSprite, glyph, mixHex, shadeHex, withAlpha } from "./art.js";

// Everything around the runner: the painted background, a parallax row of props (fences, torches,
// street lamps, trees ...), weather, sun rays, the floor (a different material per level), and the
// finishing light (glow, vignette, colour). Each level's look is set by `world` in config.js.
//
// Drawing happens in view coordinates (0..W, 0..H); the runner's camera (shake, zoom) wraps it.

const BG_PAN = 120;            // how far the background drifts across a level (px)
const PROP_PARALLAX = 0.5;     // the prop row moves at half the floor's speed
const TILE = 64;               // floor texture width

// deterministic hash in 0..1
function hash(n) {
  let t = (n * 0x6d2b79f5 + 0x9e3779b9) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export class World {
  constructor(levels) {
    this.levels = levels;
    this.bgImages = levels.map((l) => {
      if (!l.bg) return null;
      const img = new Image();
      img.src = l.bg;
      return img;
    });
    this.t = 0;
    this.pan = 0;
    this.flash = 0;             // lightning
    this.nextBolt = 4;
    this.onThunder = null;
    this.weather = [];
    this.splashes = [];
  }

  get bgReady() {
    const bg = this.bgImages[this.index];
    return !!(bg && bg.complete && bg.naturalWidth > 0);
  }

  setLevel(index, W, H, groundY) {
    this.index = index;
    this.L = this.levels[index];
    this.cfg = this.L.world || {};
    this.W = W; this.H = H; this.groundY = groundY;
    this.pan = 0;
    this.flash = 0;
    this.nextBolt = 3 + Math.random() * 4;
    this.build();
  }

  resize(W, H, groundY) {
    this.W = W; this.H = H; this.groundY = groundY;
    if (this.L) this.build();
  }

  // Pre-render everything that does not change frame to frame.
  build() {
    const L = this.L, c = L.colors, W = this.W, H = this.H;
    const pal = this.pal = {
      sil: mixHex(c.skyDeep, "#05040a", 0.55),
      rim: mixHex(c.accent, c.skyDeep, 0.35),
      glow: c.glow,
      accent: c.accent,
      obstacle: c.obstacle
    };
    // sky fallback
    const sky = canvas(1, H);
    const g = sky.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, c.sky);
    grad.addColorStop(1, c.skyDeep);
    g.fillStyle = grad;
    g.fillRect(0, 0, 1, H);
    this.skyCanvas = sky;

    // vignette
    const v = canvas(W, H);
    const vg = v.getContext("2d");
    const rad = vg.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    rad.addColorStop(0, "rgba(0,0,0,0)");
    rad.addColorStop(1, "rgba(4,2,10,0.55)");
    vg.fillStyle = rad;
    vg.fillRect(0, 0, W, H);
    this.vignette = v;

    this.floorTile = this.makeFloorTile();
    this.props = (this.cfg.props || []).map((name) => this.makeProp(name));
    this.makeWeather();

    // sun rays: one cached gradient, drawn around the sun
    this.rayGrad = null;
  }

  // ---------- update ----------

  update(dt, { speed, moving, progress, idle }) {
    this.t += dt;
    const target = idle ? 0 : progress;
    this.pan += (target - this.pan) * Math.min(1, dt * 2.4);
    this.flash = Math.max(0, this.flash - dt * 2.8);
    const drift = moving ? speed : 30;
    this.updateWeather(dt, drift);

    if (this.cfg.weather === "rain") {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 6 + Math.random() * 7;
        this.flash = 0.85;
        setTimeout(() => { this.flash = Math.max(this.flash, 0.55); }, 120);
        setTimeout(() => this.onThunder?.(), 250 + Math.random() * 500);
      }
    }
  }

  // ---------- background ----------

  // Sun position on screen (the background's light source), or null.
  sunPos() {
    const s = this.cfg.sun;
    if (!s || !this.bgRect) return null;
    const r = this.bgRect;
    return [r.x + s[0] * r.w, r.y + s[1] * r.h];
  }

  drawBack(ctx, camY) {
    const { W, H } = this;
    ctx.drawImage(this.skyCanvas, 0, 0, W, H);
    const bg = this.bgImages[this.index];
    if (bg && bg.complete && bg.naturalWidth > 0) {
      const s = Math.max(W / bg.naturalWidth, H / bg.naturalHeight) * 1.04;   // a touch of overscan for the drift
      const bw = Math.round(bg.naturalWidth * s);
      const bh = Math.round(bg.naturalHeight * s);
      const sway = Math.sin(this.t * 0.25) * 4;
      const pan = Math.min((bw - W) / 2, BG_PAN) * this.pan;
      const x = Math.round((W - bw) / 2 - pan + sway);
      const y = Math.round((H - bh) / 2 - camY * 0.25);
      ctx.drawImage(bg, x, y, bw, bh);
      this.bgRect = { x, y, w: bw, h: bh };
    }
    this.drawSun(ctx);
    this.drawWeather(ctx, "back");
  }

  drawSun(ctx) {
    const sun = this.sunPos();
    if (!sun) return;
    const [sx, sy] = sun;
    const { W, H } = this;
    const L = this.L;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // bloom
    const glow = glowSprite(L.colors.glow, 256);
    const size = this.cfg.weather === "rays" ? 460 : 300;
    ctx.globalAlpha = 0.28 + Math.sin(this.t * 0.9) * 0.04;
    ctx.drawImage(glow, sx - size / 2, sy - size / 2, size, size);
    // god rays
    if (this.cfg.rays) {
      if (!this.rayGrad) {
        const g = ctx.createRadialGradient(0, 0, 10, 0, 0, Math.max(W, H) * 1.1);
        g.addColorStop(0, withAlpha(L.colors.glow, 0.5));
        g.addColorStop(0.5, withAlpha(L.colors.glow, 0.12));
        g.addColorStop(1, withAlpha(L.colors.glow, 0));
        this.rayGrad = g;
      }
      ctx.translate(sx, sy);
      ctx.rotate(this.t * 0.03);
      ctx.fillStyle = this.rayGrad;
      const n = this.cfg.rays;
      const len = Math.max(W, H) * 1.2;
      ctx.globalAlpha = 0.16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const w = 0.07 + 0.05 * hash(i + 7);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a - w) * len, Math.sin(a - w) * len);
        ctx.lineTo(Math.cos(a + w) * len, Math.sin(a + w) * len);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------- props: a parallax row between the painting and the floor ----------

  makeProp(name) {
    const { sil, rim } = this.pal;
    const L = this.L;
    const draw = (w, h, fn) => {
      const c = canvas(w, h);
      const g = c.getContext("2d");
      fn(g, w, h);
      return c;
    };
    const R = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    switch (name) {
      case "fence":
        return { name, light: null, img: draw(34, 16, (g) => {
          for (const x of [1, 12, 23]) { R(g, x, 2, 3, 14, sil); R(g, x, 1, 3, 1, rim); }
          R(g, 0, 5, 34, 2, sil); R(g, 0, 11, 34, 2, sil); R(g, 0, 5, 34, 1, rim);
        }) };
      case "deadtree":
        return { name, light: null, img: draw(34, 50, (g) => {
          R(g, 15, 14, 4, 36, sil);
          R(g, 17, 14, 1, 36, rim);
          const br = [[15, 24, -1, 10], [18, 20, 1, 12], [16, 32, -1, 8], [18, 36, 1, 7], [16, 14, -1, 6], [17, 12, 1, 8]];
          for (const [x, y, dir, len] of br) for (let i = 0; i < len; i++) R(g, x + dir * i, y - Math.floor(i * 0.7), 2, 2, sil);
        }) };
      case "rock":
        return { name, light: null, img: draw(20, 10, (g) => {
          R(g, 3, 2, 13, 8, sil); R(g, 1, 5, 18, 5, sil); R(g, 5, 0, 8, 3, sil); R(g, 5, 0, 8, 1, rim); R(g, 3, 2, 3, 1, rim);
        }) };
      case "torch":
        return { name, light: { x: 5, y: 4, color: "#ff9a4a", flicker: true, size: 80 }, img: draw(10, 34, (g) => {
          R(g, 4, 8, 2, 26, sil); R(g, 1, 6, 8, 3, sil); R(g, 1, 6, 8, 1, rim);
        }) };
      case "lamp":
        return { name, light: { x: 13, y: 7, color: "#ffe2a0", flicker: false, size: 110, cone: true }, img: draw(18, 66, (g) => {
          R(g, 3, 6, 2, 60, sil); R(g, 1, 62, 6, 4, sil); R(g, 3, 4, 12, 2, sil); R(g, 11, 6, 5, 3, sil); R(g, 12, 9, 3, 1, "#ffe9b8");
        }) };
      case "tree":
        return { name, light: null, img: draw(40, 50, (g) => {
          R(g, 18, 30, 4, 20, sil);
          const blobs = [[20, 18, 13], [11, 24, 9], [29, 24, 9], [20, 10, 9]];
          for (const [cx, cy, r] of blobs) for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); R(g, cx - w, cy + y, w * 2, 1, sil); }
          for (const [cx, cy, r] of blobs) { const w = Math.round(r * 0.6); R(g, cx - w + 2, cy - r, w, 1, rim); }
        }) };
      case "grass":
        return { name, light: null, img: draw(14, 9, (g) => {
          const blades = [[1, 5], [3, 8], [5, 4], [7, 9], [9, 6], [11, 8], [12, 4]];
          for (const [x, h] of blades) { R(g, x, 9 - h, 1, h, sil); R(g, x, 9 - h, 1, 1, rim); }
        }) };
      case "flowers":
        return { name, light: null, img: draw(16, 10, (g) => {
          for (const [x, h] of [[2, 7], [6, 9], [10, 6], [13, 8]]) { R(g, x, 10 - h, 1, h, sil); R(g, x - 1, 9 - h, 3, 2, L.colors.accent); }
        }) };
      case "reeds":
        return { name, light: null, img: draw(14, 26, (g) => {
          for (const [x, h] of [[2, 18], [5, 24], [8, 20], [11, 15]]) { R(g, x, 26 - h, 1, h, sil); R(g, x - 1, 26 - h, 2, 5, shadeHex(sil, 1.4)); }
        }) };
      case "cypress":
        return { name, light: null, img: draw(14, 54, (g) => {
          for (let y = 0; y < 50; y++) { const w = Math.round(2 + Math.sin((y / 50) * Math.PI) * 5); R(g, 7 - w, y, w * 2, 1, sil); }
          R(g, 6, 48, 2, 6, sil);
          for (let y = 4; y < 46; y += 3) R(g, 7 + Math.round(Math.sin((y / 50) * Math.PI) * 4), y, 1, 2, rim);
        }) };
      case "lantern":
        return { name, light: { x: 5, y: 9, color: "#ffd28a", flicker: true, size: 70 }, img: draw(10, 32, (g) => {
          R(g, 4, 12, 2, 20, sil); R(g, 2, 5, 6, 8, sil); R(g, 3, 7, 4, 4, "#ffd89a"); R(g, 1, 4, 8, 1, sil);
        }) };
      case "bush":
        return { name, light: null, img: draw(28, 14, (g) => {
          for (const [cx, cy, r] of [[7, 9, 6], [14, 7, 7], [21, 9, 6]]) for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); R(g, cx - w, cy + y, w * 2, 1, sil); }
          for (const [x, y] of [[8, 5], [16, 3], [21, 7]]) R(g, x, y, 2, 2, "#ff6f9a");
        }) };
      case "banner":
        return { name, light: null, banner: true, img: draw(4, 58, (g) => {
          R(g, 1, 2, 2, 56, sil); R(g, 0, 0, 4, 3, "#e0b050");
        }) };
      default:
        return { name, light: null, img: draw(1, 1, () => {}) };
    }
  }

  drawProps(ctx, camX, camY) {
    const props = this.props;
    if (!props.length) return;
    const spacing = this.cfg.propGap || 150;
    const shift = camX * PROP_PARALLAX;
    const first = Math.floor((shift - 60) / spacing);
    const last = Math.ceil((shift + this.W + 60) / spacing);
    const base = this.groundY + 3 - Math.round(camY * 0.6);
    ctx.globalAlpha = 0.92;
    const lights = [];
    for (let i = first; i <= last; i++) {
      const h = hash(i * 3 + this.index * 101);
      if (h < 0.18) continue;                                         // some gaps
      const pr = props[Math.floor(hash(i * 7 + 3) * props.length)];
      const x = Math.round(i * spacing + (h - 0.5) * spacing * 0.5 - shift);
      const y = base - pr.img.height;
      ctx.drawImage(pr.img, x, y);
      if (pr.banner) this.drawBanner(ctx, x + 3, y + 4, i);
      if (pr.light) lights.push([x + pr.light.x, y + pr.light.y, pr.light, i]);
    }
    ctx.globalAlpha = 1;
    if (lights.length) {
      ctx.globalCompositeOperation = "lighter";
      for (const [x, y, l, i] of lights) {
        const f = l.flicker ? 0.8 + Math.sin(this.t * 17 + i * 3) * 0.1 + Math.sin(this.t * 31 + i) * 0.08 : 1;
        const s = l.size * f;
        ctx.globalAlpha = 0.55 * f;
        ctx.drawImage(glowSprite(l.color, 64), x - s / 2, y - s / 2, s, s);
        if (l.flicker) {                                               // the flame itself
          ctx.globalAlpha = 1;
          ctx.fillStyle = l.color;
          ctx.fillRect(x - 1, y - 3 - Math.round(f * 2), 2, 3 + Math.round(f * 2));
          ctx.fillStyle = "#fff4c8";
          ctx.fillRect(x - 1, y - 1, 2, 2);
        }
        if (l.cone) {                                                  // a street lamp's pool of light
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = l.color;
          ctx.beginPath();
          ctx.moveTo(x - 3, y + 2);
          ctx.lineTo(x + 3, y + 2);
          ctx.lineTo(x + 26, this.groundY);
          ctx.lineTo(x - 26, this.groundY);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
  }

  drawBanner(ctx, x, y, i) {
    const wave = this.t * 4 + i;
    for (let k = 0; k < 12; k++) {
      const dy = Math.round(Math.sin(wave - k * 0.5) * 1.5);
      ctx.fillStyle = k % 5 === 4 ? "#f2c860" : "#c8364f";
      ctx.fillRect(x + k, y + dy, 1, 16 - Math.floor(k / 3));
    }
  }

  // ---------- weather ----------

  makeWeather() {
    const kind = this.cfg.weather;
    const { W, H, groundY } = this;
    const n = { snow: 70, embers: 44, rain: 110, petals: 30, shimmer: 34, seeds: 26, rays: 34 }[kind] || 0;
    this.weather = Array.from({ length: n }, (_, i) => this.newFlake(kind, true, i));
    this.splashes.length = 0;
    this.fireflies = kind === "petals" || kind === "seeds"
      ? Array.from({ length: 10 }, (_, i) => ({ x: hash(i + 91) * W, y: groundY - 20 - hash(i + 13) * (groundY * 0.45), ph: hash(i) * 7 }))
      : [];
    this.twinkles = kind === "snow" || kind === "seeds"
      ? Array.from({ length: 18 }, (_, i) => ({ x: hash(i + 301) * W, y: hash(i + 77) * H * 0.4, ph: hash(i + 5) * 9 }))
      : [];
  }

  newFlake(kind, anywhere, i = Math.random() * 1000) {
    const { W, H, groundY } = this;
    const r = () => Math.random();
    const f = { kind, x: r() * W, y: anywhere ? r() * H : -8, vx: 0, vy: 0, s: 1, a: 1, ph: r() * 10, depth: 0.3 + r() * 0.9, color: "#fff" };
    switch (kind) {
      case "snow": f.vy = 14 + r() * 26; f.s = r() < 0.25 ? 2 : 1; f.a = 0.45 + r() * 0.5; f.front = r() < 0.3; break;
      case "embers": f.y = anywhere ? r() * groundY : groundY + 4; f.vy = -(20 + r() * 40); f.s = r() < 0.3 ? 2 : 1; f.color = r() < 0.5 ? "#ffb05a" : "#ff6a3a"; f.front = r() < 0.25; break;
      case "rain": f.vy = 620 + r() * 260; f.vx = -140; f.a = 0.18 + r() * 0.3; f.len = 6 + Math.round(r() * 6); f.front = r() < 0.4; break;
      case "petals": f.vy = 18 + r() * 22; f.vx = -20 - r() * 20; f.color = r() < 0.5 ? "#ff9ab8" : "#ffc2a0"; f.front = r() < 0.35; break;
      case "shimmer": f.x = r() * W; f.y = groundY * (0.6 + r() * 0.35); f.front = false; break;
      case "seeds": f.vy = -(4 + r() * 8); f.vx = -10 - r() * 14; f.a = 0.5 + r() * 0.4; f.front = r() < 0.3; break;
      case "rays": f.y = anywhere ? r() * groundY : groundY; f.vy = -(12 + r() * 20); f.heart = r() < 0.45; f.color = f.heart ? (r() < 0.5 ? "#ff7fb0" : "#ffd35c") : "#fff2b0"; f.front = r() < 0.3; break;
    }
    return f;
  }

  updateWeather(dt, drift) {
    const { W, H, groundY } = this;
    for (let i = 0; i < this.weather.length; i++) {
      const f = this.weather[i];
      f.ph += dt;
      const par = drift * (f.front ? 0.9 : 0.12 * f.depth);
      switch (f.kind) {
        case "snow": f.x += (Math.sin(f.ph * 1.3) * 10 - par) * dt; f.y += f.vy * dt; break;
        case "embers": f.x += (Math.sin(f.ph * 2.1) * 14 - par) * dt; f.y += f.vy * dt; break;
        case "rain":
          f.x += (f.vx - par * 0.5) * dt; f.y += f.vy * dt;
          if (f.y > groundY && f.y < groundY + 20 && Math.random() < 0.5 && this.splashes.length < 40) {
            this.splashes.push({ x: f.x, y: groundY, t: 0.18 });
            f.y = H + 10;
          }
          break;
        case "petals": f.x += (f.vx + Math.sin(f.ph * 2) * 16 - par) * dt; f.y += (f.vy + Math.cos(f.ph * 1.7) * 10) * dt; break;
        case "shimmer": f.x -= par * 0.3 * dt; break;
        case "seeds": f.x += (f.vx + Math.sin(f.ph) * 6 - par) * dt; f.y += (f.vy + Math.sin(f.ph * 0.7) * 6) * dt; break;
        case "rays": f.x += (Math.sin(f.ph * 1.5) * 10 - par) * dt; f.y += f.vy * dt; break;
      }
      if (f.y > H + 12 || f.y < -14 || f.x < -16 || f.x > W + 16) {
        const nf = this.newFlake(f.kind, false);
        if (f.kind === "embers" || f.kind === "rays") { nf.y = groundY + 2; }
        else if (f.kind === "seeds") { nf.y = Math.random() * groundY; nf.x = W + 8; }
        else if (f.x < -16) { nf.x = W + 8; nf.y = Math.random() * H * 0.8; }
        else if (f.kind === "shimmer") nf.x = W + 4;
        this.weather[i] = nf;
      }
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      s.t -= dt;
      s.x -= drift * dt;
      if (s.t <= 0) this.splashes.splice(i, 1);
    }
    for (const ff of this.fireflies) {
      ff.ph += dt;
      ff.x -= drift * 0.2 * dt;
      if (ff.x < -10) ff.x = W + 10;
    }
  }

  drawWeather(ctx, layer) {
    const front = layer === "front";
    const list = this.weather;
    if (!front) {
      // twinkling stars and fireflies live in the back
      if (this.twinkles.length) {
        ctx.globalCompositeOperation = "lighter";
        for (const s of this.twinkles) {
          const a = Math.max(0, Math.sin(this.t * 2 + s.ph));
          if (a < 0.4) continue;
          ctx.globalAlpha = a * 0.8;
          ctx.drawImage(glyph("sparkle", "#dfe8ff"), Math.round(s.x) - 2, Math.round(s.y) - 2);
        }
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.globalCompositeOperation = "lighter";
    if (front && this.fireflies.length) {
      for (const ff of this.fireflies) {
        const a = 0.5 + 0.5 * Math.sin(ff.ph * 2.3);
        ctx.globalAlpha = a * 0.7;
        const x = Math.round(ff.x + Math.sin(ff.ph * 0.8) * 8), y = Math.round(ff.y + Math.cos(ff.ph * 0.6) * 6);
        ctx.drawImage(glowSprite("#fff0a0", 16), x - 6, y - 6, 12, 12);
        ctx.fillStyle = "#fffbe0";
        ctx.fillRect(x, y, 1, 1);
      }
    }
    for (const f of list) {
      if (!!f.front !== front) continue;
      switch (f.kind) {
        case "snow":
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = f.a;
          ctx.fillStyle = "#eef4ff";
          ctx.fillRect(Math.round(f.x), Math.round(f.y), f.s, f.s);
          break;
        case "embers": {
          ctx.globalCompositeOperation = "lighter";
          const fl = 0.55 + 0.45 * Math.sin(f.ph * 9);
          ctx.globalAlpha = fl;
          ctx.fillStyle = f.color;
          ctx.fillRect(Math.round(f.x), Math.round(f.y), f.s, f.s);
          if (f.s > 1) { ctx.globalAlpha = fl * 0.3; ctx.drawImage(glowSprite(f.color, 16), Math.round(f.x) - 4, Math.round(f.y) - 4, 10, 10); }
          break;
        }
        case "rain":
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = f.a;
          ctx.fillStyle = "#bfe2ff";
          for (let k = 0; k < f.len; k++) ctx.fillRect(Math.round(f.x + k * 0.22), Math.round(f.y - k), 1, 1);
          break;
        case "petals": {
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = f.color;
          const flip = Math.sin(f.ph * 4) > 0;
          ctx.fillRect(Math.round(f.x), Math.round(f.y), flip ? 3 : 1, flip ? 1 : 2);
          ctx.fillRect(Math.round(f.x) + 1, Math.round(f.y) + (flip ? 1 : 0), 1, 1);
          break;
        }
        case "shimmer": {
          ctx.globalCompositeOperation = "lighter";
          const a = Math.max(0, Math.sin(f.ph * 1.6));
          if (a < 0.3) break;
          ctx.globalAlpha = a;
          ctx.drawImage(glyph("sparkle", "#fff0d8"), Math.round(f.x) - 2, Math.round(f.y) - 2);
          break;
        }
        case "seeds":
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = f.a;
          ctx.fillStyle = "#fffaf0";
          ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
          ctx.globalAlpha = f.a * 0.5;
          ctx.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, 3, 1);
          break;
        case "rays":
          ctx.globalCompositeOperation = f.heart ? "source-over" : "lighter";
          ctx.globalAlpha = 0.85;
          if (f.heart) ctx.drawImage(glyph("heartSmall", f.color), Math.round(f.x), Math.round(f.y));
          else { ctx.fillStyle = f.color; ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1); }
          break;
      }
    }
    if (front && this.splashes.length) {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#cfe8ff";
      for (const s of this.splashes) {
        ctx.globalAlpha = s.t / 0.18 * 0.7;
        const r = Math.round((0.18 - s.t) * 30);
        ctx.fillRect(Math.round(s.x) - r, s.y - 1, 1, 1);
        ctx.fillRect(Math.round(s.x) + r, s.y - 1, 1, 1);
        ctx.fillRect(Math.round(s.x), s.y - 2 - Math.round(r / 2), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  // Low fog / haze near the ground (in front of the props, behind the runner).
  drawMist(ctx) {
    const m = this.cfg.mist;
    if (!m) return;
    const { W, groundY } = this;
    const glow = glowSprite(m, 64);
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < 6; i++) {
      const x = ((i * 157 + this.t * (8 + i * 3)) % (W + 240)) - 120;
      ctx.drawImage(glow, W - x - 120, groundY - 44 + (i % 3) * 8, 240, 70);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- floor ----------

  makeFloorTile() {
    const L = this.L, c = L.colors, mat = this.cfg.floor || "stone";
    const Hf = this.H - this.groundY;
    const tile = canvas(TILE, Hf);
    const g = tile.getContext("2d");
    const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const o = c.obstacle;
    const bricks = (body, top, joint, lit) => {
      R(0, 0, TILE, Hf, body);
      R(0, 0, TILE, 3, top);
      R(0, 3, TILE, 2, lit);
      for (let row = 0; row * 18 + 5 < Hf; row++) {
        const y = 5 + row * 18;
        R(0, y + 17, TILE, 1, joint);
        const off = row % 2 ? 16 : 0;
        for (let x = off; x < TILE + 32; x += 32) R(x % TILE, y, 2, 17, joint);
        for (let x = off; x < TILE + 32; x += 32) R((x + 2) % TILE, y, 12, 1, shadeHex(body, 1.18));
      }
    };
    switch (mat) {
      case "ember":
        bricks(shadeHex(o, 0.3), o, shadeHex(o, 0.18), shadeHex(o, 0.5));
        g.fillStyle = c.accent;                 // glowing cracks
        for (const [x, y, len] of [[10, 9, 7], [40, 26, 9], [22, 44, 6]]) for (let i = 0; i < len; i++) g.fillRect(x + i, y + ((i * 7) % 3) - 1, 1, 1);
        break;
      case "wet": {
        const body = mixHex(c.skyDeep, "#000000", 0.35);
        R(0, 0, TILE, Hf, body);
        R(0, 0, TILE, 2, mixHex(o, "#ffffff", 0.25));
        R(0, 2, TILE, 2, shadeHex(o, 0.45));
        for (const [x, y, w] of [[6, 12, 18], [36, 22, 22], [14, 38, 14], [44, 48, 12]]) R(x, y, w, 1, withAlpha(c.glow, 0.35));
        break;
      }
      case "grass": {
        const grass = mixHex("#6d8f3a", o, 0.25);
        const dirt = shadeHex(o, 0.42);
        R(0, 0, TILE, Hf, dirt);
        R(0, 0, TILE, 5, grass);
        R(0, 0, TILE, 1, mixHex(grass, "#ffffff", 0.3));
        for (let x = 0; x < TILE; x += 3) R(x, 5, 2, 1 + ((x * 7) % 4), grass);
        for (const [x, y] of [[8, 18], [30, 26], [50, 16], [20, 40], [44, 46], [58, 34]]) { R(x, y, 3, 2, shadeHex(o, 0.62)); R(x, y, 3, 1, shadeHex(o, 0.75)); }
        break;
      }
      case "mirror": {
        const grad = g.createLinearGradient(0, 0, 0, Hf);
        grad.addColorStop(0, mixHex(c.skyDeep, c.accent, 0.25));
        grad.addColorStop(1, mixHex(c.sky, "#000000", 0.55));
        g.fillStyle = grad;
        g.fillRect(0, 0, TILE, Hf);
        R(0, 0, TILE, 2, mixHex(c.accent, "#ffffff", 0.35));
        for (const [x, y, w] of [[4, 10, 20], [34, 18, 26], [12, 30, 14], [40, 42, 18]]) R(x, y, w, 1, withAlpha("#ffffff", 0.18));
        break;
      }
      case "marble": {
        const body = mixHex(o, "#ffffff", 0.12);
        R(0, 0, TILE, Hf, body);
        R(0, 0, TILE, 3, mixHex(o, "#ffffff", 0.45));
        R(0, 3, TILE, 1, shadeHex(o, 0.72));
        R(31, 4, 1, Hf, shadeHex(o, 0.78));
        R(0, 30, TILE, 1, shadeHex(o, 0.78));
        g.fillStyle = shadeHex(o, 0.82);         // veins
        for (let i = 0; i < 26; i++) g.fillRect(4 + i * 2, 12 + Math.round(Math.sin(i * 0.5) * 4), 1, 1);
        for (let i = 0; i < 18; i++) g.fillRect(36 + i, 40 + Math.round(Math.sin(i * 0.7) * 3), 1, 1);
        break;
      }
      case "gold":
        bricks(shadeHex(o, 0.62), mixHex(o, "#ffffff", 0.35), shadeHex(o, 0.38), shadeHex(o, 0.85));
        break;
      default:
        bricks(shadeHex(o, 0.32), o, shadeHex(o, 0.22), shadeHex(o, 0.5));
    }
    return tile;
  }

  // How strongly the floor reflects what is on it (0 = not at all).
  get reflect() {
    return { mirror: 0.42, wet: 0.2, marble: 0.14, gold: 0.12 }[this.cfg.floor] || 0;
  }

  // Solid floor segments between pits: [[from, to], ...] in screen x.
  floorSegments(pits, camX) {
    const segs = [];
    let cursor = 0;
    for (const pit of pits) {
      const l = Math.round(pit.left - camX);
      const r = Math.round(pit.right - camX);
      if (r < 0) continue;
      if (l > this.W) break;
      if (l > cursor) segs.push([cursor, l]);
      cursor = Math.max(cursor, r);
    }
    if (cursor < this.W) segs.push([cursor, this.W]);
    return segs;
  }

  drawFloor(ctx, pits, camX, pulse) {
    const { W, H, groundY } = this;
    const L = this.L;
    const tile = this.floorTile;
    const off = ((camX % TILE) + TILE) % TILE;
    const segs = this.floorSegments(pits, camX);
    for (const [from, to] of segs) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(from, groundY, to - from, H - groundY);
      ctx.clip();
      for (let x = -off; x < W; x += TILE) if (x + TILE > from && x < to) ctx.drawImage(tile, Math.round(x), groundY);
      ctx.restore();
    }
    // material effects
    const mat = this.cfg.floor;
    if (mat === "ember" || mat === "gold" || mat === "mirror") {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      if (mat === "ember") {
        ctx.globalAlpha = 0.18 + pulse * 0.25 + Math.sin(this.t * 3) * 0.05;
        ctx.fillStyle = L.colors.accent;
        for (const [from, to] of segs) ctx.fillRect(from, groundY, to - from, 2);
      } else if (mat === "gold") {                    // a shine sweeps along the gold
        const sx = ((this.t * 260) % (W + 400)) - 200;
        const g = ctx.createLinearGradient(sx - 60, 0, sx + 60, 0);
        g.addColorStop(0, "rgba(255,255,220,0)");
        g.addColorStop(0.5, "rgba(255,255,220,0.35)");
        g.addColorStop(1, "rgba(255,255,220,0)");
        ctx.fillStyle = g;
        for (const [from, to] of segs) ctx.fillRect(from, groundY, to - from, H - groundY);
      } else {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = "#ffffff";
        for (let i = 0; i < 5; i++) {
          const y = groundY + 6 + i * 11;
          const x = ((this.t * (30 + i * 12) + i * 97) % (W + 60)) - 30;
          ctx.fillRect(Math.round(W - x), y, 18 + i * 4, 1);
        }
      }
      ctx.restore();
    }
    // pits
    for (const pit of pits) {
      const l = Math.round(pit.left - camX);
      const r = Math.round(pit.right - camX);
      if (r < 0) continue;
      if (l > W) break;
      const grad = ctx.createLinearGradient(0, groundY, 0, H);
      grad.addColorStop(0, "rgba(0,0,0,0.95)");
      grad.addColorStop(1, withAlpha(L.colors.glow, 0.55));
      ctx.fillStyle = grad;
      ctx.fillRect(l, groundY, r - l, H - groundY);
      ctx.fillStyle = L.colors.accent;
      ctx.fillRect(l - 1, groundY, 2, H - groundY);
      ctx.fillRect(r - 1, groundY, 2, H - groundY);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35 + pulse * 0.3;
      ctx.drawImage(glowSprite(L.colors.glow, 64), l, H - 30, r - l, 60);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }

  // Clip to the floor surface (not the pits), for reflections.
  clipFloor(ctx, pits, camX) {
    ctx.beginPath();
    for (const [from, to] of this.floorSegments(pits, camX)) ctx.rect(from, this.groundY, to - from, this.H - this.groundY);
    ctx.clip();
  }

  // ---------- the finishing light, over everything ----------

  drawPost(ctx, { pulse, desat, flash }) {
    const { W, H } = this;
    const L = this.L;
    if (desat > 0) {
      ctx.globalCompositeOperation = "saturation";
      ctx.globalAlpha = Math.min(1, desat);
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = L.colors.glow;
    ctx.fillRect(0, 0, W, H);
    if (pulse > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = pulse * 0.05;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(this.vignette, 0, 0);
    const f = Math.max(this.flash, flash || 0);
    if (f > 0) {
      ctx.globalAlpha = Math.min(1, f) * 0.7;
      ctx.fillStyle = "#f4f8ff";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }
}

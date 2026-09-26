import { PHYSICS as P } from "./physics.js";
import { glowSprite, glyph } from "./art.js";
import { silhouetteSprite, sprite } from "./sprites.js";

// How the runner looks and feels: the sprite, squash and stretch, a scarf that streams in the wind,
// headphones (it is a music game), an afterimage trail as the level builds, and the moments:
// jump, land, near-miss, death (the headphones fly off), victory (a spin).
// Pure presentation: nothing here changes the physics or the hit shapes.

const RUN_FRAMES = 8;          // assets/sprites/run-1..8.png
const RUN_STRIDE = 14;         // px of running per animation frame: about two strides per second
const DEATH_FRAME = 0.14;      // seconds per death frame

// Where the head and neck are in each 40x40 frame (measured from the art): the near ear, the top of
// the hair, and the back of the neck (where the scarf is tied). The jump frame faces the viewer.
const ANCHORS = {
  "run-1": { ear: [20, 10], top: [23, 4], neck: [18, 14] },
  "run-2": { ear: [20, 10], top: [23, 4], neck: [18, 14] },
  "run-3": { ear: [21, 11], top: [24, 5], neck: [19, 15] },
  "run-4": { ear: [21, 11], top: [24, 5], neck: [19, 15] },
  "run-5": { ear: [22, 10], top: [25, 4], neck: [20, 14] },
  "run-6": { ear: [22, 10], top: [25, 4], neck: [20, 14] },
  "run-7": { ear: [21, 9], top: [24, 4], neck: [19, 13] },
  "run-8": { ear: [21, 9], top: [24, 4], neck: [19, 13] },
  jump: { front: true, ears: [[14, 14], [24, 14]], top: [19, 8], neck: [16, 17] },
  fall: { ear: [21, 10], top: [24, 5], neck: [19, 13] },
  "idle-1": { ear: [19, 11], top: [22, 4], neck: [18, 15] },
  "idle-2": { ear: [20, 12], top: [23, 6], neck: [18, 15] },
  "idle-3": { ear: [21, 12], top: [24, 6], neck: [18, 15] },
  "idle-4": { ear: [19, 12], top: [22, 6], neck: [17, 15] },
  "win-1": { ear: [17, 11], top: [19, 6], neck: [16, 15] },
  "win-2": { front: true, ears: [[15, 5], [25, 5]], top: [20, 2], neck: [18, 11] },
  "win-3": { front: true, ears: [[16, 11], [25, 11]], top: [20, 6], neck: [18, 15] },
  whoa: { ear: [16, 10], top: [18, 5], neck: [15, 15] }
};

const SCARF = { n: 6, seg: 3.2, main: "#e23b5c", dark: "#8f1f3c", light: "#ff7d93" };
const PHONES = { band: "#f3eef6", shade: "#b9aec8", line: "#1b1526", cup: "#f3eef6", lit: "#ff6f9f" };

export class Hero {
  constructor() {
    this.scarf = Array.from({ length: SCARF.n }, () => ({ x: 0, y: 0, px: 0, py: 0 }));
    this.trail = [];
    this.reset(0, 0);
  }

  reset(x, y) {
    this.sx = 1; this.sy = 1; this.vsx = 0; this.vsy = 0;
    this.angle = 0;
    this.spin = 0;               // victory spin (radians left to turn)
    this.flash = 0;              // white flash on death
    this.whoa = 0;               // the "whoa" pose after a near miss (seconds left)
    this.trail.length = 0;
    this.trailT = 0;
    this.noteT = 0;
    this.scarfFree = false;      // the scarf is let go when the runner dies
    this.phones = null;          // flying headphones after a death
    this.scarfReady = false;
    this.lastAnchor = [x, y];
    this.bob = 0;
    this.wasX = x; this.wasY = y;
  }

  // ---- moments ----

  jump() {
    this.sy = 1.3; this.sx = 0.78; this.vsx = this.vsy = 0;
  }

  land(impact) {
    const k = Math.min(1, impact / 700);
    this.sy = 1 - 0.3 * k - 0.06; this.sx = 1 + 0.32 * k + 0.06; this.vsx = this.vsy = 0;
  }

  die(screenX, headY) {
    this.flash = 1;
    this.scarfFree = true;
    this.phones = { x: screenX, y: headY, vx: -70 - Math.random() * 60, vy: -300, rot: 0, vr: -9 - Math.random() * 5, bounces: 0 };
  }

  victory() {
    this.spin = Math.PI * 2;
    this.sy = 1.25; this.sx = 0.8;
  }

  // ---- update: real dt (already slowed down in slow motion) ----
  // s: { state, player, screenX, feetY, groundY, speed, progress, pulse, parts, camX, spawnNote }
  update(dt, s) {
    // squash and stretch: a damped spring back to 1
    const k = 420, damp = 20;
    this.vsx += ((1 - this.sx) * k - this.vsx * damp) * dt;
    this.vsy += ((1 - this.sy) * k - this.vsy * damp) * dt;
    this.sx += this.vsx * dt;
    this.sy += this.vsy * dt;

    const p = s.player;
    if (s.state === "running" || s.state === "cleared") {
      if (!p.grounded) {
        const target = Math.max(-0.2, Math.min(0.22, p.vy * 0.00028));
        this.angle += (target - this.angle) * Math.min(1, dt * 14);
      } else {
        this.angle += (0 - this.angle) * Math.min(1, dt * 18);
      }
    } else if (s.state !== "dead") {
      this.angle *= 0.8;
    }
    if (this.spin > 0) {
      const step = Math.min(this.spin, dt * 13);
      this.spin -= step;
      this.angle = -(Math.PI * 2 - this.spin);
      if (this.spin <= 0) this.angle = 0;
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    this.whoa = Math.max(0, this.whoa - dt);
    if (s.player.grounded && s.state === "running") this.whoa = 0;   // only while flailing in the air
    this.bob += dt;

    // afterimages: once the level is half done, jumps leave a trail (the song is building)
    this.trailT -= dt;
    if (s.state === "running" && !p.grounded && s.progress >= 0.5 && this.trailT <= 0) {
      this.trailT = 0.035;
      this.trail.push({ x: p.x, y: s.feetY, name: this.frameName(s), sx: this.sx, sy: this.sy, angle: this.angle, life: 0.28 });
      if (this.trail.length > 8) this.trail.shift();
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life -= dt;
      if (this.trail[i].life <= 0) this.trail.splice(i, 1);
    }

    // flying headphones
    const ph = this.phones;
    if (ph) {
      ph.vy += 1500 * dt;
      ph.x += ph.vx * dt;
      ph.y += ph.vy * dt;
      ph.rot += ph.vr * dt;
      if (ph.y > s.groundY - 3 && ph.vy > 0) {
        ph.y = s.groundY - 3;
        ph.vy *= -0.38;
        ph.vx *= 0.6;
        ph.vr *= 0.5;
        if (++ph.bounces > 3) { ph.vy = 0; ph.vr = 0; ph.vx *= 0.5; }
      }
    }

    this.updateScarf(dt, s);
  }

  // The scarf: a short verlet rope pinned at the neck, pushed back by the wind of running.
  updateScarf(dt, s) {
    const a = this.anchor(s, "neck");
    const pts = this.scarf;
    if (!this.scarfReady) {
      pts.forEach((q, i) => { q.x = q.px = a[0] - i * SCARF.seg; q.y = q.py = a[1] + i * 0.8; });
      this.scarfReady = true;
    }
    const moving = s.state === "running" || s.state === "cleared";
    const wind = moving ? -s.speed * 1.05 : -70 - Math.sin(this.bob * 0.7) * 30;   // air flowing past the runner (px/s)
    const t = this.bob;
    for (let i = 1; i < pts.length; i++) {
      const q = pts[i];
      const vx = (q.x - q.px) / Math.max(dt, 1e-4);
      const vy = (q.y - q.py) / Math.max(dt, 1e-4);
      const flutter = Math.sin(t * (moving ? 19 : 5) - i * 0.9) * (moving ? 260 : 60) * (i / pts.length);
      const ax = (wind - vx) * 5.5;
      const ay = 520 + flutter - vy * 0.6;
      const nx = q.x + (q.x - q.px) * 0.9 + ax * dt * dt;
      const ny = q.y + (q.y - q.py) * 0.9 + ay * dt * dt;
      q.px = q.x; q.py = q.y;
      q.x = nx; q.y = ny;
      if (this.scarfFree && q.y > s.groundY - 1) { q.y = s.groundY - 1; q.py = q.y; }
    }
    if (!this.scarfFree) { pts[0].x = a[0]; pts[0].y = a[1]; pts[0].px = a[0]; pts[0].py = a[1]; }
    else {
      const q = pts[0];
      const nx = q.x + (q.x - q.px) * 0.9 - 30 * dt * dt;
      const ny = q.y + (q.y - q.py) * 0.9 + 600 * dt * dt;
      q.px = q.x; q.py = q.y; q.x = nx; q.y = Math.min(ny, s.groundY - 1);
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < pts.length; i++) {
        const A = pts[i - 1], B = pts[i];
        const dx = B.x - A.x, dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 1;
        const diff = (d - SCARF.seg) / d;
        if (i === 1 && !this.scarfFree) { B.x -= dx * diff; B.y -= dy * diff; }
        else { A.x += dx * diff * 0.5; A.y += dy * diff * 0.5; B.x -= dx * diff * 0.5; B.y -= dy * diff * 0.5; }
      }
    }
  }

  frameName(s) {
    const p = s.player;
    const has = (n) => sprite(n) !== null;
    if (s.state === "dead") return "death-" + Math.min(4, 1 + Math.floor(s.deadT / DEATH_FRAME));
    if (s.state === "idle") {                                    // nodding along to the beat
      const n = s.pulse > 0.7 ? 4 : s.pulse > 0.4 ? 3 : s.pulse > 0.15 ? 2 : 1;
      return has("idle-" + n) ? "idle-" + n : "run-7";
    }
    if (s.state === "cleared") {
      if (!p.grounded && has("win-2")) return "win-2";               // arms up
      if (s.stoppedT >= 0 && has("win-1")) return s.stoppedT < 0.35 ? "win-1" : has("win-3") ? "win-3" : "win-1";   // fist pump, then heart hands
    }
    if (!p.grounded) return this.whoa > 0 && has("whoa") ? "whoa" : p.vy < 0 ? "jump" : "fall";
    return "run-" + (1 + (Math.floor(p.x / RUN_STRIDE) % RUN_FRAMES));
  }

  // Where a point of the current frame is on screen, after squash, stretch and rotation.
  anchor(s, which) {
    const name = this.frameName(s);
    const A = ANCHORS[name] || ANCHORS["run-7"];
    let lx, ly;
    if (which === "neck") [lx, ly] = A.neck;
    else if (which === "head") [lx, ly] = A.top;
    else [lx, ly] = A.front ? A.ears[0] : A.ear;
    return this.toScreen(s, lx, ly);
  }

  toScreen(s, lx, ly) {
    const bx = (lx - 20) * this.sx;
    const by = (ly - 40) * this.sy + this.idleLift(s);
    // rotate about the body's middle (20 px above the feet)
    const cy = by + 20;
    const c = Math.cos(this.angle), sn = Math.sin(this.angle);
    return [s.screenX + bx * c - cy * sn, s.feetY - 20 + bx * sn + cy * c];
  }

  idleLift(s) {
    return s.state === "idle" && !sprite("idle-1") ? -Math.round(s.pulse * 1.5) : 0;
  }

  // ---- draw (inside the camera transform) ----

  draw(ctx, s, L) {
    const name = this.frameName(s);
    const img = sprite(name);

    // afterimages
    if (this.trail.length) {
      for (const g of this.trail) {
        const sil = silhouetteSprite(g.name, L.colors.glow);
        if (!sil) continue;
        ctx.globalAlpha = (g.life / 0.28) * 0.35;
        this.drawBody(ctx, sil, Math.round(g.x - s.camX), g.y, g.sx, g.sy, g.angle, 0);
      }
      ctx.globalAlpha = 1;
    }

    // aura in the last quarter of a level
    if (s.state === "running" && s.progress >= 0.75) {
      const glow = glowSprite(L.colors.glow, 96);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.22 + s.pulse * 0.25;
      ctx.drawImage(glow, s.screenX - 48, s.feetY - 68);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    this.drawScarf(ctx);

    if (!img) {
      ctx.fillStyle = L.colors.accent;
      ctx.beginPath();
      ctx.arc(s.screenX, s.feetY - P.radius, P.radius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const lift = this.idleLift(s);
    this.drawBody(ctx, img, s.screenX, s.feetY + lift, this.sx, this.sy, this.angle, 0);
    if (this.flash > 0) {
      const white = silhouetteSprite(name, "#ffffff");
      if (white) {
        ctx.globalAlpha = this.flash;
        this.drawBody(ctx, white, s.screenX, s.feetY + lift, this.sx, this.sy, this.angle, 0);
        ctx.globalAlpha = 1;
      }
    }
    if (s.state !== "dead") this.drawPhones(ctx, s, name, lift, s.pulse);
    if (this.phones) this.drawFlyingPhones(ctx);
  }

  drawBody(ctx, img, x, feetY, sx, sy, angle) {
    const w = img.width, h = img.height;
    ctx.save();
    ctx.translate(x, feetY);
    if (angle) { ctx.translate(0, -20); ctx.rotate(angle); ctx.translate(0, 20); }
    ctx.scale(sx, sy);
    ctx.drawImage(img, -(w >> 1), -h);
    ctx.restore();
  }

  drawScarf(ctx) {
    const pts = this.scarf;
    for (let i = pts.length - 1; i >= 1; i--) {
      const A = pts[i - 1], B = pts[i];
      const w = i < 3 ? 3 : 2;
      const steps = 3;
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const x = Math.round(A.x + (B.x - A.x) * t - w / 2);
        const y = Math.round(A.y + (B.y - A.y) * t - w / 2);
        ctx.fillStyle = SCARF.dark;
        ctx.fillRect(x, y + 1, w, w);
        ctx.fillStyle = (i + k) % 4 === 0 ? SCARF.light : SCARF.main;
        ctx.fillRect(x, y, w, w - 1);
      }
    }
    const end = pts[pts.length - 1];
    ctx.fillStyle = SCARF.main;                                  // fringe at the tip
    ctx.fillRect(Math.round(end.x) - 2, Math.round(end.y), 1, 2);
    ctx.fillRect(Math.round(end.x), Math.round(end.y) + 1, 1, 2);
    const n = pts[0];
    ctx.fillStyle = SCARF.dark;                                  // the knot
    ctx.fillRect(Math.round(n.x) - 2, Math.round(n.y) - 1, 4, 3);
    ctx.fillStyle = SCARF.main;
    ctx.fillRect(Math.round(n.x) - 1, Math.round(n.y) - 1, 3, 2);
  }

  // Headphones drawn over the head in the sprite's own coordinates, so they squash and turn with it.
  drawPhones(ctx, s, name, lift, pulse) {
    const A = ANCHORS[name];
    if (!A) return;
    ctx.save();
    ctx.translate(s.screenX, s.feetY + lift);
    if (this.angle) { ctx.translate(0, -20); ctx.rotate(this.angle); ctx.translate(0, 20); }
    ctx.scale(this.sx, this.sy);
    ctx.translate(-20, -40);
    const lit = pulse > 0.5 ? "#ffffff" : PHONES.lit;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    // the scarf wrapped round the neck
    const [nx, ny] = A.neck;
    if (!A.front) { R(nx, ny - 1, 6, 2, SCARF.main); R(nx, ny + 1, 6, 1, SCARF.dark); R(nx + 2, ny - 1, 2, 1, SCARF.light); }
    else { R(nx, ny - 1, 8, 2, SCARF.main); R(nx, ny + 1, 8, 1, SCARF.dark); }
    if (A.front) {
      const [[lx, ly], [rx, ry]] = A.ears;
      const ty = A.top[1] - 2;
      R(lx - 1, ty + 1, rx - lx + 3, 3, PHONES.line);        // outline, then the white band on top
      R(lx, ty + 2, 1, ly - ty - 2, PHONES.band);
      R(lx + 1, ty + 1, 1, 1, PHONES.band);
      R(lx + 2, ty, rx - lx - 3, 2, PHONES.band);
      R(lx + 2, ty + 1, rx - lx - 3, 1, PHONES.shade);
      R(rx - 1, ty + 1, 1, 1, PHONES.band);
      R(rx, ty + 2, 1, ry - ty - 2, PHONES.band);
      for (const [x, y] of A.ears) {
        R(x - 2, y - 2, 5, 6, PHONES.line);
        R(x - 1, y - 1, 3, 4, PHONES.cup);
        R(x, y, 1, 2, lit);
      }
    } else {
      const [ex, ey] = A.ear;
      const [tx, ty] = A.top;
      // band: from the ear cup, up and over the top of the hair (dark outline, white band)
      const top = ty - 1;
      R(ex - 2, top + 1, 1, ey - top - 1, PHONES.line);
      R(ex - 1, top, tx - ex + 4, 1, PHONES.line);
      R(ex - 1, top + 1, 1, ey - top - 2, PHONES.band);
      R(ex, top + 1, tx - ex + 3, 1, PHONES.band);
      R(tx + 3, top + 1, 1, 2, PHONES.band);
      R(ex, top + 2, 1, 1, PHONES.shade);
      // cup
      R(ex - 3, ey - 2, 6, 7, PHONES.line);
      R(ex - 2, ey - 1, 4, 5, PHONES.cup);
      R(ex - 2, ey + 3, 4, 1, PHONES.shade);
      R(ex - 1, ey, 2, 2, lit);
    }
    ctx.restore();
  }

  drawFlyingPhones(ctx) {
    const ph = this.phones;
    const img = glyph("phones", PHONES.band);
    const lit = glyph("phones", PHONES.lit);
    ctx.save();
    ctx.translate(Math.round(ph.x), Math.round(ph.y));
    ctx.rotate(ph.rot);
    ctx.drawImage(img, -4, -3);
    ctx.globalAlpha = 0.35;
    ctx.drawImage(lit, -4, -4);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

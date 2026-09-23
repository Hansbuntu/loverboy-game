import { PHYSICS as P, groundYFor } from "./physics.js";
import { Player } from "./player.js";
import { buildCourse, unitRight, updateMovers } from "./course.js";
import { shade, sprite, tintedSprite } from "./sprites.js";

// The game itself: the runner, the level's obstacles, and drawing them in pixel-art style.
// It knows nothing about menus or overlays; app.js drives it and listens to its hooks.
//
//   state   "idle"    a level is loaded but not running (backdrop only)
//           "running" playing
//           "dead"    the death animation (the fail card is up)
//           "cleared" the goal was reached

const BG_PAN = 120;            // how far the background drifts across a level (px)
const DEATH_FRAME = 0.14;      // seconds per death-animation frame
const RUN_FRAMES = 8;          // frames in the run cycle (assets/sprites/run-1..8.png)
const RUN_STRIDE = 14;         // px of running per animation frame: about two full strides per second

export class Runner {
  // hooks: { onJump(), onPass(count, goal), onFail(count, goal), onClear() }
  constructor(canvas, levels, input, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.levels = levels;
    this.input = input;
    this.hooks = hooks;
    this.state = "idle";
    this.index = 0;
    this.level = levels[0];
    this.player = new Player();
    this.passed = 0;
    this.attempt = 0;
    this.particles = [];
    this.deadT = 0;
    this.camX = 0;
    this.bgPan = 0;
    this.bgImages = levels.map((l) => {
      if (!l.bg) return null;
      const img = new Image();
      img.src = l.bg;
      return img;
    });
    this.motes = null;
    this.resize(canvas.width, canvas.height);
    this.setLevel(0);
  }

  // ---------- setup ----------

  resize(w, h) {
    this.W = w;
    this.H = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.groundY = groundYFor(h);
    this.px = Math.round(w * P.playerX);
    this.motes = this.makeMotes();
    if (this.state === "idle" || this.state === "cleared") this.buildWorld();
  }

  makeMotes() {
    return Array.from({ length: 14 }, () => ({
      x: Math.random() * this.W, y: Math.random() * this.groundY,
      s: 1 + Math.floor(Math.random() * 2), v: 6 + Math.random() * 14, d: (Math.random() - 0.5) * 6, a: 0.2 + Math.random() * 0.35
    }));
  }

  buildWorld() {
    this.course = buildCourse(this.level);
    this.world = { groundY: this.groundY, obstacles: this.course.obstacles, pits: this.course.pits, slack: this.course.slack };
    this.speed = this.course.speed;
    this.player.reset(this.groundY);
    this.passed = 0;
    this.camX = -this.px;
  }

  // Load a level (0-based) and show it, not running.
  setLevel(i) {
    this.index = i;
    this.level = this.levels[i];
    this.state = "idle";
    this.bgPan = 0;
    this.particles.length = 0;
    this.attempt = 0;
    this.buildWorld();
  }

  // Start (or restart) the current level from the beginning.
  begin() {
    this.buildWorld();
    this.particles.length = 0;
    this.input.clear();
    this.attempt++;
    this.state = "running";
  }

  get goal() {
    return this.level.goal;
  }

  // ---------- update (fixed 1/60 s steps) ----------

  update(dt) {
    for (const m of this.motes) {
      m.y -= m.v * dt;
      m.x += m.d * dt;
      if (m.y < -4) { m.y = this.groundY; m.x = Math.random() * this.W; }
    }
    this.updateParticles(dt);

    if (this.state === "running") {
      this.stepRun(dt);
    } else if (this.state === "dead") {
      this.deadT += dt;
      const p = this.player;
      if (!this.player.grounded && p.y + P.radius < this.groundY) {   // fall to the floor
        p.vy += P.gravity * dt;
        p.y = Math.min(this.groundY - P.radius, p.y + p.vy * dt);
      }
    } else {
      this.input.consumePress();   // drop presses nobody wanted
    }
  }

  stepRun(dt) {
    const p = this.player;
    const pressed = this.input.consumePress();
    p.step(dt, this.speed, { pressed, held: this.input.held }, this.world);
    updateMovers(this.course, p.x, dt);
    this.camX = p.x - this.px;

    if (p.dead) {
      this.die();
      return;
    }
    const feet = p.y + P.radius;
    if (p.jumped) {
      this.hooks.onJump?.();
      this.burst(p.x, feet, 5, 30, 110, 0.3, 2, "glow");
    }
    if (p.landed) this.burst(p.x, feet, 6, 30, 130, 0.3, 2, "glow");
    if (p.grounded && Math.random() < 0.3) this.puff(p.x - 8, feet - 1);

    while (this.passed < this.course.goal && p.x - P.radius > unitRight(this.course.units[this.passed])) {
      this.passed++;
      if (this.passed < this.course.goal) this.hooks.onPass?.(this.passed, this.course.goal);
    }
    if (this.passed >= this.course.goal) {
      this.state = "cleared";
      this.hooks.onPass?.(this.passed, this.course.goal);
      this.hooks.onClear?.();
    }
  }

  die() {
    const p = this.player;
    this.state = "dead";
    this.deadT = 0;
    this.burst(p.x, p.y, 22, 60, 260, 0.7, 3, "accent", 500);
    this.burst(p.x, p.y, 10, 30, 160, 0.5, 2, "pink", 500);
    this.hooks.onFail?.(this.passed, this.course.goal);
  }

  // ---------- particles ----------

  burst(x, y, n, minV, maxV, life, size, kind, gravity = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = minV + Math.random() * (maxV - minV);
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.4), size, kind, gravity);
    }
  }

  puff(x, y) {
    this.spawn(x, y, -30 - Math.random() * 20, -12 - Math.random() * 14, 0.28, 2, "dust", 0);
  }

  spawn(x, y, vx, vy, life, size, kind, gravity) {
    if (this.particles.length > 160) this.particles.shift();
    this.particles.push({ x, y, vx, vy, life, max: life, size, kind, gravity });
  }

  updateParticles(dt) {
    const list = this.particles;
    for (let i = list.length - 1; i >= 0; i--) {
      const q = list[i];
      q.life -= dt;
      if (q.life <= 0) { list.splice(i, 1); continue; }
      q.vy += q.gravity * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
  }

  // ---------- draw ----------

  draw() {
    const ctx = this.ctx;
    const L = this.level;
    ctx.imageSmoothingEnabled = false;
    this.drawBackdrop(ctx, L);
    this.drawFloor(ctx, L);
    this.drawObstacles(ctx, L);
    this.drawParticles(ctx, L);
    this.drawRunner(ctx, L);
  }

  drawBackdrop(ctx, L) {
    const { W, H } = this;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, L.colors.sky);
    g.addColorStop(1, L.colors.skyDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const bg = this.bgImages[this.index];
    if (bg && bg.complete && bg.naturalWidth > 0) {
      // cover-fit; the camera drifts right as you progress through the level
      const s = Math.max(W / bg.naturalWidth, H / bg.naturalHeight);
      const bw = Math.round(bg.naturalWidth * s);
      const bh = Math.round(bg.naturalHeight * s);
      const frac = this.state === "idle" ? 0 : this.passed / this.course.goal;
      this.bgPan += (frac - this.bgPan) * 0.04;
      const pan = Math.min((bw - W) / 2, BG_PAN) * this.bgPan;
      ctx.drawImage(bg, Math.round((W - bw) / 2 - pan), Math.round((H - bh) / 2), bw, bh);
    }

    ctx.fillStyle = L.colors.glow;
    for (const m of this.motes) {
      ctx.globalAlpha = m.a;
      ctx.fillRect(Math.round(m.x), Math.round(m.y), m.s, m.s);
    }
    ctx.globalAlpha = 1;
  }

  drawFloor(ctx, L) {
    const { W, H, groundY, camX } = this;
    const base = shade(L.colors.obstacle, 0.32);
    const solid = (from, to) => {
      if (to <= from) return;
      ctx.fillStyle = base;
      ctx.fillRect(from, groundY, to - from, H - groundY);
      ctx.fillStyle = L.colors.obstacle;
      ctx.fillRect(from, groundY, to - from, 3);                    // lit top edge
      ctx.fillStyle = shade(L.colors.obstacle, 0.5);
      ctx.fillRect(from, groundY + 3, to - from, 2);
      ctx.fillStyle = shade(L.colors.obstacle, 0.22);               // brick joints scroll with the ground
      const step = 32;
      const first = Math.floor((camX + from) / step) * step;
      for (let wx = first; wx < camX + to; wx += step) {
        const sx = Math.round(wx - camX);
        if (sx >= from && sx < to) {
          ctx.fillRect(sx, groundY + 5, 2, 18);
          ctx.fillRect(sx + 16 < to ? sx + 16 : sx, groundY + 23, 2, 18);
        }
      }
      ctx.fillRect(from, groundY + 23, to - from, 1);
      ctx.fillRect(from, groundY + 41, to - from, 1);
    };

    let cursor = 0;
    for (const pit of this.course.pits) {
      const l = Math.round(pit.left - camX);
      const r = Math.round(pit.right - camX);
      if (r < 0) continue;
      if (l > W) break;
      solid(cursor, Math.max(cursor, l));
      const grad = ctx.createLinearGradient(0, groundY, 0, H);
      grad.addColorStop(0, "rgba(0,0,0,0.92)");
      grad.addColorStop(1, L.colors.glow);
      ctx.fillStyle = grad;
      ctx.fillRect(l, groundY, r - l, H - groundY);
      ctx.fillStyle = L.colors.accent;
      ctx.fillRect(l - 1, groundY, 2, H - groundY);
      ctx.fillRect(r - 1, groundY, 2, H - groundY);
      cursor = Math.max(cursor, r);
    }
    solid(cursor, W);
  }

  drawObstacles(ctx, L) {
    const { W, groundY, camX } = this;
    const spike = tintedSprite("spike", L.colors.obstacle);
    const tile = tintedSprite("block", L.colors.obstacle);
    const cap = tintedSprite("blockcap", L.colors.obstacle);

    for (const o of this.course.obstacles) {
      const l = Math.round(o.left - camX);
      const r = Math.round(o.right - camX);
      if (r < -40 || l > W + 40) continue;
      const bottom = groundY - o.elev;
      const top = bottom - o.h;

      if (o.kind === "spike") {
        if (spike) ctx.drawImage(spike, l, top, r - l, o.h);
        else {
          ctx.fillStyle = L.colors.obstacle;
          ctx.beginPath();
          ctx.moveTo(l, bottom);
          ctx.lineTo((l + r) / 2, top);
          ctx.lineTo(r, bottom);
          ctx.fill();
        }
        continue;
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(l, top, r - l, o.h);
      ctx.clip();
      if (tile) {
        for (let y = top; y < bottom; y += tile.height) for (let x = l; x < r; x += tile.width) ctx.drawImage(tile, x, y);
      } else {
        ctx.fillStyle = L.colors.obstacle;
        ctx.fillRect(l, top, r - l, o.h);
      }
      if (cap) for (let x = l; x < r; x += cap.width) ctx.drawImage(cap, x, top);
      else { ctx.fillStyle = shade(L.colors.obstacle, 1.3); ctx.fillRect(l, top, r - l, 4); }
      ctx.restore();
      ctx.strokeStyle = shade(L.colors.obstacle, 0.25);
      ctx.lineWidth = 1;
      ctx.strokeRect(l + 0.5, top + 0.5, r - l - 1, o.h - 1);
    }
  }

  drawParticles(ctx, L) {
    const camX = this.camX;
    for (const q of this.particles) {
      ctx.globalAlpha = Math.min(1, q.life / q.max);
      ctx.fillStyle = q.kind === "accent" ? L.colors.accent : q.kind === "pink" ? "#ff7fa8" : q.kind === "dust" ? shade(L.colors.obstacle, 1.1) : L.colors.glow;
      ctx.fillRect(Math.round(q.x - camX), Math.round(q.y), q.size, q.size);
    }
    ctx.globalAlpha = 1;
  }

  drawRunner(ctx, L) {
    const p = this.player;
    const feet = Math.round(p.y + P.radius);
    let name;
    if (this.state === "dead") name = "death-" + Math.min(4, 1 + Math.floor(this.deadT / DEATH_FRAME));
    else if (!p.grounded) name = p.vy < 0 ? "jump" : "fall";
    else name = "run-" + (1 + (Math.floor(p.x / RUN_STRIDE) % RUN_FRAMES));

    const img = sprite(name);
    if (img) {
      ctx.drawImage(img, this.px - (img.width >> 1), feet - img.height);
    } else {
      ctx.fillStyle = L.colors.accent;
      ctx.beginPath();
      ctx.arc(this.px, Math.round(p.y), P.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

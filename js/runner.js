import { PHYSICS as P, groundYFor } from "./physics.js";
import { Player } from "./player.js";
import { buildCourse, HEART_REACH, heartPos, unitRight, updateMovers } from "./course.js";
import { distSqToBox, distToTriangle } from "./collisions.js";
import { shade, silhouetteSprite, sprite, tintedSprite } from "./sprites.js";
import { glowSprite, glyph, heartPath } from "./art.js";
import { Particles } from "./particles.js";
import { Hero } from "./hero.js";
import { World } from "./world.js";

// The game itself: the runner, the level's obstacles, the camera and all the drawing.
// It knows nothing about menus or overlays; app.js drives it and listens to its hooks.
//
//   state   "idle"    a level is loaded but not running (the runner vibes to the music)
//           "running" playing
//           "dead"    the death moment (app shows the fail card a beat later)
//           "cleared" the goal was reached: a victory hop, then the heart iris closes
//
// Physics always advance in identical 1/60 s steps; slow motion only changes how many steps run per
// second of real time, so the game stays deterministic and fair.

const STEP = 1 / 60;
const NEAR_MISS = 6;            // px between the runner and an obstacle's hit shape that counts as "close!"
const OUTRO = 1.6;              // seconds of victory before the iris closes
const IRIS = 0.55;              // seconds for the heart iris to open or close

export class Runner {
  // hooks: { onJump(), onLand(), onPass(count, goal), onNear(), onHeart(n), onFail(count, goal), onClear(),
  //          onOutro(), onSlowmo(), onThunder() }
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
    this.hero = new Hero();
    this.parts = new Particles();
    this.world = new World(levels);
    this.world.onThunder = () => this.hooks.onThunder?.();
    this.passed = 0;
    this.attempt = 0;
    this.hearts = 0;
    this.deadT = 0;
    this.camX = 0;
    this.paused = false;
    this.reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.pulse = () => 0;         // set by app: the music's beat
    this.fx = { trauma: 0, zoom: 1, zoomTarget: 1, lift: 0, kick: 0, flash: 0, desat: 0, ts: 1, hitstop: 0, slow: false, acc: 0, rewind: 0 };
    this.iris = null;
    this.outroT = 0;
    this.time = 0;
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
    this.world.resize(w, h, this.groundY);
    if (this.state === "idle" || this.state === "cleared") this.buildWorld();
  }

  buildWorld() {
    this.course = buildCourse(this.level);
    this.phys = { groundY: this.groundY, obstacles: this.course.obstacles, pits: this.course.pits, slack: this.course.slack };
    this.speed = this.course.speed;
    this.player.reset(this.groundY);
    this.passed = 0;
    this.hearts = 0;
    this.camX = -this.px;
    this.hero.reset(this.px, this.groundY);
  }

  // Load a level (0-based) and show it, not running.
  setLevel(i) {
    this.index = i;
    this.level = this.levels[i];
    this.state = "idle";
    this.parts.clear();
    this.attempt = 0;
    this.world.setLevel(i, this.W, this.H, this.groundY);
    this.resetFx();
    this.buildWorld();
  }

  resetFx() {
    Object.assign(this.fx, { trauma: 0, zoom: 1, zoomTarget: 1, lift: 0, kick: 0, flash: 0, desat: 0, ts: 1, hitstop: 0, slow: false, acc: 0, rewind: 0 });
  }

  // Start (or restart) the current level from the beginning. rewind: the tape-rewind effect (after a fail).
  begin({ rewind = false } = {}) {
    this.buildWorld();
    this.parts.clear();
    this.input.clear();
    this.attempt++;
    this.resetFx();
    if (rewind && !this.reduced) this.fx.rewind = 0.4;
    this.state = "running";
    this.paused = false;
  }

  get goal() {
    return this.level.goal;
  }

  get progress() {
    return this.course.goal ? this.passed / this.course.goal : 0;
  }

  // The heart iris: "open" reveals the scene from a heart around the runner, "close" shuts it.
  transition(mode, done) {
    this.iris = { mode, t: 0, done };
  }

  // ---------- update (called with fixed 1/60 s steps) ----------

  update(dt) {
    this.time += dt;
    const fx = this.fx;
    const ir = this.iris;
    if (ir && ir.t < IRIS) {
      ir.t = Math.min(IRIS, ir.t + dt);
      if (ir.t >= IRIS) {
        const done = ir.done;
        ir.done = null;
        if (ir.mode === "open" && this.iris === ir) this.iris = null;   // a closed iris stays shut until the next "open"
        done?.();
      }
    }
    if (this.paused) { this.input.consumePress(); return; }

    // time scale: hit-stop (a frozen instant), slow motion on the last obstacle
    let ts = 1;
    if (fx.hitstop > 0) { fx.hitstop -= dt; ts = 0; }
    else {
      const target = fx.slow ? 0.42 : 1;
      fx.ts += (target - fx.ts) * Math.min(1, dt * 10);
      ts = fx.ts;
    }
    const sdt = dt * ts;

    const pulse = this.pulse();
    this.world.update(sdt, { speed: this.speed, moving: this.state === "running" || this.state === "cleared", progress: this.progress, idle: this.state === "idle" });
    this.parts.update(sdt);

    if (this.state === "running" || this.state === "cleared") {
      fx.acc += ts;
      while (fx.acc >= 1 - 1e-9) {
        fx.acc -= 1;
        if (this.state === "running") this.stepRun(STEP);
        else if (this.state === "cleared") this.stepOutro(STEP);
        if (this.state !== "running" && this.state !== "cleared") break;
      }
    } else if (this.state === "dead") {
      this.deadT += sdt;
      const p = this.player;
      if (p.y + P.radius < this.groundY) {                  // fall to the floor
        p.vy += P.gravity * sdt;
        p.y = Math.min(this.groundY - P.radius, p.y + p.vy * sdt);
      }
      fx.desat = Math.min(0.7, fx.desat + sdt * 2.2);
      this.input.consumePress();
    } else {
      this.input.consumePress();   // drop presses nobody wanted
    }

    // camera
    fx.trauma = Math.max(0, fx.trauma - dt * 1.6);
    fx.zoom += (fx.zoomTarget - fx.zoom) * Math.min(1, dt * 6);
    fx.kick += (0 - fx.kick) * Math.min(1, dt * 14);
    fx.flash = Math.max(0, fx.flash - dt * 3);
    fx.rewind = Math.max(0, fx.rewind - dt);
    const p = this.player;
    const rise = Math.max(0, this.groundY - P.radius - p.y);
    const liftTarget = this.state === "dead" ? 0 : Math.min(14, rise * 0.12);
    fx.lift += (liftTarget - fx.lift) * Math.min(1, dt * 5);

    this.hero.update(sdt, this.heroState(pulse));
  }

  heroState(pulse) {
    return {
      state: this.state, player: this.player, screenX: this.px, feetY: Math.round(this.player.y + P.radius),
      groundY: this.groundY, speed: this.state === "cleared" ? this.outroSpeed : this.speed, progress: this.progress, pulse, camX: this.camX, deadT: this.deadT,
      stoppedT: this.state === "cleared" ? this.stoppedT : -1
    };
  }

  stepRun(dt) {
    const p = this.player;
    const fx = this.fx;
    const pressed = this.input.consumePress();
    const vyBefore = p.vy;
    p.step(dt, this.speed, { pressed, held: this.input.held }, this.phys);
    updateMovers(this.course, p.x, dt);
    this.camX = p.x - this.px;

    if (p.dead) {
      this.die();
      return;
    }
    const feet = p.y + P.radius;
    if (p.jumped) {
      this.hooks.onJump?.();
      this.hero.jump();
      this.parts.burst(p.x, feet, 6, 30, 110, 0.35, 2, this.level.colors.glow, { angle: Math.PI * 0.75, spread: 1.6, drag: 3 });
      this.spawnNote();
    }
    if (p.landed) {
      const impact = Math.abs(vyBefore);
      this.hero.land(impact);
      fx.kick = Math.min(4, impact / 220);
      this.parts.burst(p.x, feet, 8, 30, 130, 0.35, 2, shade(this.level.colors.obstacle, 1.15), { angle: -Math.PI / 2, spread: 2.6, g: 300, drag: 2 });
      this.hooks.onLand?.(impact);
    }
    if (p.grounded && Math.random() < 0.35) {
      const q = this.parts.spawn(p.x - 8, feet - 1, -30 - Math.random() * 20, -12 - Math.random() * 14, 0.3, 2, shade(this.level.colors.obstacle, 1.1));
      q.drag = 1;
    }

    this.checkNearMisses();
    this.collectHearts();

    const units = this.course.units;
    while (this.passed < this.course.goal && p.x - P.radius > unitRight(units[this.passed])) {
      const u = units[this.passed];
      this.passed++;
      if (u.near !== undefined && u.near < NEAR_MISS) this.nearMiss(u);
      if (this.passed < this.course.goal) this.hooks.onPass?.(this.passed, this.course.goal);
    }
    // slow motion as the runner reaches the final obstacle
    const last = units[this.course.goal - 1];
    const wasSlow = fx.slow;
    fx.slow = !this.reduced && this.passed === this.course.goal - 1 && last && last.baseLeft + last.offset - p.x < 120;
    if (fx.slow && !wasSlow) this.hooks.onSlowmo?.();

    if (this.passed >= this.course.goal) this.clear();
  }

  spawnNote() {
    const [hx, hy] = this.hero.anchor(this.heroState(0), "head");
    const q = this.parts.spawn(hx + this.camX - 4, hy - 4, -40 - Math.random() * 30, -60 - Math.random() * 30, 0.9, 1, Math.random() < 0.5 ? "#ffd1e3" : this.level.colors.accent, "glyph");
    q.name = "note";
    q.drag = 1.2;
    q.vr = (Math.random() - 0.5) * 2;
  }

  // How close did the runner pass each obstacle it cleared? (only in the air, only when it survived)
  checkNearMisses() {
    const p = this.player;
    if (p.grounded) return;
    for (const o of this.course.obstacles) {
      if (o.right < p.x - 40) continue;
      if (o.left > p.x + 40) break;
      const bottom = this.groundY - o.elev;
      let d;
      if (o.kind === "spike") {
        const w = o.right - o.left;
        d = distToTriangle(p.x, p.y, o.left + w * 0.2, bottom, o.right - w * 0.2, bottom, o.left + w / 2, bottom - o.h * 0.85) - P.hitRadius;
      } else {
        if (p.y + P.radius <= bottom - o.h + 1 && p.x > o.left && p.x < o.right) continue;   // standing on it
        d = Math.sqrt(distSqToBox(p.x, p.y, o.left, bottom - o.h, o.right, bottom)) - P.hitRadius;
      }
      const u = o.unit;
      u.near = u.near === undefined ? d : Math.min(u.near, d);
    }
  }

  nearMiss(u) {
    const p = this.player;
    const q = this.parts.spawn(p.x + 6, p.y - 30, 30, -40, 0.8, 13, "#ffffff", "text");
    q.text = "Close!";
    q.drag = 2;
    this.parts.burst(p.x, p.y, 10, 60, 160, 0.4, 1, "#ffffff", { kind: "glyph", name: "sparkle", add: true, drag: 3 });
    this.hero.whoa = 0.45;
    this.hooks.onNear?.();
  }

  collectHearts() {
    const p = this.player;
    for (const h of this.course.hearts) {
      if (h.got) continue;
      const [hx, hy] = heartPos(this.course, h, this.groundY);
      if (Math.abs(hx - p.x) > 30) continue;
      if ((hx - p.x) ** 2 + (hy - p.y) ** 2 < (HEART_REACH + 4) ** 2) {
        h.got = true;
        this.hearts++;
        this.parts.burst(hx, hy, 14, 50, 170, 0.6, 1, "#ff7fb0", { kind: "glyph", name: "heartSmall", g: 200, drag: 1.5 });
        const r = this.parts.spawn(hx, hy, 0, 0, 0.4, 6, "#ffd1e3", "ring");
        r.grow = 90;
        this.hooks.onHeart?.(this.hearts);
      }
    }
  }

  die() {
    const p = this.player;
    const fx = this.fx;
    this.state = "dead";
    this.deadT = 0;
    fx.slow = false;
    fx.ts = 1;
    fx.hitstop = this.reduced ? 0 : 0.12;
    fx.trauma = this.reduced ? 0 : 0.7;
    fx.zoomTarget = this.reduced ? 1 : 1.07;
    const [hx, hy] = this.hero.anchor(this.heroState(0), "head");
    this.hero.die(hx, hy);
    // a broken heart: two halves fly apart
    for (const [name, vx] of [["halfL", -90], ["halfR", 90]]) {
      const q = this.parts.spawn(p.x, p.y - 22, vx, -220, 1.1, 2, "#ff5d8f", "glyph");
      q.name = name; q.g = 700; q.vr = vx / 30;
    }
    this.parts.burst(p.x, p.y, 20, 60, 260, 0.7, 3, this.level.colors.accent, { g: 500 });
    this.parts.burst(p.x, p.y, 12, 30, 160, 0.5, 2, "#ff7fa8", { g: 300 });
    this.hooks.onFail?.(this.passed, this.course.goal);
  }

  clear() {
    const fx = this.fx;
    this.state = "cleared";
    this.outroT = 0;
    this.outroSpeed = this.speed * 0.85;
    this.stoppedT = -1;
    fx.slow = false;
    fx.flash = 0.7;
    fx.zoomTarget = this.reduced ? 1 : 1.06;
    this.hero.victory();
    this.input.clear();
    this.hooks.onPass?.(this.passed, this.course.goal);
    this.hooks.onClear?.();
    const p = this.player;
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 120 + Math.random() * 220;
      const q = this.parts.spawn(p.x, p.y - 10, Math.cos(a) * v + this.speed * 0.6, Math.sin(a) * v, 1.3, 1 + Math.round(Math.random()), Math.random() < 0.5 ? "#ff7fb0" : this.level.colors.glow, "glyph");
      q.name = Math.random() < 0.7 ? "heartSmall" : "heart";
      q.g = 260; q.drag = 0.8;
    }
    const r = this.parts.spawn(p.x, p.y, 0, 0, 0.6, 10, this.level.colors.glow, "ring");
    r.grow = 260; r.add = true;
  }

  // After the goal: keep running, hop with a spin, then close the iris.
  stepOutro(dt) {
    const p = this.player;
    this.outroT += dt;
    const pressed = this.outroT < dt * 1.5;
    const held = this.outroT < 0.3;
    if (p.grounded && this.outroT > 0.2) this.outroSpeed = Math.max(0, this.outroSpeed - 1100 * dt);   // slow to a stop
    if (this.outroSpeed === 0 && this.stoppedT < 0) this.stoppedT = 0;
    if (this.stoppedT >= 0) this.stoppedT += dt;
    p.step(dt, this.outroSpeed, { pressed, held }, { groundY: this.groundY, obstacles: [], pits: [], slack: 0 });
    p.dead = false;
    this.camX = p.x - this.px;
    if (p.landed) { this.hero.land(400); this.hooks.onLand?.(400); }
    if (this.outroT >= OUTRO && !this.iris) {
      this.transition("close", () => this.hooks.onOutro?.());
    }
  }

  // ---------- draw ----------

  draw() {
    const ctx = this.ctx;
    const L = this.level;
    const fx = this.fx;
    const { W, H } = this;
    const pulse = this.pulse();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = L.colors.skyDeep;
    ctx.fillRect(0, 0, W, H);

    // camera: shake (trauma squared), zoom toward the runner, a little lift when jumping
    const shake = fx.trauma * fx.trauma;
    const t = this.time;
    const sx = shake * 9 * (Math.sin(t * 91) * 0.6 + Math.sin(t * 57) * 0.4);
    const sy = shake * 7 * (Math.cos(t * 83) * 0.6 + Math.sin(t * 41) * 0.4);
    const zoom = Math.max(fx.zoom, 1 + shake * 0.04);
    const cx = this.px, cy = this.player.y;
    ctx.translate(cx + sx, cy + sy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
    const camY = -fx.lift - fx.kick;

    const world = this.world;
    world.drawBack(ctx, camY);
    world.drawProps(ctx, this.camX, camY);
    world.drawMist(ctx);

    ctx.save();
    ctx.translate(0, -camY);
    world.drawFloor(ctx, this.course.pits, this.camX, pulse);
    const hs = this.heroState(pulse);
    const refl = world.reflect;
    if (refl > 0) {
      ctx.save();
      world.clipFloor(ctx, this.course.pits, this.camX);
      ctx.translate(0, this.groundY * 2);
      ctx.scale(1, -1);
      ctx.globalAlpha = refl;
      this.drawObstacles(ctx, L, pulse, true);
      if (this.state !== "dead" || this.deadT < 0.3) this.hero.draw(ctx, hs, L);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    this.drawShadows(ctx);
    this.drawObstacles(ctx, L, pulse, false);
    this.drawHearts(ctx, L);
    this.parts.draw(ctx, this.camX);
    this.hero.draw(ctx, hs, L);
    ctx.restore();
    world.drawWeather(ctx, "front");

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    world.drawPost(ctx, { pulse, desat: fx.desat, flash: fx.flash });
    if (fx.rewind > 0) this.drawRewind(ctx);
    if (this.iris) this.drawIris(ctx);
  }

  drawShadows(ctx) {
    const p = this.player;
    if (this.state === "dead" && this.deadT > 0.5) return;
    // the surface under the runner
    let surface = null;
    for (const o of this.course.obstacles) {
      if (o.left > p.x + 4) break;
      if (o.kind !== "block" || o.right < p.x - 4) continue;
      const top = this.groundY - o.elev - o.h;
      if (top >= p.y + P.radius - 2 && (surface === null || top < surface)) surface = top;
    }
    if (surface === null && this.player.floorAt(p.x, this.course.pits)) surface = this.groundY;
    if (surface !== null) {
      const h = Math.max(0, surface - (p.y + P.radius));
      const w = Math.max(6, 24 * (1 - h / 160));
      ctx.fillStyle = "rgba(0,0,0," + (0.35 * (1 - Math.min(1, h / 180))).toFixed(3) + ")";
      ctx.beginPath();
      ctx.ellipse(this.px, surface + 1, w / 2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // floating platforms cast a shadow on the floor
    for (const o of this.course.obstacles) {
      if (!o.elev) continue;
      const l = o.left - this.camX, r = o.right - this.camX;
      if (r < 0 || l > this.W) continue;
      if (!this.player.floorAt((o.left + o.right) / 2, this.course.pits)) continue;
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse((l + r) / 2, this.groundY + 1, (r - l) / 2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawObstacles(ctx, L, pulse, reflection) {
    const { W, groundY, camX } = this;
    const spike = tintedSprite("spike", L.colors.obstacle);
    const spikeEdge = silhouetteSprite("spike", shade(L.colors.obstacle, 0.18));   // dark edge, so spikes read on any background
    const tile = tintedSprite("block", L.colors.obstacle);
    const cap = tintedSprite("blockcap", L.colors.obstacle);
    const skinSpike = sprite("spike@" + this.index);   // the level's own obstacle art, when it has some
    const skinBlock = sprite("block@" + this.index);
    const glowTips = [];

    for (const o of this.course.obstacles) {
      const l = Math.round(o.left - camX);
      const r = Math.round(o.right - camX);
      if (r < -40 || l > W + 40) continue;
      const bottom = groundY - o.elev;
      const top = bottom - o.h;

      if (o.kind === "spike") {
        if (skinSpike) {
          const edge = silhouetteSprite("spike@" + this.index, "rgba(8,6,14,0.9)");
          if (edge && !reflection) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]]) ctx.drawImage(edge, l + dx, top + dy, r - l, o.h);
          ctx.drawImage(skinSpike, l, top, r - l, o.h);
        } else if (spike) {
          if (spikeEdge) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(spikeEdge, l + dx, top + dy, r - l, o.h);
          ctx.drawImage(spike, l, top, r - l, o.h);
        } else {
          ctx.fillStyle = L.colors.obstacle;
          ctx.beginPath();
          ctx.moveTo(l, bottom);
          ctx.lineTo((l + r) / 2, top);
          ctx.lineTo(r, bottom);
          ctx.fill();
        }
        glowTips.push([(l + r) / 2, top + 3]);
        continue;
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(l, top, r - l, o.h);
      ctx.clip();
      if (skinBlock) {                                  // whole tiles centred, so any cut-off edges match on both sides
        const T = skinBlock.width;
        const extra = (r - l) % T;
        const x0 = extra ? l + Math.floor(extra / 2) - T : l;
        for (let y = top; y < bottom; y += T) for (let x = x0; x < r; x += T) ctx.drawImage(skinBlock, x, y);
      } else if (tile) {
        for (let y = top; y < bottom; y += tile.height) for (let x = l; x < r; x += tile.width) ctx.drawImage(tile, x, y);
      } else {
        ctx.fillStyle = L.colors.obstacle;
        ctx.fillRect(l, top, r - l, o.h);
      }
      if (skinBlock) { /* the tile has its own edge */ }
      else if (cap) for (let x = l; x < r; x += cap.width) ctx.drawImage(cap, x, top);
      else { ctx.fillStyle = shade(L.colors.obstacle, 1.3); ctx.fillRect(l, top, r - l, 4); }
      ctx.restore();
      ctx.strokeStyle = shade(L.colors.obstacle, 0.25);
      ctx.lineWidth = 1;
      ctx.strokeRect(l + 0.5, top + 0.5, r - l - 1, o.h - 1);
      if (!reflection) {                                 // a lit edge that breathes with the beat
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.25 + pulse * 0.5;
        ctx.fillStyle = L.colors.accent;
        ctx.fillRect(l + 1, top + 1, r - l - 2, 1);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    }
    if (reflection) return;

    if (glowTips.length) {
      const glow = glowSprite(L.colors.glow, 32);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.25 + pulse * 0.35;
      for (const [x, y] of glowTips) ctx.drawImage(glow, x - 8, y - 8, 16, 16);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    // sliding obstacles: arrows over them while they can still move
    const blink = Math.sin(this.time * 10) > -0.3;
    for (const u of this.course.units) {
      if (!u.mobile || (u.mv && u.mv.frozen)) continue;
      const l = Math.round(u.baseLeft + u.offset - camX);
      const r = Math.round(u.baseRight + u.offset - camX);
      if (r < -20 || l > W + 20) continue;
      let top = groundY;
      for (const m of u.members) if (m.kind !== "pit") top = Math.min(top, groundY - (m.elev || 0) - m.h);
      const mid = Math.round((l + r) / 2);
      const y = top - 12;
      if (u.mv && u.mv.active) {                          // motion smear while it slides
        const dir = Math.sign(u.mv.target - u.offset);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = L.colors.accent;
        ctx.fillRect(dir > 0 ? l - 8 : r, top + 4, 8, groundY - top - 8);
        ctx.globalAlpha = 1;
      }
      if (!blink) continue;
      ctx.drawImage(glyph("chevL", L.colors.accent), mid - 8, y);
      ctx.drawImage(glyph("chevR", L.colors.accent), mid + 5, y);
    }
  }

  drawHearts(ctx, L) {
    const t = this.time;
    for (const h of this.course.hearts) {
      if (h.got) continue;
      const [wx, wy] = heartPos(this.course, h, this.groundY);
      const x = wx - this.camX;
      if (x < -20 || x > this.W + 20) continue;
      const y = wy + Math.sin(t * 3 + h.unit) * 3;
      const spin = Math.cos(t * 2.4 + h.unit);
      const w = Math.max(2, Math.abs(spin) * 18);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5;
      ctx.drawImage(glowSprite("#ff6fa5", 64), x - 20, y - 20, 40, 40);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      const img = glyph("heart", spin > 0 ? "#ff4f8b" : "#d6336c");
      ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - 8), Math.round(w), 16);
      if (spin > 0.4) ctx.drawImage(glyph("heartShine", "#ffffff"), Math.round(x - w / 2), Math.round(y - 8), Math.round(w), 16);
    }
  }

  // VHS-style rewind after a retry: the picture tears sideways in bands for a moment.
  drawRewind(ctx) {
    const k = this.fx.rewind / 0.4;
    const bands = 14;
    const h = Math.ceil(this.H / bands);
    for (let i = 0; i < bands; i++) {
      const off = Math.round(Math.sin(i * 1.7 + this.time * 40) * 18 * k);
      if (off) ctx.drawImage(this.canvas, 0, i * h, this.W, h, off, i * h, this.W, h);
    }
    ctx.globalAlpha = 0.25 * k;
    ctx.fillStyle = "#ffffff";
    for (let y = (this.time * 600) % 6; y < this.H; y += 6) ctx.fillRect(0, Math.round(y), this.W, 1);
    ctx.globalAlpha = 1;
  }

  drawIris(ctx) {
    const { W, H } = this;
    const k = Math.min(1, this.iris.t / IRIS);
    const e = k * k * (3 - 2 * k);
    const open = this.iris.mode === "open" ? e : 1 - e;
    const cx = this.px;
    const cy = this.player.y - 6;
    const size = open * Math.hypot(W, H) * 2.6;
    ctx.fillStyle = "#07060b";
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    if (size > 1) heartPath(ctx, cx, cy, size);
    ctx.fill("evenodd");
  }
}

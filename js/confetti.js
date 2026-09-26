import { glyph } from "./art.js";

// Pixel-heart confetti on a canvas that covers a card (the unlock card, the end screen).
// Runs its own animation frame loop only while something is on screen.

const COLORS = ["#ff5d8f", "#ff9ec0", "#ffd35c", "#ffffff", "#ff7a5c"];

export function createConfetti(canvas) {
  const ctx = canvas.getContext("2d");
  const bits = [];
  let raf = 0;
  let last = 0;
  let rain = 0;          // hearts per second falling from the top (the end screen)
  let rainAcc = 0;
  let accent = "#ff5d8f";

  function size() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return dpr;
  }

  function add(x, y, vx, vy, scale) {
    if (bits.length > 220) bits.shift();
    const c = Math.random() < 0.2 ? accent : COLORS[Math.floor(Math.random() * COLORS.length)];
    bits.push({ x, y, vx, vy, s: scale, rot: (Math.random() - 0.5) * 0.8, vr: (Math.random() - 0.5) * 3, c, life: 3 + Math.random() * 2, sway: Math.random() * 6, heart: Math.random() < 0.7 });
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    const dpr = size();
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    if (rain) {
      rainAcc += dt * rain;
      while (rainAcc >= 1) { rainAcc--; add(Math.random() * W, -20, (Math.random() - 0.5) * 30 * dpr, (40 + Math.random() * 50) * dpr, (2 + Math.round(Math.random() * 2)) * dpr); }
    }
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.life -= dt;
      b.sway += dt * 3;
      b.vy += 260 * dpr * dt * (rain ? 0.05 : 1);
      b.vx *= 1 - dt * 1.2;
      b.x += (b.vx + Math.sin(b.sway) * 20 * dpr) * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      if (b.life <= 0 || b.y > H + 30) { bits.splice(i, 1); continue; }
      const img = glyph(b.heart ? "heart" : "sparkle", b.c);
      const w = img.width * b.s, h = img.height * b.s;
      ctx.globalAlpha = Math.min(1, b.life);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.scale(Math.cos(b.sway * 0.7) || 0.1, 1);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (bits.length || rain) raf = requestAnimationFrame(frame);
    else raf = 0;
  }

  function run() {
    if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
  }

  return {
    setAccent(c) { accent = c; },
    // a burst from a point (fractions of the canvas)
    burst(fx = 0.5, fy = 0.4, n = 60) {
      const dpr = size();
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
        const v = (220 + Math.random() * 420) * dpr;
        add(canvas.width * fx, canvas.height * fy, Math.cos(a) * v, Math.sin(a) * v, (2 + Math.round(Math.random() * 2)) * dpr);
      }
      run();
    },
    rain(perSecond) {
      rain = perSecond;
      if (rain) run();
    },
    stop() {
      rain = 0;
      bits.length = 0;
      cancelAnimationFrame(raf);
      raf = 0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };
}

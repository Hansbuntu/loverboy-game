import { glyph } from "./art.js";

// A pooled particle system: a fixed set of objects reused forever, so nothing is allocated while playing.
// Positions are in world space (x scrolls with the camera) unless `screen` is set.
//
//   kind  "px"      a square pixel (size x size)
//         "glyph"   a pixel glyph from art.js (heart, note, sparkle, halfL ...), scaled by `size`
//         "ring"    an expanding circle outline
//         "text"    a short word ("Close!")

const MAX = 360;

export class Particles {
  constructor() {
    this.items = Array.from({ length: MAX }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0, max: 1, size: 1, color: "#fff",
      kind: "px", name: "", rot: 0, vr: 0, add: false, screen: false, text: "", grow: 0, fade: 1
    }));
    this.n = 0;
    this.next = 0;
  }

  clear() {
    this.n = 0;
  }

  // Returns the particle so the caller can set extra fields.
  spawn(x, y, vx, vy, life, size, color, kind = "px") {
    let q;
    if (this.n < MAX) q = this.items[this.n++];
    else { q = this.items[this.next]; this.next = (this.next + 1) % MAX; }   // full: recycle the oldest slots
    q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.life = life; q.max = life; q.size = size; q.color = color; q.kind = kind;
    q.g = 0; q.drag = 0; q.rot = 0; q.vr = 0; q.add = false; q.screen = false; q.name = ""; q.text = ""; q.grow = 0; q.fade = 1;
    return q;
  }

  // n particles flying out in all directions.
  burst(x, y, n, minV, maxV, life, size, color, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = opts.angle !== undefined ? opts.angle + (Math.random() - 0.5) * (opts.spread ?? Math.PI * 2) : Math.random() * Math.PI * 2;
      const v = minV + Math.random() * (maxV - minV);
      const q = this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.4), size, color, opts.kind || "px");
      q.g = opts.g || 0;
      q.drag = opts.drag || 0;
      q.add = !!opts.add;
      q.name = opts.name || "";
      q.vr = opts.spin ? (Math.random() - 0.5) * opts.spin : 0;
    }
  }

  update(dt) {
    const list = this.items;
    for (let i = this.n - 1; i >= 0; i--) {
      const q = list[i];
      q.life -= dt;
      if (q.life <= 0) {                     // swap-remove
        this.n--;
        const last = list[this.n];
        list[this.n] = q;
        list[i] = last;
        continue;
      }
      q.vy += q.g * dt;
      if (q.drag) { const k = Math.max(0, 1 - q.drag * dt); q.vx *= k; q.vy *= k; }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.vr * dt;
      q.size += q.grow * dt;
    }
  }

  // camX: world scroll. Additive particles are drawn in a second pass with "lighter".
  draw(ctx, camX) {
    for (let pass = 0; pass < 2; pass++) {
      const add = pass === 1;
      if (add) ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < this.n; i++) {
        const q = this.items[i];
        if (q.add !== add) continue;
        const t = q.life / q.max;
        ctx.globalAlpha = Math.min(1, t * 2.2) * q.fade;
        const x = q.screen ? q.x : q.x - camX;
        if (q.kind === "px") {
          ctx.fillStyle = q.color;
          const s = Math.max(1, Math.round(q.size * (0.5 + t * 0.5)));
          ctx.fillRect(Math.round(x - s / 2), Math.round(q.y - s / 2), s, s);
        } else if (q.kind === "glyph") {
          const img = glyph(q.name, q.color);
          const w = img.width * q.size;
          const h = img.height * q.size;
          if (q.rot) {
            ctx.save();
            ctx.translate(Math.round(x), Math.round(q.y));
            ctx.rotate(q.rot);
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            ctx.restore();
          } else {
            ctx.drawImage(img, Math.round(x - w / 2), Math.round(q.y - h / 2), w, h);
          }
        } else if (q.kind === "ring") {
          ctx.strokeStyle = q.color;
          ctx.lineWidth = Math.max(1, 3 * t);
          ctx.beginPath();
          ctx.arc(Math.round(x), Math.round(q.y), q.size, 0, Math.PI * 2);
          ctx.stroke();
        } else if (q.kind === "text") {
          ctx.font = "700 " + Math.round(q.size) + "px 'Pixelify Sans', monospace";
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillText(q.text, Math.round(x) + 1, Math.round(q.y) + 2);
          ctx.fillStyle = q.color;
          ctx.fillText(q.text, Math.round(x), Math.round(q.y));
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

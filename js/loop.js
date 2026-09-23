// Fixed-timestep loop: game logic always advances in identical 1/60 s steps (so physics behave the
// same on a 60Hz phone and a 240Hz monitor), while drawing happens once per display frame.
// Stops itself while the tab is hidden, so a run is never lost to a tab switch.
const STEP = 1 / 60;
const MAX_FRAME = 0.1;   // clamp long stalls instead of fast-forwarding

export class GameLoop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.raf = 0;
    this.last = 0;
    this.acc = 0;
    this.running = false;
    this.frame = (now) => {
      const t = now / 1000;
      if (this.last === 0) this.last = t;
      this.acc += Math.min(t - this.last, MAX_FRAME);
      this.last = t;
      while (this.acc >= STEP) {
        this.update(STEP);
        this.acc -= STEP;
      }
      this.render();
      this.raf = requestAnimationFrame(this.frame);
    };
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancelAnimationFrame(this.raf);
      else if (this.running) this.resume();
    });
  }

  start() {
    this.running = true;
    if (!document.hidden) this.resume();
  }

  resume() {
    cancelAnimationFrame(this.raf);
    this.last = 0;
    this.raf = requestAnimationFrame(this.frame);
  }
}

// One input: jump. Keyboard (Space / Up / W), mouse, touch and pen all feed the same state.
// Events only set flags; the physics step reads them, so a press is picked up on the very next
// 1/60 s step with no other delay.
const KEYS = new Set(["Space", "ArrowUp", "KeyW"]);

function onControl(target) {
  return target instanceof Element && target.closest("input, button, label, form, a") !== null;
}

export class JumpInput {
  constructor() {
    this.pending = false;
    this.keys = new Set();
    this.pointers = new Set();
  }

  get held() {
    return this.keys.size > 0 || this.pointers.size > 0;
  }

  // True once per press. Call from the physics step.
  consumePress() {
    const p = this.pending;
    this.pending = false;
    return p;
  }

  // Forget everything (focus loss, level change) so nothing stays "stuck" pressed.
  clear() {
    this.pending = false;
    this.keys.clear();
    this.pointers.clear();
  }

  // Pointer input on `surface`, keys on the window. `onPress` runs on every press (used for game flow).
  attach(surface, onPress) {
    const down = (e) => {
      if (onControl(e.target)) return;
      this.pointers.add(e.pointerId);
      this.pending = true;
      onPress?.(e);
    };
    const end = (e) => this.pointers.delete(e.pointerId);
    const keyDown = (e) => {
      if (!KEYS.has(e.code) || onControl(e.target)) return;
      e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pending = true;
      onPress?.(e);
    };
    const keyUp = (e) => this.keys.delete(e.code);

    surface.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", () => this.clear());
  }
}

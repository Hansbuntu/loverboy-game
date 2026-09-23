// Haptics. Android/Chrome uses the Vibration API. iPhone Safari has none, but (iOS 17.4+) toggling a
// hidden <input type=checkbox switch> gives the system's light haptic tick, so that is used instead.
// Silent no-op wherever neither works (desktop).
//
//   tick    a light tick on each action (a jump)
//   pass    a stronger buzz on passing an obstacle or the goal
//   fail    a triple pulse
//   unlock  a long pattern

const VIBRATE = {
  tick: [8],
  pass: [26],
  fail: [45, 45, 45, 45, 45],
  unlock: [30, 50, 30, 50, 30, 50, 160]
};
const SWITCH_TICKS = { tick: 1, pass: 2, fail: 3, unlock: 6 };

const canVibrate = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
let label = null;

function ensureSwitch() {
  if (label || canVibrate || typeof document === "undefined") return;
  try {
    label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.display = "none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.appendChild(input);
    document.head.appendChild(label);
  } catch {
    label = null;
  }
}

export function haptic(kind) {
  if (canVibrate) {
    try { navigator.vibrate(VIBRATE[kind] || 10); } catch { /* ignore */ }
    return;
  }
  ensureSwitch();
  if (!label) return;
  for (let i = 0; i < (SWITCH_TICKS[kind] || 1); i++) {
    setTimeout(() => { try { label.click(); } catch { /* ignore */ } }, i * 70);
  }
}

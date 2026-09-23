// Sound. Every effect is synthesized with Web Audio: there are no sound files. The only audio files
// are the song clips (audio/track-01.mp3 ...), played through one shared <audio> element.
//
// Browsers only allow sound after the person has tapped, so nothing plays until unlockAudio() runs
// on the first tap/click/key. On phones a <audio> element can only be started later, without a tap
// (the unlock card appears on its own), if it was started by a real tap once, so unlockAudio()
// primes it muted.

let ctx = null;

function ensureContext() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
  }
  return ctx;
}

// One short synthesized note.
function tone(f1, f2, seconds, type, volume, delay = 0) {
  const c = ensureContext();
  if (!c) return;
  try {
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f1, t);
    osc.frequency.linearRampToValueAtTime(f2, t + seconds);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.linearRampToValueAtTime(0, t + seconds);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + seconds);
  } catch { /* ignore */ }
}

export const sfx = {
  jump: () => tone(360, 620, 0.09, "square", 0.05),
  pass: () => tone(880, 1040, 0.05, "sine", 0.06),
  fail: () => tone(300, 80, 0.38, "sawtooth", 0.16),
  unlock() {                                   // a bright three-note chime
    tone(523, 523, 0.12, "triangle", 0.18, 0);
    tone(659, 659, 0.12, "triangle", 0.18, 0.09);
    tone(784, 784, 0.22, "triangle", 0.18, 0.18);
  }
};

// ---- songs ----
const el = typeof Audio !== "undefined" ? new Audio() : null;
if (el) {
  el.loop = true;
  el.preload = "auto";
}
let failed = false;
if (el) {
  el.addEventListener("error", () => { failed = true; });
  el.addEventListener("loadstart", () => { failed = false; });
}

export const music = {
  get failed() { return failed; },
  // seconds, or NaN until the clip's metadata has loaded
  get duration() { return el ? el.duration : NaN; },
  get src() { return el ? el.getAttribute("src") : null; },
  get playing() { return !!el && !el.paused; },
  get position() { return el ? el.currentTime : 0; },
  get volume() { return el ? el.volume : 0; },

  // Point the player at a clip. Does nothing if it is already loaded (so a level can resume, not restart).
  load(src, { fromStart = false } = {}) {
    if (!el) return;
    if (el.getAttribute("src") !== src) {
      failed = false;   // forget the previous clip's load error now, not on the async loadstart event
      el.setAttribute("src", src);
      try { el.currentTime = 0; } catch { /* metadata not ready yet */ }
    } else if (fromStart) {
      try { el.currentTime = 0; } catch { /* metadata not ready yet */ }
    }
  },
  play(volume) {
    if (!el) return Promise.resolve();
    el.volume = volume;
    return el.play().catch(() => {});
  },
  setVolume(v) { if (el) el.volume = v; },
  pause() { try { el?.pause(); } catch { /* ignore */ } },
  // run `fn` once the clip's length is known, or loading failed
  whenReady(fn) {
    if (!el) return fn();
    if (failed || isFinite(el.duration)) return fn();
    el.addEventListener("loadedmetadata", fn, { once: true });
    el.addEventListener("error", fn, { once: true });
  }
};

let unlocked = false;

// Call from a real tap / click / key press.
export function unlockAudio(firstClip) {
  if (unlocked) return;
  unlocked = true;
  const c = ensureContext();
  try { if (c && c.state === "suspended") c.resume(); } catch { /* ignore */ }
  if (!el) return;
  try {
    const wasSrc = el.getAttribute("src");
    if (!wasSrc && firstClip) el.setAttribute("src", firstClip);
    el.muted = true;
    const done = () => {
      if (!wasSrc) { try { el.pause(); } catch { /* ignore */ } }
      el.muted = false;
    };
    const p = el.play();
    if (p && p.then) p.then(done, done); else done();
  } catch {
    el.muted = false;
  }
}

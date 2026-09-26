// Sound. Every effect is synthesized with Web Audio: there are no sound files. The only audio files
// are the song clips (audio/track-01.mp3 ...), played through one shared <audio> element.
//
//   sfx     jump, land, pass (each obstacle plays the next note of the level's scale, so a clean run
//           plays a tune), near miss, heart, fail, clear, unlock, rewind, countdown, thunder
//   score   a quiet synthesized soundtrack for levels with no song playing yet (level 1, or a missing
//           file). It builds as you go: a pad, then a soft kick, hats, and an arpeggio near the end.
//   music   the song clips. Failing stops the song like a tape (it slows and drops in pitch).
//   pulse() 0..1 on every beat of whatever is playing, for the visuals. For a song, the beats are
//           found by reading the clip once (it is never re-routed, so iPhones still play it on silent).
//
// Browsers only allow sound after the person has tapped, so nothing plays until unlockAudio() runs
// on the first tap/click/key. On phones a <audio> element can only be started later, without a tap
// (the unlock card appears on its own), if it was started by a real tap once, so unlockAudio()
// primes it muted.

let ctx = null;
let master = null;
let fxBus = null;
let reverbIn = null;
let muted = false;

function ensureContext() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
    if (ctx) buildGraph();
  }
  return ctx;
}

function buildGraph() {
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp);
  comp.connect(ctx.destination);
  fxBus = ctx.createGain();
  fxBus.connect(master);
  // a soft hall reverb from generated noise
  const conv = ctx.createConvolver();
  conv.buffer = impulse(2.4, 3.2);
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  reverbIn = ctx.createGain();
  reverbIn.connect(conv);
  conv.connect(wet);
  wet.connect(master);
}

function impulse(seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// One synthesized note. Returns the oscillator (so the score can bend it) or null.
function voice({ f, f2 = f, dur = 0.2, vol = 0.1, type = "sine", attack = 0.005, delay = 0, rev = 0, out = fxBus, detune = 0, filter = 0 }) {
  const c = ensureContext();
  if (!c || c.state !== "running") return null;
  try {
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(f, t);
    if (f2 !== f) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (filter) {
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = filter;
      osc.connect(lp);
      node = lp;
    }
    node.connect(g);
    g.connect(out);
    if (rev) {
      const s = c.createGain();
      s.gain.value = rev;
      g.connect(s);
      s.connect(reverbIn);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return osc;
  } catch { return null; }
}

// A burst of filtered noise (whooshes, hats, splashes, thunder).
function hiss({ dur = 0.2, vol = 0.1, f = 2000, f2 = f, q = 1, type = "bandpass", delay = 0, rev = 0, attack = 0.005, out = fxBus }) {
  const c = ensureContext();
  if (!c || c.state !== "running") return;
  try {
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noise();
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = type;
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f, t);
    if (f2 !== f) bp.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    if (rev) { const s = c.createGain(); s.gain.value = rev; g.connect(s); s.connect(reverbIn); }
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  } catch { /* ignore */ }
}

// A soft bell: a sine with a quieter inharmonic partial.
function bell(f, vol, dur = 0.9, delay = 0, rev = 0.5) {
  voice({ f, dur, vol, type: "sine", delay, rev, attack: 0.004 });
  voice({ f: f * 2.01, dur: dur * 0.45, vol: vol * 0.35, type: "sine", delay, rev, attack: 0.002 });
  voice({ f: f * 3.98, dur: dur * 0.18, vol: vol * 0.12, type: "triangle", delay, rev });
}

// ---- the level's key: each level has a root note and a mood (minor while guarded, major once open) ----
const KEYS = [
  { root: 440.0, mode: "minor", bpm: 84 },     // A minor   Do You Love Me
  { root: 392.0, mode: "minor", bpm: 88 },     // G minor   Lady In Red
  { root: 369.99, mode: "minor", bpm: 92 },    // F# minor  The End Is Near
  { root: 392.0, mode: "major", bpm: 90 },     // G major   Nakupenda
  { root: 440.0, mode: "major", bpm: 94 },     // A major   Bonnie And Clyde
  { root: 493.88, mode: "major", bpm: 86 },    // B major   I No Fit Lie
  { root: 523.25, mode: "major", bpm: 96 }     // C major   The End
];
const PENT = { minor: [0, 3, 5, 7, 10], major: [0, 2, 4, 7, 9] };
const CHORDS = { minor: [[0, 3, 7, 10, 14], [8, 12, 15, 19, 22], [3, 7, 10, 14, 17], [10, 14, 17, 21, 24]], major: [[0, 4, 7, 11, 14], [7, 11, 14, 17, 21], [9, 12, 16, 19, 23], [5, 9, 12, 16, 19]] };
const semi = (f, n) => f * Math.pow(2, n / 12);
let key = KEYS[0];

export const sfx = {
  setLevel(i) { key = KEYS[i % KEYS.length]; },
  tap: () => voice({ f: 1200, f2: 900, dur: 0.05, vol: 0.03, type: "triangle" }),
  jump() {
    const f = 330 * (0.97 + Math.random() * 0.06);
    voice({ f, f2: f * 1.9, dur: 0.12, vol: 0.06, type: "triangle", filter: 3000 });
    hiss({ dur: 0.06, vol: 0.02, f: 5000, q: 0.7 });
  },
  land(k = 1) {
    voice({ f: 150, f2: 55, dur: 0.1, vol: 0.09 * k, type: "sine" });
    hiss({ dur: 0.05, vol: 0.025 * k, f: 900, q: 0.8 });
  },
  // the next note of the tune: n = obstacles passed so far (1, 2, ...), of goal
  pass(n, goal) {
    const scale = PENT[key.mode];
    const i = n - 1;
    const deg = scale[i % 5] + 12 * Math.min(1, Math.floor(i / 5));
    const f = semi(key.root, deg);
    bell(f, 0.07, 0.8, 0, 0.45);
    if (n === goal) bell(semi(key.root, 12 + (key.mode === "major" ? 4 : 3)), 0.05, 1.2, 0.08, 0.6);
  },
  near() {
    voice({ f: 1760, dur: 0.35, vol: 0.035, type: "sine", rev: 0.7 });
    voice({ f: 2637, dur: 0.3, vol: 0.025, type: "sine", delay: 0.06, rev: 0.7 });
  },
  heart() {
    [0, 4, 7, 12].forEach((n, k) => bell(semi(key.root * 2, n), 0.05, 0.5, k * 0.055, 0.5));
  },
  fail() {
    voice({ f: 220, f2: 70, dur: 0.5, vol: 0.14, type: "triangle", filter: 900 });
    voice({ f: 180, f2: 48, dur: 0.6, vol: 0.12, type: "sine" });
    hiss({ dur: 0.35, vol: 0.06, f: 1800, f2: 200, q: 1.2 });
  },
  clear() {
    hiss({ dur: 0.9, vol: 0.07, f: 400, f2: 6000, q: 0.9, attack: 0.5, rev: 0.4 });
    const ch = CHORDS[key.mode][0];
    ch.slice(0, 4).forEach((n, k) => bell(semi(key.root / 2, n + 12), 0.05, 1.6, 0.4 + k * 0.05, 0.7));
  },
  unlock() {                                   // a shimmering rising arpeggio
    const ch = key.mode === "major" ? [0, 4, 7, 11, 14, 19, 24] : [0, 3, 7, 10, 14, 19, 24];
    ch.forEach((n, k) => bell(semi(key.root / 2, n + 12), 0.07, 1.4, k * 0.07, 0.7));
    voice({ f: semi(key.root / 4, 0), dur: 1.8, vol: 0.08, type: "sine", attack: 0.02, rev: 0.4 });
  },
  rewind() {
    hiss({ dur: 0.28, vol: 0.05, f: 600, f2: 4800, q: 2 });
    voice({ f: 200, f2: 900, dur: 0.25, vol: 0.03, type: "sawtooth", filter: 1800 });
  },
  count(last) {
    bell(last ? semi(key.root, 12) : key.root, 0.07, last ? 0.8 : 0.3, 0, 0.3);
  },
  thunder() {
    hiss({ dur: 2.2, vol: 0.12, f: 180, f2: 60, q: 0.5, type: "lowpass", attack: 0.05, rev: 0.6 });
    hiss({ dur: 0.4, vol: 0.05, f: 900, f2: 200, q: 0.6 });
  },
  heartbeat() {
    voice({ f: 70, f2: 45, dur: 0.14, vol: 0.2, type: "sine" });
    voice({ f: 66, f2: 42, dur: 0.16, vol: 0.14, type: "sine", delay: 0.22 });
  }
};

// ---- the score: a quiet generated soundtrack that builds through the level ----

let scoreOn = false;
let scoreTimer = 0;
let scoreGain = null;
let nextBeat = 0;
let beatIndex = 0;
let intensity = 0;
let lastBeatAt = -10;
let padVoices = [];

function scoreOut() {
  if (!scoreGain) {
    scoreGain = ctx.createGain();
    scoreGain.connect(master);
  }
  return scoreGain;
}

function scheduleScore() {
  if (!scoreOn || !ctx || ctx.state !== "running") return;
  const spb = 60 / key.bpm / 2;                        // eighth notes
  const out = scoreOut();
  while (nextBeat < ctx.currentTime + 0.12) {
    const step = beatIndex % 8;
    const bar = Math.floor(beatIndex / 8) % 4;
    const delay = Math.max(0, nextBeat - ctx.currentTime);
    const chord = CHORDS[key.mode][bar];
    const base = key.root / 4;
    if (step === 0) {
      padVoices = padVoices.filter((o) => o.__end > ctx.currentTime);
      for (const n of chord.slice(0, 4)) {
        for (const det of [-7, 7]) {
          const o = voice({ f: semi(base, n), dur: spb * 8 + 0.4, vol: 0.022, type: "sawtooth", attack: 0.35, delay, detune: det, filter: 700 + intensity * 900, out, rev: 0.35 });
          if (o) { o.__end = ctx.currentTime + delay + spb * 8 + 0.4; padVoices.push(o); }
        }
      }
      voice({ f: semi(base / 2, chord[0]), dur: spb * 8, vol: 0.05, type: "sine", attack: 0.1, delay, out });
    }
    if (step % 2 === 0) setTimeout(() => { lastBeatAt = performance.now(); }, delay * 1000);
    if (intensity >= 0.25 && step % 4 === 0) voice({ f: 120, f2: 42, dur: 0.22, vol: 0.13, type: "sine", delay, out });
    if (intensity >= 0.5 && step % 2 === 1) hiss({ dur: 0.04, vol: 0.018, f: 8000, q: 0.8, type: "highpass", delay, out });
    if (intensity >= 0.5 && step === 4) hiss({ dur: 0.12, vol: 0.035, f: 1800, q: 0.7, delay, out, rev: 0.3 });
    if (intensity >= 0.75) {
      const arp = [0, 2, 1, 3, 2, 4, 3, 1][step];
      bell(semi(key.root, chord[arp] - 12), 0.024, 0.45, delay, 0.5);
    }
    nextBeat += spb;
    beatIndex++;
  }
}

export const score = {
  get on() { return scoreOn; },
  start(levelIndex) {
    const c = ensureContext();
    if (!c) return;
    sfx.setLevel(levelIndex);
    if (scoreOn) return;
    scoreOn = true;
    intensity = 0;
    const g = scoreOut();
    g.gain.cancelScheduledValues(c.currentTime);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.linearRampToValueAtTime(1, c.currentTime + 0.6);
    nextBeat = c.currentTime + 0.05;
    beatIndex = 0;
    clearInterval(scoreTimer);
    scoreTimer = setInterval(scheduleScore, 25);
    scheduleScore();
  },
  setIntensity(v) { intensity = v; },
  // like a tape stopping: everything bends down and fades
  stop(tape = false) {
    if (!scoreOn) return;
    scoreOn = false;
    clearInterval(scoreTimer);
    if (!ctx || !scoreGain) return;
    const t = ctx.currentTime;
    scoreGain.gain.cancelScheduledValues(t);
    scoreGain.gain.setValueAtTime(scoreGain.gain.value, t);
    scoreGain.gain.linearRampToValueAtTime(0.0001, t + (tape ? 0.55 : 0.4));
    if (tape) for (const o of padVoices) { try { o.detune.linearRampToValueAtTime(-1400, t + 0.55); } catch { /* ended */ } }
    padVoices = [];
  }
};

// ---- songs ----
const el = typeof Audio !== "undefined" ? new Audio() : null;
if (el) {
  el.loop = true;
  el.preload = "auto";
  try { el.preservesPitch = false; el.mozPreservesPitch = false; el.webkitPreservesPitch = false; } catch { /* ignore */ }
}
let failed = false;
if (el) {
  el.addEventListener("error", () => { failed = true; });
  el.addEventListener("loadstart", () => { failed = false; });
}
let tapeTimer = 0;
let fadeTimer = 0;
const beats = new Map();       // src -> Float32Array of beat strength, 30 per second

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
      el.addEventListener("loadedmetadata", () => analyse(src), { once: true });   // only for files that exist
    } else if (fromStart) {
      try { el.currentTime = 0; } catch { /* metadata not ready yet */ }
    }
  },
  play(volume) {
    if (!el) return Promise.resolve();
    clearInterval(tapeTimer);
    clearInterval(fadeTimer);
    try { el.playbackRate = 1; } catch { /* ignore */ }
    el.volume = volume;
    el.muted = muted;
    return el.play().catch(() => {});
  },
  // start quietly and swell to `volume` (used when a song resumes after a retry)
  fadeIn(volume, ms = 450) {
    if (!el) return;
    this.play(0).then(() => {});
    const t0 = performance.now();
    clearInterval(fadeTimer);
    fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      el.volume = volume * k;
      if (k >= 1) clearInterval(fadeTimer);
    }, 30);
  },
  setVolume(v) { if (el) { clearInterval(fadeTimer); el.volume = v; } },
  pause() { clearInterval(tapeTimer); clearInterval(fadeTimer); try { el?.pause(); el.playbackRate = 1; } catch { /* ignore */ } },
  // the tape stops: the song slows and drops in pitch, then pauses (keeping its place for the retry)
  tapeStop(ms = 520) {
    if (!el || el.paused) return;
    clearInterval(tapeTimer);
    clearInterval(fadeTimer);
    const t0 = performance.now();
    const v0 = el.volume;
    tapeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      try { el.playbackRate = Math.max(0.3, 1 - 0.7 * k * k); el.volume = v0 * (1 - k * 0.8); } catch { /* ignore */ }
      if (k >= 1) {
        clearInterval(tapeTimer);
        try { el.pause(); el.playbackRate = 1; el.volume = v0; } catch { /* ignore */ }
      }
    }, 16);
  },
  // run `fn` once the clip's length is known, or loading failed
  whenReady(fn) {
    if (!el) return fn();
    if (failed || isFinite(el.duration)) return fn();
    el.addEventListener("loadedmetadata", fn, { once: true });
    el.addEventListener("error", fn, { once: true });
  }
};

// Read a clip once to find its beats (for the visuals). Never routes playback through Web Audio.
async function analyse(src) {
  if (beats.has(src) || typeof fetch === "undefined") return;
  beats.set(src, null);
  try {
    const c = ensureContext();
    if (!c) return;
    const res = await fetch(src);
    if (!res.ok) return;
    const data = await decode(c, await res.arrayBuffer());
    if (!data) return;
    const ch = data.getChannelData(0);
    const hop = Math.floor(data.sampleRate / 30);
    const n = Math.floor(ch.length / hop);
    const env = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = i * hop; j < (i + 1) * hop; j += 4) s += ch[j] * ch[j];
      env[i] = Math.sqrt(s / (hop / 4));
    }
    const out = new Float32Array(n);
    let max = 1e-6;
    for (let i = 0; i < n; i++) {
      let avg = 0;
      for (let k = 1; k <= 10; k++) avg += env[Math.max(0, i - k)];
      avg /= 10;
      out[i] = Math.max(0, env[i] - avg * 1.15);
      max = Math.max(max, out[i]);
    }
    for (let i = 0; i < n; i++) out[i] = Math.min(1, out[i] / (max * 0.6));
    beats.set(src, out);
  } catch { /* no beats: the visuals use the score's pulse or a gentle breath */ }
}

function decode(c, buf) {
  return new Promise((ok) => {
    try {
      const p = c.decodeAudioData(buf, ok, () => ok(null));
      if (p && p.catch) p.catch(() => ok(null));
    } catch { ok(null); }
  });
}

let pulseSmooth = 0;
let pulseAt = 0;
// 0..1: how hard the beat is hitting right now. With nothing playing, a slow resting heartbeat.
export function pulse() {
  const now = performance.now();
  let v = 0;
  let source = false;
  if (el && !el.paused) {
    const b = beats.get(el.getAttribute("src"));
    if (b) {
      source = true;
      const i = Math.floor(el.currentTime * 30);
      v = Math.max(b[i] || 0, (b[i - 1] || 0) * 0.7);
    }
  }
  if (scoreOn) { source = true; v = Math.max(v, Math.exp(-(now - lastBeatAt) / 140)); }
  if (!source) v = Math.pow(Math.max(0, Math.cos((now / 1000) * Math.PI * (key.bpm / 60))), 10) * 0.7;
  const decay = Math.exp(-Math.max(0, now - pulseAt) / 110);
  pulseAt = now;
  pulseSmooth = Math.max(v, pulseSmooth * decay);
  return pulseSmooth;
}

// Sound on/off (saved in settings).
export function setMuted(m) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.03);
  if (el) el.muted = m;
}

let unlocked = false;

// Call from a real tap / click / key press.
export function unlockAudio(firstClip) {
  const c = ensureContext();
  try { if (c && c.state === "suspended") c.resume(); } catch { /* ignore */ }
  if (unlocked) return;
  unlocked = true;
  if (!el) return;
  try {
    const wasSrc = el.getAttribute("src");
    if (!wasSrc && firstClip) el.setAttribute("src", firstClip);
    el.muted = true;
    const done = () => {
      if (!wasSrc) { try { el.pause(); } catch { /* ignore */ } }
      el.muted = muted;
    };
    const p = el.play();
    if (p && p.then) p.then(done, done); else done();
  } catch {
    el.muted = muted;
  }
}

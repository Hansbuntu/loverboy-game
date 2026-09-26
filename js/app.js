import { CONFIG, trackAudio, validateConfig } from "./config.js";
import { music, pulse, score, setMuted, sfx, unlockAudio } from "./audio.js";
import { createConfetti } from "./confetti.js";
import { isValidEmail, savedEmail, submitEmail } from "./email.js";
import { haptic, setHaptics } from "./haptics.js";
import { JumpInput } from "./input.js";
import { GameLoop } from "./loop.js";
import { browserStorage, createHearts, createProgress } from "./progress.js";
import { Runner } from "./runner.js";
import { createSettings } from "./settings.js";
import { loadSprites, sprite, SPRITE_FILES } from "./sprites.js";

// The flow: start -> [play <-> fail] -> unlock card -> next level intro -> ... -> finale.
//
//   state  "start"    the title screen ("Tap to begin")
//          "intro"    a level card ("Level N: Title / Tap to start the next level")
//          "playing"  running (may be paused: the pause menu and a 3-2-1 countdown)
//          "dying"    the death moment, before the fail card
//          "failed"   the fail card (tap to retry)
//          "clearing" the goal is reached: the victory hop and the heart iris
//          "reveal"   the "Track unlocked" card, playing the preview
//          "finale"   the end screen with the email form

validateConfig();

const LEVELS = CONFIG.levels;
const TOTAL = LEVELS.length;
const PREVIEW_GRACE = 900;     // ms before a tap can skip the unlock card
const RETRY_GRACE = 250;       // ms before a tap can retry after failing
const FAIL_DELAY = 720;        // ms of the death moment before the fail card
const NO_AUDIO_PREVIEW = 3500; // ms of "preview" when the song file is missing
const BG_VOLUME = 0.35;        // the unlocked song plays quietly under the next level

const $ = (id) => document.getElementById(id);
const stageEl = $("stage");
const overlay = $("overlay");

const storage = browserStorage();
export const progress = createProgress(storage, CONFIG.storage.progress, TOTAL);
const hearts = createHearts(storage, CONFIG.storage.hearts || "loverboy_run_hearts_v1", TOTAL);
const settings = createSettings(storage, CONFIG.storage.settings || "loverboy_run_settings_v1");
let signedUpAs = savedEmail(storage, CONFIG.storage.email);

const input = new JumpInput();
export const runner = new Runner($("game"), LEVELS, input, {
  onJump() { sfx.jump(); haptic("tick"); },
  onLand(impact) { if (impact > 200) sfx.land(Math.min(1, impact / 700)); },
  onPass(count, goal) { updateHud(true); haptic("pass"); sfx.pass(count, goal); score.setIntensity(count / goal); },
  onNear() { sfx.near(); haptic("near"); },
  onHeart(n) { sfx.heart(); haptic("heart"); updateHearts(n, true); },
  onFail(count, goal) { dying(count, goal); },
  onClear() { levelCleared(); },
  onOutro() { revealTrack(runner.index); },
  onSlowmo() { sfx.heartbeat(); },
  onThunder() { if (state === "playing" || state === "intro") sfx.thunder(); }
});
runner.pulse = pulse;

const revealFx = createConfetti($("revealFx"));
const finaleFx = createConfetti($("finaleFx"));

let state = "start";
let stateSince = 0;
let bgTrack = -1;            // which song the shared audio element holds
let previewTimer = 0;
let failTimer = 0;
let revealLevel = 0;
let paused = false;
let counting = 0;            // countdown timer after un-pausing
let freshRow = -1;           // the tracklist row that was just unlocked

export const app = {
  get state() { return state; },
  get paused() { return paused; },
  runner, progress, hearts, input,
  showStart: () => showStart(),
  showIntro: (i) => showIntro(i),
  showFinale: () => showFinale(),
  levelCleared: () => levelCleared(),
  pause: () => pause(),
  resume: () => resume()
};

function setState(next) {
  state = next;
  stateSince = performance.now();
  stageEl.dataset.state = next;
}

function pad2(n) { return String(n).padStart(2, "0"); }

function setLevelTheme(i) {
  const c = LEVELS[i].colors;
  const root = document.documentElement.style;
  root.setProperty("--lvl-glow", c.glow);
  root.setProperty("--lvl-accent", c.accent);
  root.setProperty("--lvl-deep", c.skyDeep);
  root.setProperty("--lvl-sky", c.sky);
}

// ---------- HUD and tracklist ----------

function updateHud(pop = false) {
  $("levelLabel").textContent = "Level " + (runner.index + 1) + " of " + TOTAL;
  const label = $("progressLabel");
  label.textContent = runner.passed + " / " + runner.goal;
  $("hudBar").style.transform = "scaleX(" + (runner.goal ? runner.passed / runner.goal : 0) + ")";
  if (pop) {
    label.classList.remove("pop");
    void label.offsetWidth;
    label.classList.add("pop");
  }
}

function updateHearts(n = runner.hearts, pop = false) {
  [...$("hudHearts").children].forEach((el, k) => {
    const on = k < n;
    if (on && !el.classList.contains("on") && pop) {
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
    }
    el.classList.toggle("on", on);
  });
}

function heartRow(n, max = hearts.perLevel) {
  return Array.from({ length: max }, (_, k) => `<i class="${k < n ? "on" : ""}"></i>`).join("");
}

function renderTracks() {
  const playing = music.playing && !music.failed ? bgTrack : -1;
  const rows = LEVELS.map((level, i) => {
    const got = progress.isCleared(i);
    const row = document.createElement("div");
    row.className = "track-row " + (got ? "unlocked" : "locked") + (i === playing ? " playing" : "") + (i === freshRow ? " fresh" : "");
    row.innerHTML =
      `<span class="track-num"><b>${pad2(i + 1)}</b><span class="eq"><i></i><i></i><i></i></span></span>` +
      `<img class="track-tile" alt="" src="${level.tile}">` +
      `<span class="track-name"></span>` +
      `<span class="track-hearts">${got ? heartRow(hearts.get(i)) : ""}</span>` +
      `<span class="track-status">${got ? "unlocked" : "locked"}</span>`;
    row.querySelector(".track-name").textContent = level.track;
    return row;
  });
  $("tracks").replaceChildren(...rows);
  $("panelCount").textContent = progress.count + " / " + TOTAL;
}

// ---------- overlay screens ----------

function showOverlay(mode) {
  overlay.dataset.mode = mode;
  overlay.classList.remove("hide");
  overlay.classList.toggle("full", mode === "finale");
  overlay.classList.remove("enter");
  void overlay.offsetWidth;
  overlay.classList.add("enter");
}

function hideOverlay() {
  overlay.classList.add("hide");
  overlay.classList.remove("full");
}

function setCard({ kicker = "", title, text, tile = null, meter = null, pips = false, kind }) {
  const t = $("cardTitle");
  t.replaceChildren();
  if (kicker) {
    const k = document.createElement("span");
    k.className = "card-kicker";
    k.textContent = kicker + " ";
    t.append(k);
  }
  const name = document.createElement("span");
  name.className = "card-name";
  name.textContent = title;
  t.append(name);
  $("cardText").textContent = text;
  overlay.dataset.card = kind;
  const img = $("cardTile");
  img.style.display = tile ? "" : "none";
  if (tile) img.src = tile;
  $("cardMeter").style.display = meter === null ? "none" : "";
  if (meter !== null) {
    const fill = $("cardMeterFill");
    fill.style.transition = "none";
    fill.style.transform = "scaleX(0)";
    void fill.offsetWidth;
    fill.style.transition = "";
    requestAnimationFrame(() => { fill.style.transform = "scaleX(" + meter + ")"; });
  }
  const pipsEl = $("cardPips");
  pipsEl.style.display = pips ? "" : "none";
  if (pips) {
    pipsEl.innerHTML = LEVELS.map((_, i) => `<i class="${progress.isCleared(i) ? "done" : ""}${i === runner.index ? " now" : ""}"></i>`).join("");
  }
}

function showStart() {
  music.pause();
  score.stop();
  bgTrack = -1;
  runner.setLevel(0);
  setLevelTheme(0);
  setState("start");
  updateHud();
  updateHearts(0);
  showOverlay("start");
}

function showIntro(i) {
  if (i === 0) return showStart();
  runner.setLevel(i);
  runner.transition("open");
  setLevelTheme(i);
  setState("intro");
  updateHud();
  updateHearts(0);
  setCard({ kicker: "Level " + (i + 1) + ":", title: LEVELS[i].track, text: "Tap to start the next level.", tile: LEVELS[i].tile, pips: true, kind: "intro" });
  showOverlay("card");
}

// The runner has just died: the moment plays (freeze, flash, the headphones fly), then the fail card.
function dying(reached, goal) {
  setState("dying");
  sfx.fail();
  haptic("fail");
  if (music.playing) music.tapeStop(); else music.pause();
  score.stop(true);
  clearTimeout(failTimer);
  failTimer = setTimeout(() => failed(reached, goal), FAIL_DELAY);
}

function failed(reached, goal) {
  if (state !== "dying") return;
  setState("failed");
  updateHud();
  setCard({ title: "Level failed", text: "You reached " + reached + " of " + goal + ". Tap to retry.", meter: goal ? reached / goal : 0, kind: "fail" });
  showOverlay("card");
}

// ---------- playing ----------

// The unlocked song from the previous level plays quietly under this one. With no song (level 1, or a
// missing file) the generated score plays instead.
function startBackgroundMusic(levelIndex, { resume = false } = {}) {
  sfx.setLevel(levelIndex);
  const song = levelIndex - 1;
  if (song < 0) {
    music.pause();
    bgTrack = -1;
    score.start(levelIndex);
    return;
  }
  if (bgTrack !== song) {
    music.load(trackAudio(LEVELS[song], song), { fromStart: true });
    bgTrack = song;
  }
  if (resume) music.fadeIn(BG_VOLUME); else music.play(BG_VOLUME);
  music.whenReady(() => {
    if (music.failed && (state === "playing" || state === "intro")) score.start(levelIndex);
    else if (!music.failed) score.stop();
    renderTracks();
  });
}

function startLevel(i) {
  runner.setLevel(i);
  runner.begin();
  setLevelTheme(i);
  setState("playing");
  updateHud();
  updateHearts(0);
  hideOverlay();
  score.setIntensity(0);
  startBackgroundMusic(i);
}

// After a fail: the same level restarts, and the song resumes where it paused (not from the top).
function retry() {
  runner.begin({ rewind: true });
  sfx.rewind();
  setState("playing");
  updateHud();
  updateHearts(0);
  hideOverlay();
  score.setIntensity(0);
  startBackgroundMusic(runner.index, { resume: true });
}

// ---------- pause ----------

function pause() {
  if (state !== "playing" || paused) return;
  paused = true;
  runner.paused = true;
  clearInterval(counting);
  counting = 0;
  $("countdown").textContent = "";
  music.pause();
  score.stop();
  stageEl.classList.add("paused");
  showOverlay("pause");
}

// Resume after a 3-2-1, so nobody dies the instant the game restarts.
function resume() {
  if (!paused || counting) return;
  hideOverlay();
  const el = $("countdown");
  let n = 3;
  const show = () => {
    el.textContent = String(n);
    el.classList.remove("tick");
    void el.offsetWidth;
    el.classList.add("tick");
    sfx.count(false);
  };
  show();
  counting = setInterval(() => {
    n--;
    if (n > 0) return show();
    clearInterval(counting);
    counting = 0;
    el.textContent = "";
    sfx.count(true);
    paused = false;
    stageEl.classList.remove("paused");
    input.clear();
    runner.paused = false;
    startBackgroundMusic(runner.index, { resume: true });
  }, 520);
}

function restartLevel() {
  paused = false;
  clearInterval(counting);
  counting = 0;
  $("countdown").textContent = "";
  stageEl.classList.remove("paused");
  hideOverlay();
  retry();
}

$("pauseBtn").addEventListener("click", (e) => { e.stopPropagation(); pause(); });
$("resumeBtn").addEventListener("click", () => resume());
$("restartBtn").addEventListener("click", () => restartLevel());
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" || e.code === "KeyP") {
    if (paused && !counting) resume();
    else pause();
  }
});
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
window.addEventListener("blur", () => pause());

// ---------- settings ----------

function applySettings() {
  setMuted(!settings.sound);
  setHaptics(settings.haptics);
  document.querySelectorAll("[data-toggle]").forEach((b) => {
    const on = settings[b.dataset.toggle];
    b.setAttribute("aria-pressed", String(on));
    b.classList.toggle("off", !on);
  });
}
document.querySelectorAll("[data-toggle]").forEach((b) => {
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    const name = b.dataset.toggle;
    settings.set(name, !settings[name]);
    applySettings();
    if (name === "haptics" && settings.haptics) haptic("pass");
    if (name === "sound" && settings.sound) sfx.tap();
  });
});

// ---------- unlocking ----------

function levelCleared() {
  const i = runner.index;
  setState("clearing");
  progress.clear(i);
  hearts.record(i, runner.hearts);
  freshRow = i;
  renderTracks();
  sfx.clear();
  haptic("clear");
}

function previewLength() {
  if (music.failed) return NO_AUDIO_PREVIEW;
  const d = music.duration;
  if (isFinite(d) && d > 0) return Math.min(CONFIG.previewMs, Math.round(d * 1000));
  return CONFIG.previewMs;
}

function revealTrack(i) {
  const level = LEVELS[i];
  revealLevel = i;
  setState("reveal");
  hideOverlay();

  const reveal = $("reveal");
  reveal.style.setProperty("--glow", level.colors.glow);
  reveal.style.setProperty("--accent", level.colors.accent);
  const tile = $("revealTile");
  tile.src = level.tile;
  reveal.classList.remove("play");
  void reveal.offsetWidth;       // restart the animations
  reveal.classList.add("play");
  $("revealNum").textContent = pad2(i + 1);
  $("revealTitle").textContent = level.track;
  $("revealHearts").innerHTML = heartRow(hearts.get(i));
  reveal.classList.add("show");
  revealFx.setAccent(level.colors.glow);
  setTimeout(() => { if (state === "reveal") revealFx.burst(0.5, 0.36, 70); }, 380);

  sfx.setLevel(i);
  sfx.unlock();
  haptic("unlock");
  score.stop();

  music.load(trackAudio(level, i), { fromStart: true });
  bgTrack = i;
  music.play(1);

  // The bar matches the real clip length, so wait briefly for the file's metadata.
  const bar = $("revealProgress");
  bar.style.transition = "none";
  bar.style.transform = "scaleX(0)";
  void bar.offsetWidth;
  let started = false;
  const start = () => {
    if (started || state !== "reveal") return;
    started = true;
    const ms = previewLength();
    if (music.failed) score.start(i);        // no clip yet: the level's theme plays instead
    score.setIntensity(1);
    bar.style.transition = "transform " + ms + "ms linear";
    bar.style.transform = "scaleX(1)";
    clearTimeout(previewTimer);
    previewTimer = setTimeout(finishReveal, ms);
    renderTracks();
  };
  music.whenReady(start);
  setTimeout(start, 600);
}

function finishReveal() {
  if (state !== "reveal") return;
  clearTimeout(previewTimer);
  music.setVolume(BG_VOLUME);
  score.setIntensity(0);
  revealFx.stop();
  $("reveal").classList.remove("show", "play");
  freshRow = -1;
  const next = revealLevel + 1;
  if (next >= TOTAL) showFinale();
  else showIntro(next);
  renderTracks();
}

// ---------- the end ----------

function showFinale() {
  setState("finale");
  setLevelTheme(TOTAL - 1);
  const form = $("emailForm");
  const success = $("emailSuccess");
  $("emailError").style.display = "none";
  if (signedUpAs) {
    form.style.display = "none";
    success.style.display = "block";
    success.textContent = "You're on the list (" + signedUpAs + ") — we'll send your early-access link before release.";
  } else {
    form.style.display = "flex";
    success.style.display = "none";
  }
  $("finaleTape").innerHTML = LEVELS.map((l, i) => `<img alt="" src="${l.tile}" style="--i:${i}">`).join("");
  $("finaleHearts").innerHTML = `<i class="on"></i>${hearts.total} / ${hearts.max}`;
  showOverlay("finale");
  finaleFx.setAccent(LEVELS[TOTAL - 1].colors.glow);
  setTimeout(() => { if (state === "finale") { finaleFx.burst(0.5, 0.2, 50); finaleFx.rain(5); } }, 250);
}

$("emailForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const value = $("emailInput").value.trim();
  const error = $("emailError");
  if (!isValidEmail(value)) {
    error.textContent = "Enter a valid email first.";
    error.style.display = "block";
    return;
  }
  error.style.display = "none";
  const button = $("emailForm").querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await submitEmail(value, CONFIG.email, storage, CONFIG.storage.email);
    signedUpAs = value;
    $("emailForm").style.display = "none";
    const success = $("emailSuccess");
    success.style.display = "block";
    success.textContent = "You're on the list (" + value + ") — we'll send your early-access link before release.";
    finaleFx.burst(0.5, 0.6, 40);
    sfx.heart();
  } catch {
    error.textContent = "Couldn't save that right now — please try again.";
    error.style.display = "block";
  } finally {
    button.disabled = false;
  }
});

$("playAgainBtn").addEventListener("click", () => {
  progress.reset();
  hearts.reset();
  finaleFx.stop();
  renderTracks();
  showStart();
  runner.transition("open");
});

// ---------- input ----------

// Every press on the game: taps move the flow along; during play the same press is also a jump.
input.attach(stageEl, () => {
  const age = performance.now() - stateSince;
  if (paused) return;
  switch (state) {
    case "start": sfx.tap(); startLevel(0); break;
    case "intro": sfx.tap(); startLevel(runner.index); break;
    case "failed": if (age > RETRY_GRACE) retry(); break;
    case "reveal": if (age > PREVIEW_GRACE) finishReveal(); break;
    default: break;
  }
});

// Browsers only allow sound after a real tap: prime audio on the first one.
for (const type of ["touchend", "click", "keydown", "pointerdown"]) {
  window.addEventListener(type, () => unlockAudio(trackAudio(LEVELS[0], 0)), { passive: true });
}

// ---------- layout ----------

// Desktop / landscape: 640x400. Portrait phones: a narrower, slightly taller field (500 wide), so the
// art is drawn bigger on a narrow screen. Its height follows the stage box (400-440), so the field is never stretched.
const phoneMQ = window.matchMedia("(max-width: 640px) and (orientation: portrait)");
function fit() {
  let w = 640;
  let h = 400;
  if (phoneMQ.matches) {
    w = 500;
    const ratio = stageEl.clientHeight / Math.max(1, stageEl.clientWidth);
    h = Math.round(Math.max(400, Math.min(440, w * ratio)));
  }
  if (w !== runner.W || h !== runner.H) runner.resize(w, h);
}
let fitTimer = 0;
function scheduleFit() {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(() => { if (state !== "playing" && state !== "dying" && state !== "clearing") fit(); }, 150);
}
window.addEventListener("resize", scheduleFit);
window.addEventListener("orientationchange", scheduleFit);

// ---------- boot ----------

document.title = CONFIG.album.title;
$("brandTitle").innerHTML = [...CONFIG.album.title].map((ch, i) => `<span style="--i:${i}">${ch === " " ? "&nbsp;" : ch}</span>`).join("");
$("brandTitle").setAttribute("aria-label", CONFIG.album.title);
$("brandTagline").textContent = CONFIG.album.tagline;
$("howTo").replaceChildren(...CONFIG.album.howTo.map((line) => { const s = document.createElement("span"); s.textContent = line; return s; }));
$("srTitle").textContent = CONFIG.album.title;

const skins = {};
LEVELS.forEach((l, i) => { if (l.spike) skins["spike@" + i] = l.spike; if (l.block) skins["block@" + i] = l.block; });
loadSprites(undefined, skins);
applySettings();
fit();
renderTracks();
if (progress.complete) {
  runner.setLevel(TOTAL - 1);
  setLevelTheme(TOTAL - 1);
  showFinale();
} else {
  showIntro(progress.next());
}
updateHud();

const loop = new GameLoop((dt) => runner.update(dt), () => runner.draw());
loop.start();

// The loader: wait (briefly) for the fonts, the sprites and this level's background, then open the scene.
(async () => {
  const fill = $("loaderFill");
  const imgs = [...SPRITE_FILES.map((n) => () => sprite(n)), () => runner.world.bgReady];
  const t0 = performance.now();
  const fonts = document.fonts ? document.fonts.ready.catch(() => {}) : Promise.resolve();
  let fontsDone = false;
  fonts.then(() => { fontsDone = true; });
  await new Promise((done) => {
    const tick = () => {
      const got = imgs.filter((f) => f()).length + (fontsDone ? 1 : 0);
      fill.style.transform = "scaleX(" + got / (imgs.length + 1) + ")";
      if (got >= imgs.length + 1 || performance.now() - t0 > 4000) return done();
      requestAnimationFrame(tick);
    };
    tick();
  });
  const loader = $("loader");
  loader.classList.add("done");
  setTimeout(() => loader.remove(), 600);
  runner.transition("open");
})();

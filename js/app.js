import { CONFIG, trackAudio, validateConfig } from "./config.js";
import { music, sfx, unlockAudio } from "./audio.js";
import { isValidEmail, savedEmail, submitEmail } from "./email.js";
import { haptic } from "./haptics.js";
import { JumpInput } from "./input.js";
import { GameLoop } from "./loop.js";
import { browserStorage, createProgress } from "./progress.js";
import { Runner } from "./runner.js";
import { loadSprites } from "./sprites.js";

// The flow: start -> [play <-> fail] -> unlock card -> next level intro -> ... -> finale.
//
//   state  "start"   the title screen ("Tap to begin")
//          "intro"   a level card ("Level N: Title / Tap to start the next level")
//          "playing" running
//          "failed"  the fail card (tap to retry)
//          "reveal"  the "Track unlocked" card, playing the preview
//          "finale"  the end screen with the email form

validateConfig();

const LEVELS = CONFIG.levels;
const TOTAL = LEVELS.length;
const PREVIEW_GRACE = 900;     // ms before a tap can skip the unlock card
const RETRY_GRACE = 250;       // ms before a tap can retry after failing
const NO_AUDIO_PREVIEW = 3500; // ms of "preview" when the song file is missing
const BG_VOLUME = 0.35;        // the unlocked song plays quietly under the next level

const $ = (id) => document.getElementById(id);
const stageEl = $("stage");
const overlay = $("overlay");

const storage = browserStorage();
export const progress = createProgress(storage, CONFIG.storage.progress, TOTAL);
let signedUpAs = savedEmail(storage, CONFIG.storage.email);

const input = new JumpInput();
export const runner = new Runner($("game"), LEVELS, input, {
  onJump() { sfx.jump(); haptic("tick"); },
  onPass(count) { updateHud(); haptic("pass"); sfx.pass(); },
  onFail(count, goal) { failed(count, goal); },
  onClear() { levelCleared(); }
});

let state = "start";
let stateSince = 0;
let bgTrack = -1;            // which song the shared audio element holds
let previewTimer = 0;
let revealLevel = 0;

export const app = {
  get state() { return state; },
  runner, progress, input,
  showStart: () => showStart(),
  showIntro: (i) => showIntro(i),
  showFinale: () => showFinale(),
  levelCleared: () => levelCleared()
};

function setState(next) {
  state = next;
  stateSince = performance.now();
  stageEl.dataset.state = next;
}

function pad2(n) { return String(n).padStart(2, "0"); }

// ---------- HUD and tracklist ----------

function updateHud() {
  $("levelLabel").textContent = "Level " + (runner.index + 1) + " of " + TOTAL;
  $("progressLabel").textContent = runner.passed + " / " + runner.goal;
}

function renderTracks() {
  const rows = LEVELS.map((level, i) => {
    const got = progress.isCleared(i);
    const row = document.createElement("div");
    row.className = "track-row " + (got ? "unlocked" : "locked");
    const name = document.createElement("span");
    name.textContent = (i + 1) + ". " + level.track;
    const status = document.createElement("span");
    status.textContent = got ? "unlocked" : "locked";
    row.append(name, status);
    return row;
  });
  $("tracks").replaceChildren(...rows);
}

// ---------- overlay screens ----------

function showOverlay(mode) {
  overlay.dataset.mode = mode;
  overlay.classList.remove("hide");
  overlay.classList.toggle("full", mode === "finale");
}

function hideOverlay() {
  overlay.classList.add("hide");
  overlay.classList.remove("full");
}

function showStart() {
  music.pause();
  bgTrack = -1;
  runner.setLevel(0);
  setState("start");
  updateHud();
  showOverlay("start");
}

function showIntro(i) {
  if (i === 0) return showStart();
  runner.setLevel(i);
  setState("intro");
  updateHud();
  $("cardTitle").textContent = "Level " + (i + 1) + ": " + LEVELS[i].track;
  $("cardText").textContent = "Tap to start the next level.";
  showOverlay("card");
}

function failed(reached, goal) {
  setState("failed");
  updateHud();
  sfx.fail();
  haptic("fail");
  stageEl.classList.remove("shake");
  void stageEl.offsetWidth;     // restart the shake animation
  stageEl.classList.add("shake");
  music.pause();
  $("cardTitle").textContent = "Level failed";
  $("cardText").textContent = "You reached " + reached + " of " + goal + ". Tap to retry.";
  showOverlay("card");
}

// ---------- playing ----------

// The unlocked song from the previous level plays quietly under this one.
function startBackgroundMusic(levelIndex) {
  const song = levelIndex - 1;
  if (song < 0) {
    music.pause();
    return;
  }
  if (bgTrack !== song) {
    music.load(trackAudio(LEVELS[song], song), { fromStart: true });
    bgTrack = song;
  }
  music.play(BG_VOLUME);
}

function startLevel(i) {
  runner.setLevel(i);
  runner.begin();
  setState("playing");
  updateHud();
  hideOverlay();
  startBackgroundMusic(i);
}

// After a fail: the same level restarts, and the song resumes where it paused (not from the top).
function retry() {
  runner.begin();
  setState("playing");
  updateHud();
  hideOverlay();
  if (runner.index > 0) music.play(BG_VOLUME);
}

// ---------- unlocking ----------

function levelCleared() {
  const i = runner.index;
  progress.clear(i);
  renderTracks();
  revealTrack(i);
}

function previewLength(i) {
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
  const tile = $("revealTile");
  tile.src = level.tile;
  tile.classList.remove("pop");
  void tile.offsetWidth;       // restart the pop-in animation
  tile.classList.add("pop");
  $("revealNum").textContent = pad2(i + 1);
  $("revealTitle").textContent = level.track;
  reveal.classList.add("show");

  sfx.unlock();
  haptic("unlock");

  music.load(trackAudio(level, i), { fromStart: true });
  bgTrack = i;
  music.play(1);

  // The bar matches the real clip length, so wait briefly for the file's metadata.
  const bar = $("revealProgress");
  bar.style.transition = "none";
  bar.style.width = "0%";
  void bar.offsetWidth;
  let started = false;
  const start = () => {
    if (started || state !== "reveal") return;
    started = true;
    const ms = previewLength(i);
    bar.style.transition = "width " + ms + "ms linear";
    bar.style.width = "100%";
    clearTimeout(previewTimer);
    previewTimer = setTimeout(finishReveal, ms);
  };
  music.whenReady(start);
  setTimeout(start, 600);
}

function finishReveal() {
  if (state !== "reveal") return;
  clearTimeout(previewTimer);
  music.setVolume(BG_VOLUME);
  $("reveal").classList.remove("show");
  const next = revealLevel + 1;
  if (next >= TOTAL) showFinale();
  else showIntro(next);
}

// ---------- the end ----------

function showFinale() {
  setState("finale");
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
  showOverlay("finale");
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
  } catch {
    error.textContent = "Couldn't save that right now — please try again.";
    error.style.display = "block";
  } finally {
    button.disabled = false;
  }
});

$("playAgainBtn").addEventListener("click", () => {
  progress.reset();
  renderTracks();
  showStart();
});

// ---------- input ----------

// Every press on the game: taps move the flow along; during play the same press is also a jump.
input.attach(stageEl, () => {
  const age = performance.now() - stateSince;
  switch (state) {
    case "start": startLevel(0); break;
    case "intro": startLevel(runner.index); break;
    case "failed": if (age > RETRY_GRACE) retry(); break;
    case "reveal": if (age > PREVIEW_GRACE) finishReveal(); break;
    default: break;
  }
});

// Browsers only allow sound after a real tap: prime audio on the first one.
for (const type of ["touchend", "click", "keydown"]) {
  window.addEventListener(type, () => unlockAudio(trackAudio(LEVELS[0], 0)), { once: true, passive: true });
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
  fitTimer = setTimeout(() => { if (state !== "playing") fit(); }, 150);
}
window.addEventListener("resize", scheduleFit);
window.addEventListener("orientationchange", scheduleFit);

// ---------- boot ----------

document.title = CONFIG.album.title;
$("brandTitle").textContent = CONFIG.album.title;
$("brandTagline").textContent = CONFIG.album.tagline;
$("howTo").replaceChildren(...CONFIG.album.howTo.map((line) => { const s = document.createElement("span"); s.textContent = line; return s; }));
$("srTitle").textContent = CONFIG.album.title;

loadSprites();
fit();
renderTracks();
if (progress.complete) {
  runner.setLevel(TOTAL - 1);
  showFinale();
} else {
  showIntro(progress.next());
}
updateHud();

const loop = new GameLoop((dt) => runner.update(dt), () => runner.draw());
loop.start();

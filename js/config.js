// All the content and tuning for the game lives in this one file.
// Edit it to change track names, colours, goals, difficulty, art, the email endpoint, preview length.

export const CONFIG = {
  album: {
    artist: "TD",
    title: "Loverboy O'Clock",
    tagline: "A love story told on the run.",
    howTo: ["Tap to jump.", "Hold to leap higher.", "Unlock the tape."]
  },

  // Early-access signup. Formspree: https://formspree.io/f/<id>. The game POSTs {"email": "..."} as JSON.
  // Success is only shown if the request works. Leave the endpoint empty to save emails in this browser only.
  email: {
    endpoint: "https://formspree.io/f/xyezewgl",
    field: "email"
  },

  // How long the unlock card plays the song (ms). Capped to the real clip length.
  previewMs: 10000,

  // Where progress is saved in the browser. Change these if you re-skin the game for another release.
  storage: {
    progress: "loverboy_run_progress_v1",
    email: "loverboy_run_email_v1",
    hearts: "loverboy_run_hearts_v1",
    settings: "loverboy_run_settings_v1"
  },

  // One entry per track / level, in order. Level N unlocks track N.
  //
  //   track       song title (shown on the intro and unlock cards and in the tracklist)
  //   theme       what the level's world is (for you; not shown)
  //   bg          painterly pixel-art background (assets/backgrounds/). If missing, a plain colour is used.
  //   tile        unlock tile icon (assets/tiles/)
  //   spike/block the level's own obstacle art (assets/obstacles/): a 28x28 spike and a square wall tile. Leave them
  //               out to use the shared grey art tinted with colors.obstacle
  //   world       the level's look: floor material (stone, ember, wet, grass, mirror, marble, gold), weather
  //               (snow, embers, rain, petals, shimmer, seeds, rays), a parallax row of props (fence, deadtree, rock,
  //               torch, lamp, tree, grass, flowers, reeds, cypress, lantern, bush, banner), low mist colour, and
  //               where the painting's sun or moon is (fractions of the image) with how many light rays it casts
  //   colors      the level's palette: sky/skyDeep = backdrop colours, obstacle = tint for spikes/blocks/floor,
  //               accent = highlights, glow = the tile's glow and floating light
  //   goal        obstacles to clear to finish the level ("x / goal" in the HUD)
  //   audio       (optional) song clip; defaults to audio/track-01.mp3, track-02.mp3 ...
  //   difficulty  speed      how fast the runner moves (pixels per second)
  //               gap        seconds of clear floor between obstacles (smaller = harder)
  //               patterns   which obstacles can appear; new kinds unlock as the album goes on:
  //                          spike, spikes2, spikes3, block, tall, pit, stairs, platformPit, combo
  //               move       (optional) from the level's halfway point, some obstacles slide sideways at random moments
  //                          chance = share of obstacles that move, amp = furthest slide (px), speed = slide speed (px/s)
  //               debut      obstacle kinds that are new in this level; each is guaranteed to show up once
  //               seed       fixes the obstacle layout so a level is the same every time you play it
  levels: [
    {
      track: "Do You Love Me", theme: "The closed gate",
      bg: "assets/backgrounds/level-01.png", tile: "assets/tiles/tile-01.png",
      spike: "assets/obstacles/spike-01.png", block: "assets/obstacles/block-01.png",
      world: { floor: "stone", weather: "snow", props: ["fence", "deadtree", "rock", "fence"], mist: "#9fb4dd", sun: [0.34, 0.1], rays: 0 },
      colors: { sky: "#1b2a44", skyDeep: "#0f1a2e", obstacle: "#6b7fa8", accent: "#8fa6d6", glow: "#6f86b8" },
      goal: 8,
      difficulty: { speed: 230, gap: 1.35, patterns: ["spike", "spikes2", "block"], seed: 101 }
    },
    {
      track: "Lady In Red", theme: "The cracked gate, an ember showing",
      bg: "assets/backgrounds/level-02.png", tile: "assets/tiles/tile-02.png",
      spike: "assets/obstacles/spike-02.png", block: "assets/obstacles/block-02.png",
      world: { floor: "ember", weather: "embers", props: ["torch", "fence", "rock", "deadtree"], sun: [0.5, 0.55], rays: 0 },
      colors: { sky: "#2b2450", skyDeep: "#1a1533", obstacle: "#8a6aa8", accent: "#ff8a4c", glow: "#ffb070" },
      goal: 9,
      difficulty: { speed: 245, gap: 1.2, patterns: ["spike", "spikes2", "block", "tall"], debut: ["tall"], seed: 102 }
    },
    {
      track: "The End Is Near ft. Cronax", theme: "The storm",
      bg: "assets/backgrounds/level-03.png", tile: "assets/tiles/tile-03.png",
      spike: "assets/obstacles/spike-03.png", block: "assets/obstacles/block-03.png",
      world: { floor: "wet", weather: "rain", props: ["lamp", "fence", "rock"], propGap: 170 },
      colors: { sky: "#1f3a4a", skyDeep: "#12222d", obstacle: "#6f93a8", accent: "#b8e4ff", glow: "#7fc4e8" },
      goal: 10,
      difficulty: { speed: 260, gap: 1.1, patterns: ["spike", "spikes2", "spikes3", "block", "tall", "pit"], debut: ["spikes3", "pit"], seed: 103 }
    },
    {
      track: "Nakupenda", theme: "The open hills",
      bg: "assets/backgrounds/level-04.png", tile: "assets/tiles/tile-04.png",
      spike: "assets/obstacles/spike-04.png", block: "assets/obstacles/block-04.png",
      world: { floor: "grass", weather: "petals", props: ["tree", "grass", "flowers", "grass", "rock"], sun: [0.79, 0.44], rays: 14 },
      colors: { sky: "#6b4f7a", skyDeep: "#4a3560", obstacle: "#b8935f", accent: "#f0c46c", glow: "#ffd98a" },
      goal: 11,
      difficulty: {
        speed: 275, gap: 1.0, seed: 104, debut: ["stairs", "platformPit"],
        patterns: ["spike", "spikes2", "spikes3", "block", "tall", "pit", "stairs", "platformPit"],
        move: { chance: 0.35, amp: 36, speed: 60 }
      }
    },
    {
      track: "Bonnie And Clyde", theme: "Twin mountains, mirrored",
      bg: "assets/backgrounds/level-05.png", tile: "assets/tiles/tile-05.png",
      spike: "assets/obstacles/spike-05.png", block: "assets/obstacles/block-05.png",
      world: { floor: "mirror", weather: "shimmer", props: ["reeds", "rock", "reeds", "grass"], sun: [0.5, 0.45], rays: 12 },
      colors: { sky: "#b0506e", skyDeep: "#7d3352", obstacle: "#e88a72", accent: "#ffb36b", glow: "#ffd0a0" },
      goal: 12,
      difficulty: {
        speed: 290, gap: 0.9, seed: 105, debut: ["combo"],
        patterns: ["spike", "spikes2", "spikes3", "block", "tall", "pit", "stairs", "platformPit", "combo"],
        move: { chance: 0.5, amp: 44, speed: 75 }
      }
    },
    {
      track: "I No Fit Lie", theme: "The quiet dome",
      bg: "assets/backgrounds/level-06.png", tile: "assets/tiles/tile-06.png",
      spike: "assets/obstacles/spike-06.png", block: "assets/obstacles/block-06.png",
      world: { floor: "marble", weather: "seeds", props: ["cypress", "lantern", "bush", "grass"], mist: "#ffe6c8", sun: [0.83, 0.1], rays: 10 },
      colors: { sky: "#e0946f", skyDeep: "#b8694f", obstacle: "#f0c39c", accent: "#fff0c8", glow: "#ffe6b3" },
      goal: 14,
      difficulty: {
        speed: 305, gap: 0.8, seed: 106,
        patterns: ["spike", "spikes2", "spikes3", "block", "tall", "pit", "stairs", "platformPit", "combo"],
        move: { chance: 0.65, amp: 54, speed: 90 }
      }
    },
    {
      track: "The End", theme: "The wide-open gate, a sunburst",
      bg: "assets/backgrounds/level-07.png", tile: "assets/tiles/tile-07.png",
      spike: "assets/obstacles/spike-07.png", block: "assets/obstacles/block-07.png",
      world: { floor: "gold", weather: "rays", props: ["banner", "bush", "flowers", "lantern"], sun: [0.5, 0.52], rays: 18 },
      colors: { sky: "#f6b44e", skyDeep: "#d78a35", obstacle: "#ffd45c", accent: "#fff6c2", glow: "#fff0a0" },
      goal: 16,
      difficulty: {
        speed: 320, gap: 0.7, seed: 107,
        patterns: ["spike", "spikes2", "spikes3", "block", "tall", "pit", "stairs", "platformPit", "combo"],
        move: { chance: 0.8, amp: 64, speed: 105 }
      }
    }
  ]
};

// Song clip for level index i (0-based): the level's own `audio`, or audio/track-01.mp3, track-02.mp3 ...
export function trackAudio(level, i) {
  return level.audio || "audio/track-" + String(i + 1).padStart(2, "0") + ".mp3";
}

// Fail fast on a broken edit. Runs once at startup.
export function validateConfig(cfg = CONFIG) {
  if (!cfg.levels.length) throw new Error("config.js: no levels");
  cfg.levels.forEach((l, i) => {
    const at = "config.js: level " + (i + 1);
    if (!l.track) throw new Error(at + " needs a track title");
    if (!(l.goal >= 1)) throw new Error(at + " needs a goal of at least 1");
    for (const k of ["sky", "skyDeep", "obstacle", "accent", "glow"]) {
      if (!/^#[0-9a-f]{6}$/i.test(l.colors?.[k] || "")) throw new Error(at + " colors." + k + " must be a #rrggbb colour");
    }
    const d = l.difficulty;
    if (!d || !(d.speed > 0) || !(d.gap > 0) || !d.patterns?.length) throw new Error(at + " needs difficulty.speed, gap and patterns");
  });
}

// Loads the pixel-art sprites (assets/sprites/) and tints obstacle art to each level's palette.
// Every draw call checks `get()` and falls back to a plain shape, so the game still runs if a file is missing.

export const SPRITE_FILES = [
  "run-1", "run-2", "run-3", "run-4", "run-5", "run-6", "run-7", "run-8", "jump", "fall",
  "death-1", "death-2", "death-3", "death-4",
  "idle-1", "idle-2", "idle-3", "idle-4", "win-1", "win-2", "win-3", "whoa",
  "spike", "block", "blockcap"
];

const images = new Map();
const tinted = new Map();

// extra: { name: src } for images that live elsewhere (each level's obstacle skins).
export function loadSprites(folder = "assets/sprites/", extra = {}) {
  const all = [...SPRITE_FILES.map((name) => [name, folder + name + ".png"]), ...Object.entries(extra)];
  for (const [name, src] of all) {
    const img = new Image();
    img.src = src;
    images.set(name, img);
  }
}

// The image, if it has loaded; otherwise null.
export function sprite(name) {
  const img = images.get(name);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

// A copy of a sprite multiplied by a colour (the grey art takes on the level's palette). Cached.
export function tintedSprite(name, color) {
  const img = sprite(name);
  if (!img) return null;
  const key = name + "|" + color;
  let c = tinted.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = "multiply";
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = "destination-in";   // keep the original's transparent pixels
    g.drawImage(img, 0, 0);
    tinted.set(key, c);
  }
  return c;
}

// A solid-colour copy of a sprite's shape (used to draw a dark edge around it so it stands out from any background). Cached.
export function silhouetteSprite(name, color) {
  const img = sprite(name);
  if (!img) return null;
  const key = "sil|" + name + "|" + color;
  let c = tinted.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = "source-in";   // keep only where the sprite is opaque
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    tinted.set(key, c);
  }
  return c;
}

// "#rrggbb" darkened (factor < 1) or lightened (> 1).
export function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

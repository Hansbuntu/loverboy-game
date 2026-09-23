// Turns AI-generated level illustrations into the game's pixel-art backgrounds.
//
//   node tools/prep-backgrounds.js  level-1.png level-2.png ... [options]
//   node tools/prep-backgrounds.js  1=sunrise.webp 3=storm.jpg          (say which level each image is)
//   node tools/prep-backgrounds.js  --sheet all-seven.png [--favicon]   (all the backgrounds drawn on ONE image)
//
// Each image is centre-cropped to 16:10, shrunk to 320x200 by averaging, and reduced to a small colour palette
// (with light dithering), so an illustration or a smooth AI image ends up as crisp, consistent pixel art.
// Any common format works: PNG directly, WebP/JPEG/BMP/GIF through Windows' built-in codecs.
//
// Which level an image is for: a number 1-7 in its file name ("level-03.png", "bg5.webp"), or `N=file`.
// If you give exactly seven files with no numbers, they are taken as levels 1 to 7 in name order.
//
// A sheet is one image holding the panels in a grid, separated by flat gutters of one colour (magenta in the art
// brief). Panels are read left to right, top row first: level 1, 2, 3 ... With --favicon, an 8th panel becomes the
// favicon. --start N says the first panel is level N (for a second sheet that holds levels 5 to 7).
//
// Options:  --size 320x200   output size (640x400 also works; the game scales to fit)
//           --colors 48      palette size (fewer = more stylised)
//           --dither 0.12    0 = none, 1 = strong dotted dithering
//           --out DIR        where to write (default assets/backgrounds)
//           --dry            show what would happen and write nothing
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../js/config.js";
import { countColors, cutPanel, findPanels, levelFromName, makeFavicons, processBackground } from "./bg-lib.js";
import { loadImage } from "./load-image.js";

const argv = process.argv.slice(2);
const flag = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const flagged = new Set(["--size", "--colors", "--dither", "--out", "--sheet", "--start"].flatMap((f) => (argv.includes(f) ? [argv.indexOf(f), argv.indexOf(f) + 1] : [])));
const inputs = argv.filter((a, i) => !a.startsWith("--") && !flagged.has(i));
const [W, H] = flag("--size", "320x200").split("x").map(Number);
const colors = Number(flag("--colors", 48));
const dither = Number(flag("--dither", 0.12));
const outDir = flag("--out", "assets/backgrounds");
const dry = argv.includes("--dry");
const TOTAL = CONFIG.levels.length;

const sheetFile = flag("--sheet", null);
if (sheetFile) {
  const start = Number(flag("--start", 1));
  const img = loadImage(sheetFile);
  const panels = findPanels(img);
  const room = TOTAL - start + 1;
  console.log(`sheet ${path.basename(sheetFile)}  ${img.w}x${img.h}: found ${panels.length} panel(s)`);
  if (panels.length < Math.min(room, 7)) {
    console.error(`Expected ${Math.min(room, 7)} panels but found ${panels.length}. Panels that touch each other merge into one, so ask the AI for wider flat-colour gaps between them.`);
    process.exit(1);
  }
  panels.slice(0, room).forEach((box, i) => {
    const level = start + i;
    const px = processBackground(cutPanel(img, box), { w: W, h: H, colors, dither });
    const name = `level-${String(level).padStart(2, "0")}.png`;
    console.log(`  panel ${i + 1} (${box.w}x${box.h} at ${box.x},${box.y})  ->  level ${level}: ${name}  ${W}x${H}, ${countColors(px)} colours${dry ? "   (dry run)" : ""}`);
    if (!dry) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, name), px.toPNG()); }
  });
  const extra = panels.slice(room);
  if (extra.length && argv.includes("--favicon")) {
    const iconDir = flag("--icons", "assets/icons");
    for (const f of makeFavicons(cutPanel(img, extra[0]))) {
      console.log(`  panel ${room + 1}  ->  ${f.name}  ${f.size}x${f.size}${dry ? "   (dry run)" : ""}`);
      if (!dry) { fs.mkdirSync(iconDir, { recursive: true }); fs.writeFileSync(path.join(iconDir, f.name), f.px.toPNG()); }
    }
  } else if (extra.length) {
    console.log(`  (${extra.length} extra panel${extra.length > 1 ? "s" : ""} ignored; add --favicon to use the next one as the favicon)`);
  }
  process.exit(0);
}

if (!inputs.length || !(W > 0 && H > 0)) {
  console.error("usage: node tools/prep-backgrounds.js image... | --sheet sheet.png [--favicon] [--start N] [--size 320x200] [--colors 48] [--dither 0.12] [--out DIR] [--dry]");
  process.exit(1);
}

// work out which level each file is for
const jobs = inputs.map((arg) => {
  const m = /^([1-9])=(.+)$/.exec(arg);
  return m ? { level: Number(m[1]), file: m[2] } : { level: levelFromName(arg, TOTAL), file: arg };
});
if (jobs.length === TOTAL && jobs.every((j) => j.level === null)) {
  [...jobs].sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true })).forEach((j, i) => { j.level = i + 1; });
}
const unknown = jobs.filter((j) => j.level === null || j.level < 1 || j.level > TOTAL);
if (unknown.length) {
  console.error("Could not tell which level these are for:\n  " + unknown.map((j) => j.file).join("\n  "));
  console.error(`Put the level number (1-${TOTAL}) in the file name, or write it as N=file (for example 3=storm.png).`);
  process.exit(1);
}
const seen = new Map();
for (const j of jobs) {
  if (seen.has(j.level)) { console.error(`Two files are for level ${j.level}: ${seen.get(j.level)} and ${j.file}`); process.exit(1); }
  seen.set(j.level, j.file);
}

for (const job of jobs.sort((a, b) => a.level - b.level)) {
  const img = loadImage(job.file);
  const px = processBackground(img, { w: W, h: H, colors, dither });
  const name = `level-${String(job.level).padStart(2, "0")}.png`;
  const note = Math.abs(img.w / img.h - W / H) > 0.02 ? `, cropped from ${(img.w / img.h).toFixed(2)}:1 to ${(W / H).toFixed(2)}:1` : "";
  console.log(`level ${job.level}  ${path.basename(job.file)}  ${img.w}x${img.h}${note}  ->  ${name}  ${W}x${H}, ${countColors(px)} colours${dry ? "   (dry run)" : ""}`);
  if (!dry) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, name), px.toPNG());
  }
}
const missing = Array.from({ length: TOTAL }, (_, i) => i + 1).filter((n) => !seen.has(n));
if (missing.length) console.log(`\nNot updated (still the previous image): level ${missing.join(", ")}`);

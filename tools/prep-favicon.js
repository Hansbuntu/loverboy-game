// Turns one AI-generated icon image into the three favicon files.
//
//   node tools/prep-favicon.js  heart.png  [--out assets/icons]
//
// Centre-crops to a square, then writes favicon-16.png, favicon-32.png and apple-touch-icon.png (180x180).
import fs from "node:fs";
import path from "node:path";
import { makeFavicons } from "./bg-lib.js";
import { loadImage } from "./load-image.js";

const argv = process.argv.slice(2);
const outDir = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : "assets/icons";
const file = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--out");
if (!file) { console.error("usage: node tools/prep-favicon.js image [--out assets/icons]"); process.exit(1); }

fs.mkdirSync(outDir, { recursive: true });
for (const { name, size, px } of makeFavicons(loadImage(file))) {
  fs.writeFileSync(path.join(outDir, name), px.toPNG());
  console.log("wrote", path.join(outDir, name), `${size}x${size}`);
}

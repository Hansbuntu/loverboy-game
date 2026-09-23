// Loads an image file as { w, h, data } (RGBA). PNG is read directly. WebP, JPEG, BMP and GIF are converted to a
// temporary PNG first using Windows' built-in image codecs (PowerShell), so this works on Windows without installing
// anything. On other systems, convert to PNG first.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { decodePNG } from "./png.js";

const CONVERT = `
Add-Type -AssemblyName PresentationCore
$stream = [System.IO.File]::OpenRead($env:LOAD_SRC)
try {
  $dec = [System.Windows.Media.Imaging.BitmapDecoder]::Create($stream, 'PreservePixelFormat', 'OnLoad')
  $enc = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
  $enc.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($dec.Frames[0]))
  $out = [System.IO.File]::Create($env:LOAD_DST); $enc.Save($out); $out.Close()
} finally { $stream.Close() }
`;

export function loadImage(file) {
  const buf = fs.readFileSync(file);
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return decodePNG(buf);   // it really is a PNG, whatever its extension says

  if (process.platform !== "win32") {
    throw new Error(`${path.basename(file)} is not a PNG. Convert it to PNG first (this tool can only convert other formats on Windows).`);
  }
  const tmp = path.join(os.tmpdir(), `load-image-${process.pid}-${Date.now()}.png`);
  try {
    execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", CONVERT], {
      env: { ...process.env, LOAD_SRC: path.resolve(file), LOAD_DST: tmp },
      stdio: ["ignore", "ignore", "pipe"]
    });
    return decodePNG(fs.readFileSync(tmp));
  } catch (e) {
    throw new Error(`Could not read ${path.basename(file)} (${String(e.stderr || e.message).split("\n")[0].trim()}). Try saving it as a PNG.`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

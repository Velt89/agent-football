// Agent Football — decode the art images before the Vite build.
//
// WHY THIS EXISTS: the .webp art cannot be pushed to GitHub through the
// connector (its snapshot push is UTF-8 text only, and the files are binary).
// So the images live in the repo as base64 text chunks under
// frontend/art-src/ (night-stadium.webp.b64.part-01..06, items.webp.b64.part-01..04)
// and this script reassembles them into frontend/public/art/*.webp, where
// Vite copies them into dist/ (served as /art/*.webp, and used as the
// metadata `image` URLs). Run automatically by `npm run build`.
// Idempotent: if the .webp already exists with the expected size and RIFF/WEBP
// magic, it is left alone. Fails the build if a chunk is missing or corrupt.
//
// If the art is ever uploaded as real binary files instead (e.g. via the
// GitHub web UI), this script becomes a no-op for those files and can be
// deleted along with art-src/ — but keep the build script working either way.
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "art-src");
const outDir = join(root, "public", "art");

const IMAGES = {
  "night-stadium.webp": 389898,
  "items.webp": 234394,
};

function isWebp(buf) {
  return buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP";
}

for (const [name, expectedSize] of Object.entries(IMAGES)) {
  const stem = name.replace(".webp", "");
  const outPath = join(outDir, name);
  if (existsSync(outPath)) {
    const existing = readFileSync(outPath);
    if (existing.length === expectedSize && isWebp(existing)) {
      console.log(`decode-art: ${name} already present (${existing.length} bytes), skipping`);
      continue;
    }
    console.log(`decode-art: ${name} present but wrong size/magic, re-decoding`);
  }
  const parts = readdirSync(srcDir)
    .filter((f) => f.startsWith(`${stem}.webp.b64.part-`))
    .sort();
  if (parts.length === 0) {
    throw new Error(`decode-art: no base64 parts found for ${name} in art-src/`);
  }
  const b64 = parts.map((p) => readFileSync(join(srcDir, p), "utf8").replace(/\s+/g, "")).join("");
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== expectedSize || !isWebp(buf)) {
    throw new Error(`decode-art: ${name} decoded to ${buf.length} bytes (expected ${expectedSize}), refusing to write`);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, buf);
  console.log(`decode-art: wrote ${name} (${buf.length} bytes from ${parts.length} parts)`);
}

// One-shot generator for the PWA / home-screen icons. Renders the brand mark
// (the gradient "U" tile from the app header) at every size the manifest and
// iOS need. Run: node scripts/gen-icons.mjs
// The U is drawn as a stroked path, not <text>, so rendering doesn't depend on
// system fonts.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const tile = (rx) => `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#g)"/>
  <path d="M 172 150 V 276 a 84 84 0 0 0 168 0 V 150"
        fill="none" stroke="#ffffff" stroke-width="58" stroke-linecap="round"/>
</svg>`;

// Rounded tile for regular icons; full-bleed square for the maskable variant
// (the OS applies its own mask, the artwork must reach every edge).
const rounded = Buffer.from(tile(112));
const fullBleed = Buffer.from(tile(0));

mkdirSync("public", { recursive: true });

const jobs = [
  { src: rounded, size: 192, out: "public/icon-192.png" },
  { src: rounded, size: 512, out: "public/icon-512.png" },
  { src: fullBleed, size: 512, out: "public/icon-maskable-512.png" },
  { src: fullBleed, size: 180, out: "src/app/apple-icon.png" },
];

for (const { src, size, out } of jobs) {
  await sharp(src).resize(size, size).png().toFile(out);
  console.log("wrote", out);
}

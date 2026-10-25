// One-off: renders the PWA icons from an inline SVG. Run with `node scripts/generate-icons.mjs`.
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const paw = (padding) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0f766e"/>
  <g fill="#fff" transform="translate(256 256) scale(${1 - padding}) translate(-256 -256)">
    <ellipse cx="256" cy="330" rx="92" ry="74"/>
    <ellipse cx="150" cy="232" rx="38" ry="52"/>
    <ellipse cx="226" cy="162" rx="38" ry="52"/>
    <ellipse cx="286" cy="162" rx="38" ry="52"/>
    <ellipse cx="362" cy="232" rx="38" ry="52"/>
  </g>
</svg>`;

await mkdir("public/icons", { recursive: true });
await sharp(Buffer.from(paw(0)))
  .resize(192)
  .png()
  .toFile("public/icons/icon-192.png");
await sharp(Buffer.from(paw(0)))
  .resize(512)
  .png()
  .toFile("public/icons/icon-512.png");
// Maskable icons keep the artwork inside the central safe zone.
await sharp(Buffer.from(paw(0.3)))
  .resize(512)
  .png()
  .toFile("public/icons/maskable-512.png");
await sharp(Buffer.from(paw(0)))
  .resize(180)
  .png()
  .toFile("src/app/apple-icon.png");

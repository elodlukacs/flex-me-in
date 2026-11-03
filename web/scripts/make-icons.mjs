#!/usr/bin/env node
/**
 * Draws the fe-hunt app icons (a magnifier with a </> glyph on a blue tile)
 * and writes them as PNGs into web/public/icons. No image libraries: shapes
 * are signed-distance functions, anti-aliased by 4x4 supersampling, and the
 * PNG is encoded by hand with node:zlib.
 *
 *   node web/scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url));

const TOP = [0x3a, 0x70, 0xf0];
const BOTTOM = [0x1b, 0x3f, 0xae];
const GLYPH = [0xff, 0xff, 0xff];

// ---- geometry (unit square, y down) ----------------------------------------

function roundedBox(x, y, half, radius) {
  const qx = Math.abs(x - 0.5) - half + radius;
  const qy = Math.abs(y - 0.5) - half + radius;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius;
}

function capsule(x, y, ax, ay, bx, by, r) {
  const px = x - ax;
  const py = y - ay;
  const dx = bx - ax;
  const dy = by - ay;
  const h = Math.min(Math.max((px * dx + py * dy) / (dx * dx + dy * dy), 0), 1);
  return Math.hypot(px - dx * h, py - dy * h) - r;
}

/** Signed distance to the glyph, in glyph space (unit square). */
function glyph(x, y) {
  const cx = 0.44;
  const cy = 0.42;
  const ring = Math.abs(Math.hypot(x - cx, y - cy) - 0.215) - 0.042;
  const handle = capsule(x, y, 0.605, 0.585, 0.775, 0.755, 0.058);
  const s = 0.024;
  const left = Math.min(
    capsule(x, y, 0.405, 0.345, 0.34, 0.42, s),
    capsule(x, y, 0.34, 0.42, 0.405, 0.495, s),
  );
  const right = Math.min(
    capsule(x, y, 0.475, 0.345, 0.54, 0.42, s),
    capsule(x, y, 0.54, 0.42, 0.475, 0.495, s),
  );
  return Math.min(ring, handle, left, right);
}

// ---- rendering --------------------------------------------------------------

/**
 * @param size      pixels
 * @param tile      'rounded' (transparent corners) or 'full' (opaque square)
 * @param glyphScale shrink the glyph toward the centre (maskable safe zone)
 */
function render(size, tile, glyphScale) {
  const SS = 4;
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bgCov = 0;
      let glyphCov = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          const inTile = tile === 'full' || roundedBox(x, y, 0.5, 0.225) <= 0;
          if (!inTile) continue;
          bgCov++;
          const gx = 0.5 + (x - 0.5 - 0.01) / glyphScale;
          const gy = 0.5 + (y - 0.5 + 0.01) / glyphScale;
          if (glyph(gx, gy) <= 0) glyphCov++;
        }
      }
      const n = SS * SS;
      const t = (px + py) / (2 * size);
      const i = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) {
        const bg = TOP[c] + (BOTTOM[c] - TOP[c]) * t;
        const g = bgCov ? glyphCov / bgCov : 0;
        rgba[i + c] = Math.round(bg + (GLYPH[c] - bg) * g);
      }
      rgba[i + 3] = Math.round((bgCov / n) * 255);
    }
  }
  return rgba;
}

// ---- PNG encoding -----------------------------------------------------------

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- outputs ----------------------------------------------------------------

const icons = [
  { file: 'icon-192.png', size: 192, tile: 'rounded', scale: 0.9 },
  { file: 'icon-512.png', size: 512, tile: 'rounded', scale: 0.9 },
  // Maskable: opaque, glyph inside the 80% safe zone.
  { file: 'icon-maskable-512.png', size: 512, tile: 'full', scale: 0.68 },
  // iOS masks the corners itself and paints transparency black.
  { file: 'apple-touch-icon.png', size: 180, tile: 'full', scale: 0.84 },
];

mkdirSync(outDir, { recursive: true });
for (const { file, size, tile, scale } of icons) {
  writeFileSync(join(outDir, file), encodePng(size, render(size, tile, scale)));
  console.log(`wrote ${file} (${size}x${size})`);
}

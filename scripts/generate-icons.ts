/**
 * Generate placeholder PWA icons.
 *
 * Drops 4 PNGs into /public:
 *   - icon-192.png   (any-purpose)
 *   - icon-512.png   (any-purpose)
 *   - icon-mask.png  (maskable, padded for safe zone)
 *   - apple-icon.png (180×180, Apple touch icon)
 *
 * Style: solid #ff6b00 (primary-container) with a white "A" centered.
 * Real artwork can replace these any time.
 *
 * No external deps — uses a tiny zlib-only PNG encoder.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const PUBLIC = path.resolve("public");
fs.mkdirSync(PUBLIC, { recursive: true });

type Color = [number, number, number, number];
const ORANGE: Color = [0xff, 0x6b, 0x00, 0xff];
const WHITE: Color = [0xff, 0xff, 0xff, 0xff];

/**
 * Render a giant "A" letter into the buffer.
 *
 * The glyph is drawn as three strokes: two diagonal legs that meet at the
 * top-centre apex, plus a horizontal crossbar at 62% of the height. The legs
 * are rasterised row by row (each row fills a small horizontal run) which
 * gives clean diagonals without needing a font renderer.
 */
function renderLetterA(
  buf: Buffer,
  width: number,
  height: number,
  inset: number,
  bg: Color,
  fg: Color,
) {
  // Fill background.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      buf[i] = bg[0];
      buf[i + 1] = bg[1];
      buf[i + 2] = bg[2];
      buf[i + 3] = bg[3];
    }
  }

  const left = inset;
  const right = width - inset;
  const top = inset;
  const bottom = height - inset;
  const glyphW = right - left;
  const glyphH = bottom - top;
  const stroke = Math.max(2, Math.round(glyphW * 0.16));
  const apexX = left + glyphW / 2;

  // Diagonal legs: for each scanline, interpolate the leg centre from the
  // apex (top) down to the outer baseline corners (bottom).
  for (let y = top; y < bottom; y++) {
    const t = (y - top) / glyphH; // 0 at apex, 1 at baseline
    const leftCentre = apexX - t * (apexX - left);
    const rightCentre = apexX + t * (right - apexX);

    fillRect(
      buf,
      width,
      Math.round(leftCentre - stroke / 2),
      y,
      Math.round(leftCentre + stroke / 2),
      y + 1,
      fg,
    );
    fillRect(
      buf,
      width,
      Math.round(rightCentre - stroke / 2),
      y,
      Math.round(rightCentre + stroke / 2),
      y + 1,
      fg,
    );
  }

  // Crossbar, spanning between the two legs at 62% of the height.
  const barT = 0.62;
  const barY = Math.round(top + glyphH * barT);
  const barLeft = Math.round(apexX - barT * (apexX - left) - stroke / 2);
  const barRight = Math.round(apexX + barT * (right - apexX) + stroke / 2);
  fillRect(buf, width, barLeft, barY, barRight, barY + stroke, fg);
}

function fillRect(
  buf: Buffer,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Color,
) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      buf[i] = color[0];
      buf[i + 1] = color[1];
      buf[i + 2] = color[2];
      buf[i + 3] = color[3];
    }
  }
}

/** Encode an RGBA buffer as a PNG and write to `outFile`. */
function writePng(outFile: string, width: number, height: number, rgba: Buffer) {
  // PNG signature.
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT (filter byte 0 per row, then RGBA)
  const stride = width * 4;
  const filtered = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    filtered[y * (stride + 1)] = 0;
    rgba.copy(filtered, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(filtered);

  // IEND
  fs.writeFileSync(outFile, Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]));
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeIcon(size: number, paddingPct: number, file: string) {
  const buf = Buffer.alloc(size * size * 4);
  const inset = Math.round(size * paddingPct);
  renderLetterA(buf, size, size, inset, ORANGE, WHITE);
  writePng(path.join(PUBLIC, file), size, size, buf);
}

makeIcon(192, 0.2, "icon-192.png");
makeIcon(512, 0.2, "icon-512.png");
// Maskable: extra padding so platforms can crop into a circle / squircle.
makeIcon(512, 0.3, "icon-mask.png");
makeIcon(180, 0.2, "apple-icon.png");

console.log("Generated icons in public/.");

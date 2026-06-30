#!/usr/bin/env node
'use strict';
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t   = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

// カラー
const BG     = [0x11, 0x11, 0x11];
const ACCENT = [0xe8, 0x96, 0x3a]; // --accent
const STR    = [0xc8, 0xa9, 0x6e]; // 弦色

function pixelColor(x, y, S) {
  const pad = S * 0.14;
  const r   = S * 0.14;
  const l = pad, ri = S - pad, t = pad, b = S - pad;

  if (x < l || x >= ri || y < t || y >= b) return BG;

  const dx = Math.min(x - l, ri - 1 - x);
  const dy = Math.min(y - t, b  - 1 - y);
  if (dx < r && dy < r && dx * dx + dy * dy > r * r) return BG;

  const iw = ri - l;
  const ih = b  - t;
  const rx = x - l;
  const ry = y - t;

  // 指板のフレット線（縦線 3本）
  const frets = [0.30, 0.55, 0.80];
  for (const fx of frets) {
    const fx_px = Math.round(iw * fx);
    if (Math.abs(rx - fx_px) <= Math.max(1, S * 0.012)) return ACCENT;
  }

  // 弦（横線 4本）
  const strings = [0.25, 0.42, 0.60, 0.78];
  for (const sy of strings) {
    const sy_px = Math.round(ih * sy);
    const thick = Math.max(1, S * 0.01);
    if (Math.abs(ry - sy_px) <= thick) return STR;
  }

  return BG;
}

function makePNG(size) {
  const rowBytes = 1 + size * 3;
  const raw      = Buffer.alloc(size * rowBytes, 0);
  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelColor(x, y, size);
      const off = y * rowBytes + 1 + x * 3;
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b;
    }
  }

  const IHDR = Buffer.alloc(13);
  IHDR.writeUInt32BE(size, 0);
  IHDR.writeUInt32BE(size, 4);
  IHDR[8] = 8; IHDR[9] = 2;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', IHDR),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = __dirname;
for (const size of [192, 512]) {
  const outPath = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, makePNG(size));
  console.log(`✓ icon-${size}.png  (${size}×${size})`);
}

#!/usr/bin/env node
// Regenerates the `gnk-badge.png` skill asset as a shields-flat-square style
// "powered by greeneek" badge: 726x120, gray label panel + brand-blue value
// panel, white 5x7 bitmap text. Deterministic (no font loading, no network):
// the PNG is written with a dependency-free encoder so the rebrand ships a
// brand-correct asset everywhere the old one was referenced.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const W = 726, H = 120
const SCALE = 6, GLYPH_W = 5 * SCALE, ADVANCE = 6 * SCALE, PAD = 18
const LABEL = 'POWERED BY', VALUE = 'GREENEEK'
const LABEL_W = PAD * 2 + LABEL.length * ADVANCE - (ADVANCE - GLYPH_W)
const LABEL_BG = [85, 85, 85], VALUE_BG = [77, 107, 254] // shields gray over the brand badge blue

// Minimal 5x7 uppercase font (the only glyphs the badge needs).
const F = {
  A: ['01110','10001','10001','11111','10001','10001','10001'], B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01111','10000','10000','10000','10000','10000','01111'], D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'], G: ['01110','10001','10000','10111','10001','10001','01110'],
  I: ['11111','00100','00100','00100','00100','00100','11111'], K: ['10001','10010','10100','11000','10100','10010','10001'],
  L: ['10000','10000','10000','10000','10000','10000','11111'], N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'], P: ['11110','10001','10001','11110','10000','10000','10000'],
  R: ['11110','10001','10001','11110','10100','10010','10001'], S: ['01111','10000','10000','01110','00001','00001','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'], U: ['10001','10001','10001','10001','10001','10001','01110'],
  W: ['10001','10001','10001','10101','10101','11011','10001'],
  Y: ['10001','10001','10001','01010','00100','00100','00100'], ' ': ['00000','00000','00000','00000','00000','00000','00000'],
}

const bytes = Buffer.alloc(W * H * 4)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const c = x < LABEL_W ? LABEL_BG : VALUE_BG
  const i = (y * W + x) * 4
  bytes[i] = c[0]; bytes[i + 1] = c[1]; bytes[i + 2] = c[2]; bytes[i + 3] = 255
}
const textY = Math.floor((H - 7 * SCALE) / 2)
function draw(text, x0) {
  let x = x0
  for (const ch of text) {
    const glyph = F[ch]
    if (glyph !== undefined) {
      for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] !== '1') continue
        for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) {
          const px = x + gx * SCALE + dx, py = textY + gy * SCALE + dy
          const i = (py * W + px) * 4
          bytes[i] = 255; bytes[i + 1] = 255; bytes[i + 2] = 255; bytes[i + 3] = 255
        }
      }
    }
    x += ADVANCE
  }
}
draw(LABEL, PAD)
draw(VALUE, LABEL_W + PAD)

// --- PNG encoder (IHDR + IDAT + IEND, filter 0) ---
let CRC_TABLE
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256)
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c }
  }
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return c ^ 0xffffffff
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([len, body, crc])
}
const raw = Buffer.alloc(H * (1 + W * 4))
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0
  bytes.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4)
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])
const target = process.argv[2] ?? 'packages/skill/skill-badge/assets/gnk-badge.png'
writeFileSync(target, png)
console.log(`wrote ${target} (${png.length}B, ${W}x${H}, label ${LABEL_W}px)`)

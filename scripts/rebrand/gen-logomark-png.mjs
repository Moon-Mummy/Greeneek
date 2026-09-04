#!/usr/bin/env node
// Regenerates the Greeneek logo-mark / favicon PNGs: a rounded-square brand
// green tile with a geometric white "G" monogram. Coverage is computed
// analytically per subpixel (4x4 supersampling), so edges are smooth without
// a rasterizer or font. Deterministic output.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const S = Number(process.argv[3] ?? 512) // square canvas
const MODE = process.argv[4] ?? 'tile' // 'tile' = filled rounded square; 'mark' = glyph on transparent
const GREEN = [77, 107, 254] // brand blue, matches the documented badge accent
const WHITE = [255, 255, 255]
const RING_R = S * 0.295, RING_T = S * 0.118, NOTCH = 1.15, BAR_Y = S / 2
const CX = S / 2, CY = S / 2
const BAR = { x0: CX, x1: CX + RING_R * 0.98, y0: BAR_Y, y1: BAR_Y + RING_T }
const RX = S * 0.225 // tile corner radius

function inRoundTile(x, y) {
  const m = RX
  const inBody = x >= 0 && x <= S && y >= 0 && y <= S
  if (!inBody) return false
  const cx = x < m ? m : x > S - m ? S - m : x
  const cy = y < m ? m : y > S - m ? S - m : y
  return (x - cx) ** 2 + (y - cy) ** 2 <= m * m || (x >= m && x <= S - m) || (y >= m && y <= S - m)
}
function gCoverage(x, y) {
  const dx = x - CX, dy = y - CY
  const r = Math.hypot(dx, dy)
  const inRing = r >= RING_R - RING_T / 2 && r <= RING_R + RING_T / 2
  const ang = Math.atan2(dy, dx) // -pi..pi; opening centered on ~-0.35 rad (upper right)
  const inNotch = ang > -NOTCH / 2 - 0.35 && ang < NOTCH / 2 - 0.35
  const ring = inRing && !(inNotch && x >= CX) ? 1 : 0
  const bar = x >= BAR.x0 && x <= BAR.x1 && y >= BAR.y0 && y <= BAR.y1 ? 1 : 0
  return Math.max(ring, bar)
}
const SUB = 4
const bytes = Buffer.alloc(S * S * 4)
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let tile = 0, g = 0
    for (let sy = 0; sy < SUB; sy++) for (let sx = 0; sx < SUB; sx++) {
      const fx = x + (sx + 0.5) / SUB, fy = y + (sy + 0.5) / SUB
      if (MODE === 'mark' || inRoundTile(fx, fy)) { tile++; g += gCoverage(fx, fy) }
    }
    const a = tile / (SUB * SUB)
    const mix = g / (tile === 0 ? 1 : tile)
    const i = (y * S + x) * 4
    if (MODE === 'tile') {
      bytes[i] = Math.round(GREEN[0] + (WHITE[0] - GREEN[0]) * mix)
      bytes[i + 1] = Math.round(GREEN[1] + (WHITE[1] - GREEN[1]) * mix)
      bytes[i + 2] = Math.round(GREEN[2] + (WHITE[2] - GREEN[2]) * mix)
      bytes[i + 3] = Math.round(255 * a)
    } else {
      bytes[i] = 255
      bytes[i + 1] = 255
      bytes[i + 2] = 255
      bytes[i + 3] = Math.round(255 * (g / (SUB * SUB)))
    }
  }
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([len, body, crc])
}
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
const raw = Buffer.alloc(S * (1 + S * 4))
for (let y = 0; y < S; y++) {
  raw[y * (1 + S * 4)] = 0
  bytes.copy(raw, y * (1 + S * 4) + 1, y * S * 4, (y + 1) * S * 4)
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
])
writeFileSync(process.argv[2], png)
console.log(`wrote ${process.argv[2]} (${png.length}B, ${S}x${S})`)

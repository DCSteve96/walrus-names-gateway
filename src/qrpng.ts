/**
 * QR → PNG at the edge, no canvas, no wasm. Used as the og:image of a payment
 * request (send.epochsui.com/<name>?amount=…): Telegram, X and WhatsApp only
 * unfurl raster images, so the SVG generator used for names is not enough.
 *
 * Matrix from `qrcode`'s pure-JS core; PNG written by hand (8-bit grayscale,
 * filter 0 on every row, zlib via CompressionStream("deflate")).
 */
// @ts-ignore: deep import without types
import QRCodeCore from 'qrcode/lib/core/qrcode.js'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function u32(n: number): Uint8Array { return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]) }
function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(type)
  const body = new Uint8Array(t.length + data.length); body.set(t); body.set(data, t.length)
  const out = new Uint8Array(4 + body.length + 4)
  out.set(u32(data.length), 0); out.set(body, 4); out.set(u32(crc32(body)), 4 + body.length)
  return out
}
async function zlib(raw: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate')
  const w = cs.writable.getWriter(); w.write(raw); w.close()
  return new Uint8Array(await new Response(cs.readable).arrayBuffer())
}

/** PNG of `text` as a QR code, `px` wide, white quiet zone, dark modules. */
export async function qrPng(text: string, px = 640): Promise<Uint8Array> {
  const qr = QRCodeCore.create(text, { errorCorrectionLevel: 'M' })
  const size: number = qr.modules.size
  const data: Uint8Array = qr.modules.data
  const margin = 4
  const scale = Math.max(1, Math.floor(px / (size + margin * 2)))
  const W = (size + margin * 2) * scale
  const DARK = 0x0b, LIGHT = 0xff

  // scanline: 1 filter byte + W grayscale bytes
  const raw = new Uint8Array((W + 1) * W)
  raw.fill(LIGHT)
  for (let y = 0; y < W; y++) {
    raw[y * (W + 1)] = 0
    const my = Math.floor(y / scale) - margin
    if (my < 0 || my >= size) continue
    for (let x = 0; x < W; x++) {
      const mx = Math.floor(x / scale) - margin
      if (mx < 0 || mx >= size) continue
      if (data[my * size + mx]) raw[y * (W + 1) + 1 + x] = DARK
    }
  }
  const ihdr = new Uint8Array(13)
  ihdr.set(u32(W), 0); ihdr.set(u32(W), 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 0   // color type: grayscale
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', await zlib(raw)), chunk('IEND', new Uint8Array(0))]
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total); let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

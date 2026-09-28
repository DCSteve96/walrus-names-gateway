// @ts-nocheck
// Epoch Names: card PNG 1200×630 di un nome .epoch.
//   GET /og-name?name=alice → image/png
//
// Perché esiste: il Display dei NameCap punta a og.epochsui.com/{name}, che il
// gateway serviva come SVG. Gli explorer (SuiVision) non rasterizzano SVG e
// mostravano l'icona generica. Rasterizzare sul Worker free sfora i 10 ms di
// CPU; qui (Deno, stesso schema della funzione `card` di Atollia) satori +
// resvg-wasm lo fanno senza problemi. Il gateway fa da proxy e cache, così
// l'unico URL pubblico resta og.epochsui.com/<name>.
import satori from 'https://esm.sh/satori@0.10.13'
import { Resvg, initWasm } from 'https://esm.sh/@resvg/resvg-wasm@2.6.2'

const LOGO_URL = 'https://names.epochsui.com/icon-512.png'
const FONTS = [
  ['Poppins', 700, 'https://cdn.jsdelivr.net/npm/@fontsource/poppins@5.0.8/files/poppins-latin-700-normal.woff'],
  ['Poppins', 500, 'https://cdn.jsdelivr.net/npm/@fontsource/poppins@5.0.8/files/poppins-latin-500-normal.woff'],
]
const MAX_CONCURRENT = 4
let _wasm = null, _fonts = null, _logo = null, _inFlight = 0

function ensureWasm() {
  if (!_wasm) _wasm = initWasm(fetch('https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm'))
  return _wasm
}
async function loadFonts() {
  if (_fonts) return _fonts
  const bufs = await Promise.all(FONTS.map(([, , u]) => fetch(u).then(r => r.arrayBuffer())))
  _fonts = FONTS.map(([name, weight], i) => ({ name, weight, style: 'normal', data: bufs[i] }))
  return _fonts
}
function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s) }
async function loadLogo() {
  if (_logo) return _logo
  const r = await fetch(LOGO_URL)
  if (!r.ok) return null
  _logo = 'data:image/png;base64,' + b64(new Uint8Array(await r.arrayBuffer()))
  return _logo
}

// Niente JSX: satori accetta oggetti { type, props }.
const h = (type, style, children, extra = {}) => ({ type, props: { style, children, ...extra } })

function card(name, logo) {
  const isRare = name.length === 3
  const accent = isRare ? '#E040FB' : '#29B6F6'
  const size = name.length <= 8 ? 96 : name.length <= 14 ? 72 : 52
  // Glow come radial-gradient (satori non supporta filter: blur).
  const glow = (left, top, w, hh, color) => h('div', {
    position: 'absolute', left, top, width: w, height: hh, borderRadius: 999,
    backgroundImage: `radial-gradient(circle at 50% 50%, ${color} 0%, rgba(0,0,0,0) 70%)`,
  })
  return h('div', {
    width: 1200, height: 630, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative',
    backgroundImage: 'radial-gradient(circle at 30% 20%, #17223f 0%, #0a1224 45%, #040a18 100%)', fontFamily: 'Poppins', color: 'white',
  }, [
    glow(200, -220, 800, 640, isRare ? 'rgba(224,64,251,0.30)' : 'rgba(41,182,246,0.28)'),
    glow(550, 300, 900, 600, 'rgba(224,64,251,0.20)'),
    logo
      ? h('img', { marginTop: -10 }, undefined, { src: logo, width: 300, height: 300 })
      : h('div', { width: 300, height: 300, borderRadius: 150, backgroundImage: 'linear-gradient(135deg, #29B6F6, #E040FB)' }),
    h('div', { display: 'flex', alignItems: 'baseline', marginTop: 8, letterSpacing: -2 }, [
      h('span', { fontSize: size, fontWeight: 700, color: 'white' }, name),
      h('span', { fontSize: size, fontWeight: 700, color: accent, opacity: 0.9 }, '.epoch'),
    ]),
    h('div', { display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }, [
      h('div', { display: 'flex', padding: '8px 16px', borderRadius: 999, border: `1px solid ${accent}55`, background: `${accent}14`, fontSize: 22, fontWeight: 500, color: accent, letterSpacing: 4 }, 'EPOCH NAMES'),
      h('div', { display: 'flex', padding: '8px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', fontSize: 22, fontWeight: 500, color: 'rgba(228,228,231,0.9)', letterSpacing: 2 }, isRare ? '3 CHARS · PREMIUM' : 'SITE · PAY · SUI'),
    ]),
    h('div', { position: 'absolute', left: 0, bottom: 0, width: 1200, height: 8, backgroundImage: 'linear-gradient(90deg, #29B6F6, #E040FB)' }),
  ])
}

async function renderPng(name) {
  await ensureWasm()
  const [fonts, logo] = await Promise.all([loadFonts(), loadLogo()])
  const svg = await satori(card(name, logo), { width: 1200, height: 630, fonts })
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const name = (url.searchParams.get('name') ?? '').toLowerCase().trim()
    if (!/^[a-z0-9-]{1,40}$/.test(name)) return new Response('Bad name', { status: 400 })
    if (_inFlight >= MAX_CONCURRENT)
      return new Response('Busy, try again.', { status: 429, headers: { 'retry-after': '2' } })
    _inFlight++
    try {
      const png = await renderPng(name)
      return new Response(png, { headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=86400, s-maxage=604800',
        'access-control-allow-origin': '*',
      } })
    } finally { _inFlight-- }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e && e.stack || e) }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
})

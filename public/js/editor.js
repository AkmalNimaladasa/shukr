// Shukr editor — Instagram/TikTok-style editing for photos (incl. carousels) and videos.
// Tools: Filters (16, strength), Adjust (11 sliders), Crop & rotate (aspect, zoom, pan, rotate, flip), Text (fonts, colours,
// backgrounds, alignment, timing on video), Stickers (Shukr pack + emoji), Draw (pen/marker/neon/eraser, undo),
// Video: Trim, Speed, Reverse, Sound (original volume, mute, voice effects, nasheed from your library, voiceover), Captions (auto).
// Photos are rendered in the browser (canvas). Videos are rendered on the server with the exact same colour maths (fx.js).
import { $, $$, esc, escAttr, I, api, toast, sheet } from './core.js';
import './fx.js';
const FX = globalThis.ShukrFX;

const FONTS = [['classic', 'Classic', '800 {s}px Figtree, system-ui, sans-serif'], ['serif', 'Serif', '700 {s}px "Bricolage Grotesque", Georgia, serif'], ['type', 'Typewriter', '700 {s}px "Courier New", ui-monospace, monospace'],
  ['neon', 'Neon', '800 {s}px Figtree, system-ui, sans-serif'], ['arabic', 'عربي', '700 {s}px Amiri, "Amiri Quran", serif'], ['bold', 'Strong', '900 {s}px Figtree, system-ui, sans-serif']];
const COLORS = ['#FFFFFF', '#000000', '#FF2D55', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#007AFF', '#AF52DE', '#D4AF37', '#8E8E93', '#FFB3C7'];
const EMOJI_FILE = e => '/stickers/emoji/' + [...e].filter(c => c !== '\uFE0F').map(c => c.codePointAt(0).toString(16)).join('-') + '.svg';
const EMOJI = ['🤲', '🕌', '📿', '🌙', '⭐', '✨', '🤍', '💚', '🌿', '🌸', '🌧️', '☀️', '🔥', '💯', '😊', '🥹', '😂', '😍', '🙏', '👏', '📖', '🕋', '🍯', '🌴', '🐪', '☕', '📍', '🎉'];
const VOICE_FX = [['none', 'None'], ['deep', 'Deep'], ['high', 'High'], ['echo', 'Echo'], ['masjid', 'Masjid'], ['chorus', 'Chorus'], ['radio', 'Radio'], ['robot', 'Robot'], ['whisper', 'Whisper'], ['giant', 'Giant']];
const IC = {
  fxs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 16v4M17 18h4"/></svg>',
  cover: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m4 16 5-5 4 4 2-2 5 5"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="9" r="6"/><circle cx="15" cy="9" r="6"/><circle cx="12" cy="15" r="6"/></svg>',
  adjust: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  crop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>',
  sticker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3H7a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h6l8-8V7a4 4 0 0 0-4-4Z"/><path d="M13 21v-4a4 4 0 0 1 4-4h4"/><path d="M8.5 10h0M14.5 10h0M9 14.5a4 4 0 0 0 5 0"/></svg>',
  draw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 21c3 0 4-1 5-3l9.5-9.5a2.1 2.1 0 0 0-3-3L5 15c-2 1-2 3-2 6Z"/></svg>',
  trim: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/></svg>',
  speed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  cc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M10 10.5a2.5 2.5 0 1 0 0 3M17 10.5a2.5 2.5 0 1 0 0 3"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  rot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  flip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M16 7l4 5-4 5M8 7l-4 5 4 5"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg>',
  rev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 17 6 12l5-5M18 17l-5-5 5-5"/></svg>'
};

export function defaultEdit() { return { filter: 'normal', strength: 100, adjust: {}, aspect: 'original', crop: { zoom: 1, x: 0, y: 0 }, rotate: 0, flip: false, layers: [], strokes: [],
  trim: null, speed: 1, reverse: false, audio: { original: 1, mute: false, effect: 'none', nasheedId: null, music: 0.6, voiceoverId: null, voiceover: 1.2 }, captions: [], captionStyle: 'outline', effect: 'none', cover: null }; }
export const EFFECTS = [['none', 'None', 'all'], ['glitch', 'Glitch', 'all'], ['vhs', 'VHS', 'all'], ['dreamy', 'Dreamy', 'all'], ['mirror', 'Mirror', 'all'], ['zoom', 'Slow zoom', 'video'], ['fade', 'Fade in/out', 'video']];
// canvas version of the effects (photos + live video preview); the server renders the same looks with ffmpeg
function applyEffect(g, W, H, eff, t = 0, D = 1) { if (!eff || eff === 'none') return; const cw = g.canvas.width, ch = g.canvas.height; g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  if (eff === 'glitch' || eff === 'vhs') { const k = Math.max(1, Math.round(cw * (eff === 'glitch' ? .012 : .006))), d = g.getImageData(0, 0, cw, ch), s = new Uint8ClampedArray(d.data), o = d.data;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const i = (y * cw + x) * 4, xr = Math.min(cw - 1, x + k), xb = Math.max(0, x - k); o[i] = s[(y * cw + xr) * 4]; o[i + 2] = s[(y * cw + xb) * 4 + 2]; }
    if (eff === 'vhs') for (let i = 0; i < o.length; i += 4) { const n = (Math.random() - .5) * 34; o[i] += n; o[i + 1] += n; o[i + 2] += n; }
    g.putImageData(d, 0, 0); if (eff === 'vhs') { g.fillStyle = 'rgba(0,0,0,.12)'; for (let y = 0; y < ch; y += 4) g.fillRect(0, y, cw, 1); } }
  else if (eff === 'dreamy') { const s = document.createElement('canvas'); s.width = Math.max(2, cw >> 4); s.height = Math.max(2, ch >> 4); const sg = s.getContext('2d'); sg.drawImage(g.canvas, 0, 0, s.width, s.height);
    g.globalCompositeOperation = 'screen'; g.globalAlpha = .45; g.imageSmoothingQuality = 'high'; g.drawImage(s, 0, 0, cw, ch); }
  else if (eff === 'mirror') { const half = Math.floor(cw / 2); g.translate(cw, 0); g.scale(-1, 1); g.drawImage(g.canvas, 0, 0, half, ch, 0, 0, half, ch); }
  else if (eff === 'zoom') { const z = 1 + .15 * Math.min(1, t / Math.max(.1, D)), c2 = document.createElement('canvas'); c2.width = cw; c2.height = ch; c2.getContext('2d').drawImage(g.canvas, 0, 0); g.drawImage(c2, cw * (1 - z) / 2, ch * (1 - z) / 2, cw * z, ch * z); }
  else if (eff === 'fade') { const a = Math.max(0, 1 - t / .5, 1 - (D - t) / .5); if (a > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, a).toFixed(3)})`; g.fillRect(0, 0, cw, ch); } }
  g.restore(); }

// ---------- rendering helpers (shared by preview & export) ----------
function drawSource(g, src, sw, sh, e, W, H) { // fills W×H with the cropped/rotated/flipped source
  const o = FX.outSize(sw, sh, e.rotate, e.aspect, 1), cr = FX.cropRect(o.sw, o.sh, W, H, e.crop.zoom, e.crop.x, e.crop.y);
  g.save(); g.translate(-cr.x, -cr.y); g.scale(cr.s, cr.s);
  g.translate(o.sw / 2, o.sh / 2); g.rotate(e.rotate * Math.PI / 180); if (e.flip) g.scale(-1, 1); g.drawImage(src, -sw / 2, -sh / 2, sw, sh); g.restore();
}
function postFX(g, W, H, fx) {
  if (fx.vig) { const r = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .25, W / 2, H / 2, Math.hypot(W, H) / 2); r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, `rgba(0,0,0,${(fx.vig / 100 * .75).toFixed(3)})`); g.fillStyle = r; g.fillRect(0, 0, W, H); }
  if (fx.grain) { const n = g.getImageData(0, 0, W, H), d = n.data, a = fx.grain / 100 * 40; for (let i = 0; i < d.length; i += 4) { const v = (Math.random() - .5) * a; d[i] += v; d[i + 1] += v; d[i + 2] += v; } g.putImageData(n, 0, 0); }
}
function sharpen(g, W, H, amt) { if (!amt) return; const k = amt / 100 * .9, src = g.getImageData(0, 0, W, H), out = g.createImageData(W, H), s = src.data, o = out.data, w4 = W * 4;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * w4 + x * 4; for (let c = 0; c < 3; c++) { const v = s[i + c], n = (y > 0 ? s[i - w4 + c] : v) + (y < H - 1 ? s[i + w4 + c] : v) + (x > 0 ? s[i - 4 + c] : v) + (x < W - 1 ? s[i + 4 + c] : v); o[i + c] = v + k * (4 * v - n); } o[i + 3] = s[i + 3]; }
  g.putImageData(out, 0, 0); }
function fontOf(L, s) { return (FONTS.find(f => f[0] === L.font) || FONTS[0])[2].replace('{s}', Math.round(s)); }
function drawLayer(g, L, W, H, imgCache) {
  g.save(); g.translate(L.x * W, L.y * H); g.rotate(L.rot || 0); const sc = (L.scale || 1);
  if (L.type === 'text') { const size = W * 0.075 * sc; g.font = fontOf(L, size); g.textAlign = L.align || 'center'; g.textBaseline = 'middle';
    const lines = String(L.text).split('\n'), lh = size * 1.25, ws = lines.map(t => g.measureText(t).width), mw = Math.max(...ws, 1);
    const ax = L.align === 'left' ? -mw / 2 : L.align === 'right' ? mw / 2 : 0;
    lines.forEach((t, i) => { const y = (i - (lines.length - 1) / 2) * lh;
      if (L.bg && L.bg !== 'none') { const w = ws[i] + size * .6, x0 = (L.align === 'left' ? ax : L.align === 'right' ? ax - ws[i] : -ws[i] / 2) - size * .3;
        g.fillStyle = L.bg === 'solid' ? L.color : 'rgba(0,0,0,.55)'; roundRect(g, x0, y - lh / 2, w, lh, size * .25); g.fill(); }
      const fg = L.bg === 'solid' ? (isLight(L.color) ? '#000' : '#fff') : L.color;
      if (L.font === 'neon') { g.shadowColor = L.color; g.shadowBlur = size * .5; g.fillStyle = '#fff'; } else if (!L.bg || L.bg === 'none') { g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = size * .12; g.fillStyle = fg; } else { g.shadowBlur = 0; g.fillStyle = fg; }
      g.fillText(t, ax, y); g.shadowBlur = 0; });
  } else if (L.type === 'sticker') { const s = W * 0.32 * sc;
    if (L.emoji) { g.font = `${Math.round(s * .8)}px "Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L.emoji, 0, 0); }
    else { const im = imgCache[L.src]; if (im?.complete && im.naturalWidth) { const r = im.naturalHeight / im.naturalWidth; g.drawImage(im, -s / 2, -s * r / 2, s, s * r); } }
  }
  g.restore();
}
function drawStrokes(g, strokes, W, H) { for (const s of strokes) { if (s.pts.length < 1) continue; g.save(); g.lineCap = g.lineJoin = 'round'; g.lineWidth = s.w * W;
  if (s.tool === 'eraser') g.globalCompositeOperation = 'destination-out'; g.strokeStyle = s.tool === 'neon' ? '#fff' : s.color; g.globalAlpha = s.tool === 'marker' ? .45 : 1;
  if (s.tool === 'neon') { g.shadowColor = s.color; g.shadowBlur = s.w * W * 2.2; }
  g.beginPath(); const P = s.pts; g.moveTo(P[0][0] * W, P[0][1] * H); for (let i = 1; i < P.length - 1; i++) { const mx = (P[i][0] + P[i + 1][0]) / 2, my = (P[i][1] + P[i + 1][1]) / 2; g.quadraticCurveTo(P[i][0] * W, P[i][1] * H, mx * W, my * H); } if (P.length > 1) g.lineTo(P[P.length - 1][0] * W, P[P.length - 1][1] * H); if (s.pts.length === 1) g.lineTo(s.pts[0][0] * W + .1, s.pts[0][1] * H); g.stroke(); g.restore(); } }
const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const isLight = c => { const n = parseInt(c.slice(1), 16); return ((n >> 16) * .299 + (n >> 8 & 255) * .587 + (n & 255) * .114) > 160; };

export async function renderPhoto(img, e, maxLong = 1920, imgCache = {}) {
  const sw = img.naturalWidth || img.videoWidth, sh = img.naturalHeight || img.videoHeight; const o = FX.outSize(sw, sh, e.rotate, e.aspect, maxLong);
  const c = document.createElement('canvas'); c.width = o.w; c.height = o.h; const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; drawSource(g, img, sw, sh, e, o.w, o.h);
  const fx = FX.build(e.filter, e.strength, e.adjust);
  if (!FX.isIdentity({ ...fx, vig: 0, sharp: 0, grain: 0 })) { const d = g.getImageData(0, 0, o.w, o.h); FX.applyPixels(d, fx); g.putImageData(d, 0, 0); }
  sharpen(g, o.w, o.h, fx.sharp); postFX(g, o.w, o.h, fx); applyEffect(g, o.w, o.h, e.effect);
  await overlay(g, e, o.w, o.h, imgCache);
  return c;
}
async function overlay(g, e, W, H, imgCache, filterFn) {
  if (e.strokes.length) { const d = document.createElement('canvas'); d.width = W; d.height = H; drawStrokes(d.getContext('2d'), e.strokes, W, H); g.drawImage(d, 0, 0); }
  for (const L of e.layers) { if (filterFn && !filterFn(L)) continue; if (L.type === 'sticker' && L.src && !imgCache[L.src]) { const im = new Image(); im.src = L.src; imgCache[L.src] = im; await im.decode().catch(() => {}); } drawLayer(g, L, W, H, imgCache); }
}


// ---------- GPU preview (WebGL): same colour maths as FX.applyPixels, runs at full frame rate on phones ----------
function makeGL(canvas) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false }); if (!gl) return null;
  const vs = 'attribute vec2 p;varying vec2 uv;void main(){uv=vec2((p.x+1.)/2.,(1.-p.y)/2.);gl_Position=vec4(p,0.,1.);}';
  const fs = `precision mediump float;varying vec2 uv;uniform sampler2D img;uniform sampler2D crv;uniform mat4 M;uniform vec3 off;uniform float vig;uniform vec2 res;uniform float eff;uniform float t;
    float rnd(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233))+t)*43758.5453);}
    vec3 grade(vec3 c){c=clamp((M*vec4(c,0.)).rgb+off,0.,1.);return vec3(texture2D(crv,vec2(c.r,.5)).r,texture2D(crv,vec2(c.g,.5)).r,texture2D(crv,vec2(c.b,.5)).r);}
    void main(){vec2 u=uv; if(eff>3.5&&eff<4.5&&u.x>.5)u.x=1.-u.x;
      vec3 c=texture2D(img,u).rgb;
      if(eff>.5&&eff<2.5){float k=eff<1.5?.012:.006;c.r=texture2D(img,u+vec2(k,0.)).r;c.b=texture2D(img,u-vec2(k,0.)).b;}
      c=grade(c);
      if(eff>1.5&&eff<2.5){c+= (rnd(uv*res)-.5)*.13; if(mod(floor(uv.y*res.y),4.)<1.)c*=.88;}
      if(eff>2.5&&eff<3.5){vec3 b=vec3(0.);for(int i=-2;i<=2;i++)for(int j=-2;j<=2;j++)b+=texture2D(img,uv+vec2(float(i),float(j))*.012).rgb;b=grade(b/25.);c=1.-(1.-c)*(1.-b*.45);}
      if(vig>0.){float d=distance(uv,vec2(.5))/.7071;c*=1.-vig*.75*smoothstep(.35,1.,d);}
      gl_FragColor=vec4(clamp(c,0.,1.),1.);}`;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  let pr; try { pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null; } catch { return null; }
  gl.useProgram(pr); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE)); [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR)); return t; };
  const tImg = tex(0), tCrv = tex(1); gl.uniform1i(gl.getUniformLocation(pr, 'img'), 0); gl.uniform1i(gl.getUniformLocation(pr, 'crv'), 1);
  const U = n => gl.getUniformLocation(pr, n), EFF = { none: 0, glitch: 1, vhs: 2, dreamy: 3, mirror: 4 };
  let lastKey = '';
  return { draw(srcCanvas, fx, effect, time) {
    canvas.width !== srcCanvas.width && (canvas.width = srcCanvas.width); canvas.height !== srcCanvas.height && (canvas.height = srcCanvas.height);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tImg); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
    const key = JSON.stringify(fx.curve); if (key !== lastKey) { lastKey = key; const L = new Uint8Array(256 * 4); for (let i = 0; i < 256; i++) { const x = i / 255 * 32, k = Math.min(31, Math.floor(x)), f = x - k, v = Math.round(255 * (fx.curve[k] + (fx.curve[k + 1] - fx.curve[k]) * f)); L[i * 4] = L[i * 4 + 1] = L[i * 4 + 2] = v; L[i * 4 + 3] = 255; }
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tCrv); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, L); }
    const m = fx.M; // column-major mat4 from 3x4 rows
    gl.uniformMatrix4fv(U('M'), false, new Float32Array([m[0][0], m[1][0], m[2][0], 0, m[0][1], m[1][1], m[2][1], 0, m[0][2], m[1][2], m[2][2], 0, 0, 0, 0, 1]));
    gl.uniform3f(U('off'), m[0][3], m[1][3], m[2][3]); gl.uniform1f(U('vig'), (fx.vig || 0) / 100); gl.uniform2f(U('res'), canvas.width, canvas.height);
    gl.uniform1f(U('eff'), EFF[effect] || 0); gl.uniform1f(U('t'), time || 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); } };
}
// ---------- the editor UI ----------
// items: [{file, meta:{url,width,height,duration,poster}, video, edit?}] ; resolves with items (edits stored on each) or null if cancelled
export function openEditor(items, startIndex = 0) {
  return new Promise(resolve => {
    let idx = startIndex, tool = null, alive = true;
    items.forEach(it => { it.edit = it.edit || defaultEdit(); });
    const host = document.createElement('div'); host.className = 'ed'; document.body.append(host);
    const imgCache = {};
    host.innerHTML = `<div class="ed-top"><button class="ed-ic" data-x aria-label="Discard edits">${I.x}</button><div class="ed-dots"></div><button class="ed-ic" data-undo aria-label="Undo">${IC.undo}</button><button class="ed-done" data-done>Next</button></div>
      <div class="ed-stage"><div class="ed-frame"><canvas class="ed-cv"></canvas><canvas class="ed-gl"></canvas><video class="ed-vid" playsinline muted loop hidden></video><svg class="ed-svg" width="0" height="0" aria-hidden="true"><filter id="edF" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="0 1"/><feFuncG type="table" tableValues="0 1"/><feFuncB type="table" tableValues="0 1"/></feComponentTransfer></filter></svg>
        <canvas class="ed-ov"></canvas><div class="ed-layers"></div><div class="ed-cap" hidden></div><div class="ed-vig"></div></div><button class="ed-pp" hidden aria-label="Play or pause"></button></div>
      <div class="ed-panel" hidden></div>
      <nav class="ed-tools"></nav>`;
    const glc = $('.ed-gl', host); let GL = null; try { GL = makeGL(glc); } catch { GL = null; } const scratch = document.createElement('canvas');
    const frame = $('.ed-frame', host), cv = $('.ed-cv', host), vid = $('.ed-vid', host), ov = $('.ed-ov', host), layersEl = $('.ed-layers', host), panel = $('.ed-panel', host), capEl = $('.ed-cap', host);
    let src = null, it = null, e = null, W = 0, H = 0, history = [];
    const snap = () => { history.push(JSON.stringify(e)); if (history.length > 40) history.shift(); };
    const onResize = () => alive && (layout(), paint());
    const onNav = () => close(null);
    const close = res => { if (!alive) return; alive = false; removeEventListener('hashchange', onNav); removeEventListener('popstate', onPop); if (window.history.state?.shukrEditor) window.history.back(); document.querySelectorAll('.ed-txt,.ed-rec').forEach(x => x.remove()); cancelAnimationFrame(vraf); vid.pause(); vid.removeAttribute('src'); vid.load(); if (np) np.pause(); removeEventListener('resize', onResize); host.remove(); resolve(res); };
    let sel = null; // last touched layer (pinch anywhere on the picture scales/rotates it)

    let loadSeq = 0;
    async function load(i) {
      idx = i; it = items[i]; e = it.edit; history = []; tool = null; panel.hidden = true;
      $('.ed-dots', host).innerHTML = items.length > 1 ? items.map((_, k) => `<i class="${k === i ? 'on' : ''}" data-dot="${k}"></i>`).join('') : '';
      $$('[data-dot]', host).forEach(d => d.onclick = () => load(+d.dataset.dot));
      if (it.video && !e.trim) e.trim = { start: 0, end: Math.max(.5, (it.meta.duration || 60000) / 1000) };
      tools(); frame.classList.add('loading'); const myLoad = ++loadSeq;
      if (it.video) { vid.hidden = false; vid.classList.add('ed-vid-src'); cv.hidden = false; vid.src = it.meta.url; vid.muted = false; vid.volume = e.audio.mute ? 0 : Math.min(1, e.audio.original); vid.load();
        const ok = await new Promise(r => { if (vid.readyState >= 2) return r(true); const t = setTimeout(() => r(vid.readyState >= 1), 15000); vid.onloadeddata = () => { clearTimeout(t); r(true); }; vid.onerror = () => { clearTimeout(t); r(false); }; });
        if (myLoad !== loadSeq || !alive) return;
        if (!ok) { frame.classList.remove('loading'); toast('This video format can’t be previewed on this phone — you can still trim and post it.'); }
        src = vid;
        // Camera recordings (WebM from MediaRecorder) report an infinite duration until the end is seen
        if (!isFinite(vid.duration)) { await new Promise(r => { const t = setTimeout(r, 4000); vid.ondurationchange = () => { if (isFinite(vid.duration)) { clearTimeout(t); r(); } }; vid.currentTime = 1e7; }); vid.ondurationchange = null; vid.currentTime = 0; }
        it.dur = isFinite(vid.duration) && vid.duration > 0 ? vid.duration : Math.max(1, (it.meta.duration || 0) / 1000);
        if (!e.trim || !isFinite(e.trim.end) || e.trim.end > it.dur + .05 || (e.trim.end === Math.max(.5, (it.meta.duration || 60000) / 1000) && !it.meta.duration)) e.trim = { start: Math.min(e.trim?.start || 0, it.dur - .3), end: it.dur };
        vid.playbackRate = Math.min(4, Math.max(.25, e.speed)); dirty = true;
        vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}); }); }
      else { vid.pause(); vid.hidden = true; cv.hidden = false; const im = new Image(); im.src = it.meta.url; await im.decode().catch(() => {}); if (myLoad !== loadSeq || !alive) return; src = im; }
      frame.classList.remove('loading');
      const pp = $('.ed-pp', host); pp.hidden = !it.video; if (it.video) { const upd = () => { pp.innerHTML = vid.paused ? I.play : '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'; pp.classList.toggle('paused', vid.paused); }; vid.onplay = vid.onpause = upd; upd();
        pp.onclick = ev => { ev.stopPropagation(); if (vid.paused) { if (vid.currentTime >= e.trim.end - .05) vid.currentTime = e.trim.start; vid.play().catch(() => {}); if (np) np.play().catch(() => {}); } else { vid.pause(); np?.pause(); } }; }
      tools(); layout(); paint();
    }
    function layout() { if (!src || !it) return; const sw = src.naturalWidth || src.videoWidth || 1080, sh = src.naturalHeight || src.videoHeight || 1920, sEl = $('.ed-stage', host), st = { width: sEl.clientWidth - 16, height: sEl.clientHeight - 8 };
      const o = FX.outSize(sw, sh, e.rotate, e.aspect, 1000), r = o.w / o.h; let w = st.width, h = w / r; if (h > st.height) { h = st.height; w = h * r; }
      W = Math.round(w); H = Math.round(h); frame.style.width = W + 'px'; frame.style.height = H + 'px';
      const dpr = it.video ? 1 : Math.min(2, devicePixelRatio || 1); [cv, ov].forEach(c => { c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px'; });

    }
    // live video preview: each frame drawn to the canvas with the exact export colour maths
    let vraf = 0, vfx = null;
    let fxKey = '', fxCache = null; const curFx = () => { const k = e.filter + '|' + e.strength + '|' + JSON.stringify(e.adjust); if (k !== fxKey) { fxKey = k; fxCache = FX.build(e.filter, e.strength, e.adjust); } return fxCache; };
    const GPU_EFF = { none: 1, glitch: 1, vhs: 1, dreamy: 1, mirror: 1 };
    function drawVideoFrame() { if (!it?.video || !alive) return; vfx = curFx();
      if (GL && GPU_EFF[e.effect || 'none']) { // fast path: crop/rotate on a small 2D canvas, colour + effects on the GPU
        const dpr = Math.min(1.5, devicePixelRatio || 1), sw2 = Math.round(W * dpr), sh2 = Math.round(H * dpr); if (scratch.width !== sw2) scratch.width = sw2; if (scratch.height !== sh2) scratch.height = sh2; const sg = scratch.getContext('2d', { alpha: false }); sg.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (vid.readyState >= 2) drawSource(sg, vid, vid.videoWidth, vid.videoHeight, e, W, H); GL.draw(scratch, vfx, e.effect || 'none', performance.now() / 1000);
        glc.hidden = false; cv.style.visibility = 'hidden'; return; }
      glc.hidden = true; cv.style.visibility = '';
      const g = cv.getContext('2d', { willReadFrequently: true }), dpr = cv.width / W;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); if (vid.readyState >= 2) drawSource(g, vid, vid.videoWidth, vid.videoHeight, e, W, H);
      if (!FX.isIdentity({ ...vfx, vig: 0, sharp: 0, grain: 0 })) { g.setTransform(1, 0, 0, 1, 0, 0); try { const d = g.getImageData(0, 0, cv.width, cv.height); FX.applyPixels(d, vfx); g.putImageData(d, 0, 0); } catch {} }
      if (e.effect && e.effect !== 'none') try { applyEffect(g, W, H, e.effect, (vid.currentTime - e.trim.start) / e.speed, (e.trim.end - e.trim.start) / e.speed); } catch {} }
    // Redraw only when the video decodes a NEW frame (requestVideoFrameCallback) or an edit changes — not 60×/s.
    let lastT = -1, dirty = true, busyDraw = false;
    const frameCb = () => { if (!alive) return; if (it?.video && !busyDraw) { busyDraw = true; try { drawVideoFrame(); } finally { busyDraw = false; } } if (vid.requestVideoFrameCallback) vid.requestVideoFrameCallback(frameCb); };
    if (vid.requestVideoFrameCallback) vid.requestVideoFrameCallback(frameCb);
    const vloop = () => { if (!alive) return; const t = vid.currentTime;
      if (it?.video && (dirty || (!vid.requestVideoFrameCallback && t !== lastT))) { lastT = t; dirty = false; drawVideoFrame(); }
      setTimeout(() => { vraf = requestAnimationFrame(vloop); }, vid.paused ? 50 : 0); }; vraf = requestAnimationFrame(vloop);
    let raf = 0; function paint() { cancelAnimationFrame(raf); raf = requestAnimationFrame(async () => {
      const fx = FX.build(e.filter, e.strength, e.adjust), dpr = cv.width / W;
      if (!it.video && GL && GPU_EFF[e.effect || 'none']) { scratch.width = cv.width; scratch.height = cv.height; const sg = scratch.getContext('2d'); sg.setTransform(dpr, 0, 0, dpr, 0, 0); drawSource(sg, src, src.naturalWidth, src.naturalHeight, e, W, H);
        GL.draw(scratch, curFx(), e.effect || 'none', 0); glc.hidden = false; cv.style.visibility = 'hidden'; }
      else if (!it.video) { glc.hidden = true; cv.style.visibility = ''; const g = cv.getContext('2d', { willReadFrequently: true }); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); drawSource(g, src, src.naturalWidth, src.naturalHeight, e, W, H);
        if (!FX.isIdentity({ ...fx, vig: 0, sharp: 0, grain: 0 })) { g.setTransform(1, 0, 0, 1, 0, 0); const d = g.getImageData(0, 0, cv.width, cv.height); FX.applyPixels(d, fx); g.putImageData(d, 0, 0); }
        applyEffect(g, W, H, e.effect); }
      else { dirty = true; drawVideoFrame(); }
      $('.ed-vig', host).style.boxShadow = fx.vig && glc.hidden ? `inset 0 0 ${Math.round(Math.min(W, H) * .35)}px ${Math.round(Math.min(W, H) * .1)}px rgba(0,0,0,${(fx.vig / 100 * .7).toFixed(2)})` : 'none';
      const og = ov.getContext('2d'); og.setTransform(dpr, 0, 0, dpr, 0, 0); og.clearRect(0, 0, W, H); drawStrokes(og, e.strokes, W, H);
      drawLayersDom();
    }); }
    // Layers as draggable DOM (pinch to scale/rotate); rendered to canvas on export
    function drawLayersDom() {
      layersEl.innerHTML = e.layers.map((L, i) => { const s = L.scale || 1, st = `left:${L.x * 100}%;top:${L.y * 100}%;transform:translate(-50%,-50%) rotate(${L.rot || 0}rad) scale(${s})`;
        if (L.type === 'text') { const f = (FONTS.find(x => x[0] === L.font) || FONTS[0])[2].replace('{s}', Math.round(W * .075));
          const fg = L.bg === 'solid' ? (isLight(L.color) ? '#000' : '#fff') : L.font === 'neon' ? '#fff' : L.color;
          return `<div class="ed-L t ${L.bg ? 'bg-' + L.bg : ''} ${L.font === 'neon' ? 'neon' : ''} ${L === sel ? 'sel' : ''}" data-l="${i}" style="${st};font:${f};color:${fg};text-align:${L.align || 'center'};--c:${L.color}">${esc(L.text).replace(/\n/g, '<br>')}${L.tts ? '<svg class="ed-tts" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M11 5 6 9H3v6h3l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>' : ''}</div>`; }
        return `<div class="ed-L s" data-l="${i}" style="${st};width:${W * .32}px">${L.emoji ? `<span style="font-size:${W * .26}px">${L.emoji}</span>` : `<img src="${escAttr(L.src)}" alt="">`}</div>`; }).join('');
      $$('.ed-L', layersEl).forEach(el => gesture(el, e.layers[+el.dataset.l]));
    }
    function gesture(el, L) { const pts = new Map(); let base = null, moved = false, t0 = 0;
      el.onpointerdown = ev => { if (tool === 'draw') return; ev.stopPropagation(); ev.preventDefault(); el.setPointerCapture(ev.pointerId); pts.set(ev.pointerId, [ev.clientX, ev.clientY]); if (pts.size === 1) { snap(); t0 = Date.now(); moved = false; sel = L; $$('.ed-L', layersEl).forEach(x => x.classList.toggle('sel', x === el)); } base = { L: { ...L }, p: [...pts.values()].map(p => [...p]) }; $('.ed-trash', host)?.classList.add('show'); };
      el.onpointermove = ev => { if (!pts.has(ev.pointerId)) return; pts.set(ev.pointerId, [ev.clientX, ev.clientY]); const P = [...pts.values()]; if (!moved && Math.hypot(P[0][0] - base.p[0][0], P[0][1] - base.p[0][1]) < 6 && P.length === 1) return; moved = true;
        if (P.length === 1 && base.p.length === 1) { L.x = base.L.x + (P[0][0] - base.p[0][0]) / W; L.y = base.L.y + (P[0][1] - base.p[0][1]) / H; }
        else if (P.length >= 2 && base.p.length >= 2) { const d0 = Math.hypot(base.p[1][0] - base.p[0][0], base.p[1][1] - base.p[0][1]), d1 = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]);
          const a0 = Math.atan2(base.p[1][1] - base.p[0][1], base.p[1][0] - base.p[0][0]), a1 = Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]);
          L.scale = Math.max(.2, Math.min(6, (base.L.scale || 1) * d1 / Math.max(10, d0))); L.rot = (base.L.rot || 0) + a1 - a0;
          L.x = base.L.x + ((P[0][0] + P[1][0]) - (base.p[0][0] + base.p[1][0])) / 2 / W; L.y = base.L.y + ((P[0][1] + P[1][1]) - (base.p[0][1] + base.p[1][1])) / 2 / H; }
        el.style.left = L.x * 100 + '%'; el.style.top = L.y * 100 + '%'; el.style.transform = `translate(-50%,-50%) rotate(${L.rot || 0}rad) scale(${L.scale || 1})`;
        const tr = $('.ed-trash', host); if (tr) tr.classList.toggle('hot', L.y > .86); };
      el.onpointerup = el.onpointercancel = ev => { pts.delete(ev.pointerId); base = { L: { ...L }, p: [...pts.values()].map(p => [...p]) };
        if (!pts.size) { $('.ed-trash', host)?.classList.remove('show', 'hot'); if (L.y > .86) { e.layers.splice(e.layers.indexOf(L), 1); paint(); return; }
          if (!moved && Date.now() - t0 < 350 && L.type === 'text') { history.pop(); textEditor(L); } else if (!moved) history.pop(); } };
      el.addEventListener('wheel', ev => { ev.preventDefault(); L.scale = Math.max(.2, Math.min(6, (L.scale || 1) * (ev.deltaY < 0 ? 1.08 : .92))); el.style.transform = `translate(-50%,-50%) rotate(${L.rot || 0}rad) scale(${L.scale})`; }, { passive: false });
    }
    // ---------- tool bar & panels ----------
    function tools() {
      const T = [['filter', 'Filters', IC.filter], ['adjust', 'Adjust', IC.adjust], ['crop', 'Crop', IC.crop], ['text', 'Text', IC.text], ['sticker', 'Stickers', IC.sticker], ['draw', 'Draw', IC.draw],
        ['fx', 'Effects', IC.fxs], ...(!it.video ? [['sound', 'Sound', IC.sound]] : []), ...(it.video ? [['trim', 'Trim', IC.trim], ['speed', 'Speed', IC.speed], ['sound', 'Sound', IC.sound], ['cc', 'Captions', IC.cc], ['cover', 'Cover', IC.cover]] : [])];
      $('.ed-tools', host).innerHTML = T.map(([k, l, ic]) => `<button data-tool="${k}" class="${tool === k ? 'on' : ''}">${ic}<small>${l}</small></button>`).join('');
      $$('[data-tool]', host).forEach(b => b.onclick = () => openTool(tool === b.dataset.tool ? null : b.dataset.tool));
    }
    function openTool(k) { tool = k; tools(); host.classList.toggle('drawing', k === 'draw'); if (!k) { panel.hidden = true; return; } panel.hidden = false; ({ filter: pFilter, adjust: pAdjust, crop: pCrop, text: () => { openTool(null); textEditor(null); }, sticker: pSticker, draw: pDraw, trim: pTrim, speed: pSpeed, sound: pSound, cc: pCaptions, fx: pEffects, cover: pCover })[k](); }
    function pEffects() { panel.innerHTML = `<div class="ed-row scroll">${EFFECTS.filter(x => x[2] === 'all' || it.video).map(([k, l]) => `<button class="ed-chip ${(e.effect || 'none') === k ? 'on' : ''}" data-eff="${k}">${l}</button>`).join('')}</div>`;
      $$('[data-eff]', panel).forEach(b => b.onclick = () => { snap(); e.effect = b.dataset.eff; pEffects(); paint(); }); }
    function pCover() { const D = (e.trim.end - e.trim.start) / e.speed; if (e.cover == null) e.cover = Math.min(1, D / 3);
      const s = slider('cv', 'Cover frame', 0, Math.round(D * 10), Math.round(e.cover * 10), v => { e.cover = v / 10; vid.pause(); vid.currentTime = e.trim.start + e.cover * e.speed; }, v => (v / 10).toFixed(1) + 's');
      panel.innerHTML = `${s.html}<div class="ed-hint">Slide to pick the picture people see before your video plays.</div>`; s.bind(); vid.pause(); vid.currentTime = e.trim.start + e.cover * e.speed; }
    function slider(id, label, min, max, val, on, fmt = v => v) { return { html: `<label class="ed-sl"><span>${label}</span><input type="range" id="${id}" min="${min}" max="${max}" value="${val}"><b id="${id}v">${fmt(val)}</b></label>`, bind: () => { const i = $('#' + id, panel); i.onpointerdown = snap; i.oninput = () => { $('#' + id + 'v', panel).textContent = fmt(+i.value); on(+i.value); }; } }; }
    function pFilter() {
      const thumbs = FX.FILTERS.map(([k, l]) => `<button class="ed-fl ${e.filter === k ? 'on' : ''}" data-f="${k}"><canvas width="64" height="80"></canvas><small>${l}</small></button>`).join('');
      const s = slider('fs', 'Strength', 0, 100, e.strength, v => { e.strength = v; paint(); });
      panel.innerHTML = `<div class="ed-row scroll">${thumbs}</div>${e.filter !== 'normal' ? s.html : ''}`; if (e.filter !== 'normal') s.bind();
      // live thumbnails from the current frame
      const tc = document.createElement('canvas'); tc.width = 64; tc.height = 80; const tg = tc.getContext('2d', { willReadFrequently: true });
      try { const sw = src.naturalWidth || src.videoWidth, sh = src.naturalHeight || src.videoHeight, r = Math.max(64 / sw, 80 / sh); tg.drawImage(src, (64 - sw * r) / 2, (80 - sh * r) / 2, sw * r, sh * r); } catch {}
      $$('.ed-fl', panel).forEach(b => { const c = b.querySelector('canvas'), g = c.getContext('2d'); try { const d = tg.getImageData(0, 0, 64, 80); FX.applyPixels(d, FX.build(b.dataset.f, 100, {})); g.putImageData(d, 0, 0); } catch {}
        b.onclick = () => { snap(); e.filter = b.dataset.f; if (e.filter !== 'normal' && !e.strength) e.strength = 100; pFilter(); paint(); }; });
      const on = $('.ed-fl.on', panel); on && on.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
    let adjKey = 'bri';
    function pAdjust() { const A = FX.ADJUST.find(a => a[0] === adjKey); const s = slider('as', A[1], A[2], A[3], e.adjust[adjKey] || 0, v => { e.adjust[adjKey] = v; paint(); $$('.ed-adj', panel).forEach(b => b.classList.toggle('set', !!e.adjust[b.dataset.a])); });
      panel.innerHTML = `${s.html}<div class="ed-row scroll">${FX.ADJUST.map(([k, l]) => `<button class="ed-adj ${k === adjKey ? 'on' : ''} ${e.adjust[k] ? 'set' : ''}" data-a="${k}">${l}</button>`).join('')}</div>`; s.bind();
      $$('.ed-adj', panel).forEach(b => b.onclick = () => { adjKey = b.dataset.a; pAdjust(); }); }
    function pCrop() { const z = slider('cz', 'Zoom', 100, 400, Math.round(e.crop.zoom * 100), v => { e.crop.zoom = v / 100; layout(); paint(); }, v => (v / 100).toFixed(1) + '×');
      panel.innerHTML = `<div class="ed-row">${Object.keys(FX.ASPECTS).map(a => `<button class="ed-chip ${e.aspect === a ? 'on' : ''}" data-asp="${a}">${a === 'original' ? 'Original' : a}</button>`).join('')}</div>${z.html}
        <div class="ed-row"><button class="ed-chip" data-r>${IC.rot} Rotate</button><button class="ed-chip ${e.flip ? 'on' : ''}" data-fl>${IC.flip} Flip</button><button class="ed-chip" data-reset>Reset</button></div><div class="ed-hint">Drag the picture to reposition</div>`; z.bind();
      $$('[data-asp]', panel).forEach(b => b.onclick = () => { snap(); e.aspect = b.dataset.asp; pCrop(); layout(); paint(); });
      $('[data-r]', panel).onclick = () => { snap(); e.rotate = (e.rotate + 90) % 360; layout(); paint(); };
      $('[data-fl]', panel).onclick = () => { snap(); e.flip = !e.flip; pCrop(); layout(); paint(); };
      $('[data-reset]', panel).onclick = () => { snap(); Object.assign(e, { aspect: 'original', rotate: 0, flip: false, crop: { zoom: 1, x: 0, y: 0 } }); pCrop(); layout(); paint(); };
    }
    // pan the picture while Crop is open
    frame.addEventListener('pointerdown', ev => { if (tool !== 'crop' || ev.target.closest('.ed-L')) return; snap(); const sx = ev.clientX, sy = ev.clientY, c0 = { ...e.crop };
      const mv = m => { e.crop.x = Math.max(-1, Math.min(1, c0.x - (m.clientX - sx) / W * 2 / Math.max(1, e.crop.zoom))); e.crop.y = Math.max(-1, Math.min(1, c0.y - (m.clientY - sy) / H * 2 / Math.max(1, e.crop.zoom))); layout(); paint(); };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); });
    function textEditor(L, preset) {
      const isNew = !L; L = L || { type: 'text', text: '', font: 'classic', color: '#FFFFFF', bg: 'none', align: 'center', x: .5, y: .38, scale: 1, rot: 0, start: 0, end: null, ...(preset || {}) };
      const was = JSON.stringify(L);
      const box = document.createElement('div'); box.className = 'ed-txt';
      box.innerHTML = `<div class="ed-txt-top"><button data-al>${L.align === 'left' ? '⟸' : L.align === 'right' ? '⟹' : '≡'}</button><button data-bg>${L.bg === 'solid' ? 'A▮' : L.bg === 'soft' ? 'A▯' : 'A'}</button>${it.video ? `<button data-tts class="ed-ttsb ${L.tts ? 'on' : ''}" aria-label="Read text aloud">TTS</button>` : ''}<button class="ed-done" data-ok>Done</button></div>
        <textarea maxlength="300" rows="3" placeholder="Type something…">${esc(L.text)}</textarea>
        <div class="ed-row scroll">${FONTS.map(([k, l]) => `<button class="ed-chip ${L.font === k ? 'on' : ''}" data-font="${k}" style="font:${FONTS.find(f => f[0] === k)[2].replace('{s}', 15)}">${l}</button>`).join('')}</div>
        <div class="ed-row scroll">${COLORS.map(c => `<button class="ed-col ${L.color === c ? 'on' : ''}" data-col="${c}" style="background:${c}"></button>`).join('')}</div>`;
      host.append(box); const ta = $('textarea', box); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      $('[data-tts]', box) && ($('[data-tts]', box).onclick = ev => { L.tts = L.tts ? null : 'nova'; ev.currentTarget.classList.toggle('on', !!L.tts); toast(L.tts ? 'Text-to-speech on — Shukr reads this aloud when it appears' : 'Text-to-speech off'); });
      const sty = () => { const f = (FONTS.find(x => x[0] === L.font) || FONTS[0])[2].replace('{s}', 30); ta.style.font = f; ta.style.textAlign = L.align; ta.style.color = L.bg === 'solid' ? (isLight(L.color) ? '#000' : '#fff') : L.color; ta.style.background = L.bg === 'solid' ? L.color : L.bg === 'soft' ? 'rgba(0,0,0,.55)' : 'transparent'; ta.style.textShadow = L.font === 'neon' ? `0 0 12px ${L.color}` : 'none'; };
      sty();
      $('[data-al]', box).onclick = ev => { L.align = L.align === 'center' ? 'left' : L.align === 'left' ? 'right' : 'center'; ev.currentTarget.textContent = L.align === 'left' ? '⟸' : L.align === 'right' ? '⟹' : '≡'; sty(); };
      $('[data-bg]', box).onclick = ev => { L.bg = L.bg === 'none' ? 'solid' : L.bg === 'solid' ? 'soft' : 'none'; ev.currentTarget.textContent = L.bg === 'solid' ? 'A▮' : L.bg === 'soft' ? 'A▯' : 'A'; sty(); };
      $$('[data-font]', box).forEach(b => b.onclick = () => { L.font = b.dataset.font; $$('[data-font]', box).forEach(x => x.classList.toggle('on', x === b)); sty(); });
      $$('[data-col]', box).forEach(b => b.onclick = () => { L.color = b.dataset.col; $$('[data-col]', box).forEach(x => x.classList.toggle('on', x === b)); sty(); });
      $('[data-ok]', box).onclick = () => { const t = ta.value.trim(); box.remove(); if (isNew || JSON.stringify(L) !== was || t !== L.text) { const keep = JSON.stringify(e); history.push(keep); } if (isNew) { if (t) { L.text = t; if (it.video) { L.start = 0; L.end = null; } e.layers.push(L); } } else { if (t) L.text = t; else e.layers.splice(e.layers.indexOf(L), 1); } paint(); if (it.video && isNew && t) setTimeout(() => layerTiming(L), 50); };
    }
    let stickerPack = null;
    async function pSticker() {
      let pack = stickerPack; if (!pack) { try { const j = await (await fetch('/stickers/index.json')).json(); pack = stickerPack = j.stickers || (j.packs || []).flatMap(p => p.stickers || []); } catch { pack = []; } }
      if (tool !== 'sticker' || !alive) return;
      panel.innerHTML = `<div class="ed-tabs"><button class="on" data-st="shukr">Shukr</button><button data-st="emoji">Emoji</button><button data-st="time">Tags · Time</button></div><div class="ed-stk"></div>`;
      const grid = $('.ed-stk', panel);
      const show = k => { $$('[data-st]', panel).forEach(b => b.classList.toggle('on', b.dataset.st === k));
        if (k === 'shukr') grid.innerHTML = pack.map(s => `<button data-src="${escAttr(s.url || ('/stickers/shukr/' + s.file))}"><img src="${escAttr(s.url || ('/stickers/shukr/' + s.file))}" alt="${escAttr(s.label || '')}" loading="lazy"></button>`).join('') || '<p class="muted small">No stickers</p>';
        else if (k === 'emoji') grid.innerHTML = EMOJI.map(x => `<button data-src="${EMOJI_FILE(x)}" class="emo"><img src="${EMOJI_FILE(x)}" alt="${x}"></button>`).join('') + '<small class="ed-credit">Emoji: Twemoji, CC-BY 4.0</small>';
        else { const d = new Date(); grid.innerHTML = [d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), d.toLocaleDateString([], { weekday: 'long' }), d.toLocaleDateString([], { day: 'numeric', month: 'short' }), new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'long' }).format(d), '📍 ' + (localStorage.getItem('shukr.city') || 'My city')].map(t => `<button data-tx="${escAttr(t)}" class="txt">${esc(t)}</button>`).join('') + `<button class="txt" data-tag="@">@ Mention</button><button class="txt" data-tag="#"># Hashtag</button>`; }
        $$('[data-tag]', grid).forEach(b => b.onclick = () => { openTool(null); textEditor(null, { text: b.dataset.tag, font: 'bold', color: b.dataset.tag === '@' ? '#007AFF' : '#FF2D55', bg: 'solid' }); });
        $$('[data-src]', grid).forEach(b => b.onclick = () => add({ type: 'sticker', src: b.dataset.src }));
        $$('[data-emo]', grid).forEach(b => b.onclick = () => add({ type: 'sticker', emoji: b.dataset.emo }));
        $$('[data-tx]', grid).forEach(b => b.onclick = () => add({ type: 'text', text: b.dataset.tx, font: 'bold', color: '#FFFFFF', bg: 'soft', align: 'center', scale: .8 })); };
      const add = L => { snap(); const n = e.layers.length, pos = [[.5, .3], [.5, .62], [.3, .45], [.7, .45], [.5, .45]][n % 5]; e.layers.push({ x: pos[0], y: pos[1], scale: 1, rot: 0, start: 0, end: null, ...L }); openTool(null); paint(); };
      $$('[data-st]', panel).forEach(b => b.onclick = () => show(b.dataset.st)); show('shukr');
    }
    let pen = { tool: 'pen', color: '#FFFFFF', w: .012 };
    function pDraw() {
      panel.innerHTML = `<div class="ed-row">${[['pen', 'Pen'], ['marker', 'Marker'], ['neon', 'Neon'], ['eraser', 'Eraser']].map(([k, l]) => `<button class="ed-chip ${pen.tool === k ? 'on' : ''}" data-pt="${k}">${l}</button>`).join('')}</div>
        <label class="ed-sl"><span>Size</span><input type="range" id="pw" min="3" max="60" value="${Math.round(pen.w * 1000)}"><b></b></label>
        <div class="ed-row scroll">${COLORS.map(c => `<button class="ed-col ${pen.color === c ? 'on' : ''}" data-col="${c}" style="background:${c}"></button>`).join('')}</div>`;
      $$('[data-pt]', panel).forEach(b => b.onclick = () => { pen.tool = b.dataset.pt; pDraw(); });
      $('#pw', panel).oninput = ev => pen.w = +ev.target.value / 1000;
      $$('[data-col]', panel).forEach(b => b.onclick = () => { pen.color = b.dataset.col; pDraw(); });
    }
    ov.addEventListener('pointerdown', ev => { if (tool !== 'draw') return; ev.preventDefault(); snap(); const r = ov.getBoundingClientRect(); const s = { tool: pen.tool, color: pen.color, w: pen.w, pts: [[(ev.clientX - r.left) / W, (ev.clientY - r.top) / H]] }; e.strokes.push(s); ov.setPointerCapture(ev.pointerId);
      ov.onpointermove = m => { s.pts.push([(m.clientX - r.left) / W, (m.clientY - r.top) / H]); const og = ov.getContext('2d'), dpr = ov.width / W; og.setTransform(dpr, 0, 0, dpr, 0, 0); og.clearRect(0, 0, W, H); drawStrokes(og, e.strokes, W, H); };
      ov.onpointerup = ov.onpointercancel = () => { ov.onpointermove = null; if (s.pts.length === 1) s.pts.push([s.pts[0][0] + .001, s.pts[0][1]]); paint(); }; });
    // ---- video tools ----
    function pTrim() { const D = it.dur || 1;
      panel.innerHTML = `<div class="ed-trim"><div class="ed-strip"></div><div class="ed-tsel"><span class="h l" data-h="s"></span><span class="h r" data-h="e"></span></div><i class="ed-tph"></i></div>
        <div class="ed-trow"><span id="tsv"></span><b id="tlen"></b><span id="tev"></span></div><div class="ed-hint">Drag the white handles to trim · tap ▶ to preview</div>`;
      const box = $('.ed-trim', panel), sel = $('.ed-tsel', panel), ph = $('.ed-tph', panel);
      const draw = () => { const a = e.trim.start / D * 100, b = e.trim.end / D * 100; sel.style.left = a + '%'; sel.style.width = (b - a) + '%';
        $('#tsv', panel).textContent = 'From ' + e.trim.start.toFixed(1) + 's'; $('#tev', panel).textContent = 'to ' + e.trim.end.toFixed(1) + 's'; $('#tlen', panel).textContent = `${((e.trim.end - e.trim.start) / e.speed).toFixed(1)}s clip`; };
      $$('[data-h]', panel).forEach(h => h.onpointerdown = ev => { ev.preventDefault(); ev.stopPropagation(); snap(); h.setPointerCapture(ev.pointerId); const r = box.getBoundingClientRect(); vid.pause();
        h.onpointermove = m => { const t = Math.max(0, Math.min(D, (m.clientX - r.left) / r.width * D));
          if (h.dataset.h === 's') e.trim.start = Math.min(t, e.trim.end - .5); else e.trim.end = Math.max(t, e.trim.start + .5);
          vid.currentTime = h.dataset.h === 's' ? e.trim.start : Math.max(e.trim.start, e.trim.end - .05); draw(); };
        h.onpointerup = h.onpointercancel = () => { h.onpointermove = null; vid.currentTime = e.trim.start; vid.play().catch(() => {}); }; });
      // tap on the strip to seek
      box.addEventListener('pointerdown', ev => { if (ev.target.closest('[data-h]')) return; const r = box.getBoundingClientRect(); vid.currentTime = Math.max(e.trim.start, Math.min(e.trim.end, (ev.clientX - r.left) / r.width * D)); });
      const tick = () => { if (!ph.isConnected) return; ph.style.left = (vid.currentTime / D * 100) + '%'; requestAnimationFrame(tick); }; tick();
      draw(); strip(); }
    async function strip() { const el = $('.ed-strip', panel); if (!el) return; const D = it.dur || 1, n = 10, v2 = document.createElement('video'); v2.src = it.meta.url; v2.muted = true; v2.playsInline = true; v2.preload = 'auto';
      await new Promise(r => { v2.onloadeddata = r; setTimeout(r, 3000); }); const c = document.createElement('canvas'); c.width = 48; c.height = 64; const g = c.getContext('2d');
      for (let i = 0; i < n && alive && el.isConnected; i++) { await new Promise(r => { v2.onseeked = r; v2.currentTime = D * (i + .5) / n; setTimeout(r, 1200); });
        try { const sw = v2.videoWidth, sh = v2.videoHeight, r = Math.max(48 / sw, 64 / sh), ox = (48 - sw * r) * (i / Math.max(1, n - 1)); g.drawImage(v2, ox, (64 - sh * r) / 2, sw * r, sh * r); const im = new Image(); im.src = c.toDataURL('image/jpeg', .6); el.append(im); } catch {} } }
    function pSpeed() { panel.innerHTML = `<div class="ed-row">${[0.3, 0.5, 1, 2, 3].map(s => `<button class="ed-chip ${e.speed === s ? 'on' : ''}" data-sp="${s}">${s}×</button>`).join('')}</div>
        <div class="ed-row"><button class="ed-chip ${e.reverse ? 'on' : ''}" data-rev>${IC.rev} Reverse</button></div><div class="ed-hint">${e.reverse ? 'Plays backwards in the final video' : ''}</div>`;
      $$('[data-sp]', panel).forEach(b => b.onclick = () => { snap(); e.speed = +b.dataset.sp; vid.playbackRate = Math.min(4, Math.max(.25, e.speed)); pSpeed(); });
      $('[data-rev]', panel).onclick = () => { snap(); e.reverse = !e.reverse; pSpeed(); }; }
    // ---- Sound: library picker (nasheeds, vocals, nature) like TikTok "Add sound" ----
    let sndCat = 'trending', sndQ = '';
    const fmtD = s => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '';
    async function pSound() {
      const sh = items.find(x => x.video) ? e : items[0].edit; // photos share one sound for the whole post
      if (!it.video) e.audio = sh.audio;
      const o = slider('vo', 'Original sound', 0, 200, Math.round(e.audio.original * 100), v => { e.audio.original = v / 100; vid.volume = Math.min(1, v / 100); }, v => v + '%');
      const m = slider('vm', 'Added sound', 0, 200, Math.round(e.audio.music * 100), v => { e.audio.music = v / 100; if (np) np.volume = Math.min(1, v / 100); }, v => v + '%');
      const cur = e.audio.sound;
      panel.innerHTML = `${cur ? `<div class="ed-cursnd"><span class="ed-disc">♪</span><div class="grow"><b>${esc(cur.title)}</b><small>${esc(cur.artist || '')}</small></div><button class="ed-chip" data-rm>Remove</button></div>${m.html}` : ''}
        <div class="ed-sndsearch"><input class="ed-sinput" placeholder="Search nasheeds, rain, heartbeat…" value="${escAttr(sndQ)}" maxlength="40"></div>
        <div class="ed-row scroll ed-scats"></div><div class="ed-slist"><div class="ed-hint">Loading sounds…</div></div>
        ${it.video ? `<div class="ed-sub">Your audio</div>${o.html}<div class="ed-row"><button class="ed-chip ${e.audio.mute ? 'on' : ''}" data-mute>${e.audio.mute ? 'Original muted' : 'Mute original'}</button><button class="ed-chip ${e.audio.voiceoverId ? 'on' : ''}" data-vo>${IC.mic} ${e.audio.voiceoverId ? 'Re-record voiceover' : 'Voiceover'}</button></div>
        <div class="ed-sub">Voice effects</div><div class="ed-row scroll">${VOICE_FX.map(([k, l]) => `<button class="ed-chip ${e.audio.effect === k ? 'on' : ''}" data-vfx="${k}">${l}</button>`).join('')}</div>
` : `<div class="ed-hint">Your photos become a video with this sound — like photo mode on TikTok.</div>`}
        <a class="ed-link small" href="#/sounds/credits" style="display:block;margin:8px 2px">Sound credits & licences</a>`;
      if (it.video) o.bind(); if (cur) m.bind();
      $('[data-rm]', panel) && ($('[data-rm]', panel).onclick = () => { snap(); e.audio.sound = null; e.audio.nasheedId = null; playNasheed(null); pSound(); });
      if (it.video) { $('[data-mute]', panel).onclick = () => { snap(); e.audio.mute = !e.audio.mute; vid.muted = e.audio.mute; pSound(); };
      $$('[data-vfx]', panel).forEach(b => b.onclick = () => { snap(); e.audio.effect = b.dataset.vfx; $$('[data-vfx]', panel).forEach(x => x.classList.toggle('on', x === b)); toast(b.dataset.vfx === 'none' ? 'Voice effect off' : 'Voice effect is applied when you post'); });
      $('[data-vo]', panel).onclick = recordVoiceover; }
      let t = null; $('.ed-sinput', panel).oninput = ev => { clearTimeout(t); t = setTimeout(() => { sndQ = ev.target.value.trim(); loadSounds(); }, 300); };
      loadSounds();
    }
    let sndReq = 0;
    async function loadSounds() { const list = $('.ed-slist', panel), cats = $('.ed-scats', panel); if (!list) return; const my = ++sndReq;
      let r; try { r = await api('/sounds?' + new URLSearchParams({ cat: sndCat, q: sndQ })); } catch (er) { if (list.isConnected) list.innerHTML = `<div class="ed-hint">${esc(er.message)}</div>`; return; }
      if (my !== sndReq || !list.isConnected || tool !== 'sound') return;
      cats.innerHTML = r.categories.map(([k, l]) => `<button class="ed-chip ${sndCat === k && !sndQ ? 'on' : ''}" data-sc="${k}">${esc(l)}</button>`).join('');
      $$('[data-sc]', cats).forEach(b => b.onclick = () => { sndCat = b.dataset.sc; sndQ = ''; const si = $('.ed-sinput', panel); if (si) si.value = ''; loadSounds(); });
      list.innerHTML = r.sounds.length ? r.sounds.map(s => `<div class="ed-snd ${e.audio.sound?.id === s.id ? 'on' : ''}" data-sid="${escAttr(s.id)}"><button class="ed-sp" data-play="${escAttr(s.url)}" aria-label="Preview">${I.play}</button>
        <div class="grow"><b>${esc(s.title)}</b><small>${esc(s.artist || '')}${s.duration ? ' · ' + fmtD(s.duration) : ''}</small></div><button class="ed-use" data-use="${escAttr(s.id)}">${e.audio.sound?.id === s.id ? 'Added' : 'Use'}</button></div>`).join('')
        : `<div class="ed-hint">${sndCat === 'mine' ? 'You haven’t made a nasheed yet. <a href="#/audio" class="ed-link">Create one</a>' : 'No sounds found.'}</div>`;
      if (r.sounds.length > 6) { list.insertAdjacentHTML('beforeend', `<button class="ed-smore" data-more>Show all ${r.sounds.length} sounds</button>`); $('[data-more]', list).onclick = ev => { list.classList.add('more'); ev.target.remove(); }; }
      $$('[data-play]', list).forEach(b => b.onclick = () => { const playing = np && np._u === b.dataset.play && !np.paused; playNasheed(playing ? null : b.dataset.play); $$('[data-play]', list).forEach(x => x.innerHTML = I.play); if (!playing) b.innerHTML = '❚❚'; });
      $$('[data-use]', list).forEach(b => b.onclick = () => { const s = r.sounds.find(x => x.id === b.dataset.use); snap();
        e.audio.sound = { id: s.id, title: s.title, artist: s.artist || '', url: s.url }; e.audio.nasheedId = s.nasheedId || null; if (!e.audio.music || e.audio.music > 1.5) e.audio.music = 0.6;
        if (!e.audio.voiceoverId && !it.video) {} if (it.video) { vid.currentTime = e.trim.start; vid.play().catch(() => {}); } playNasheed(s.url); toast('Sound added'); pSound(); }); }
    let np = null; function playNasheed(u) { if (np) { np.pause(); np = null; } if (u) { np = new Audio(u); np._u = u; np.loop = true; np.volume = Math.min(1, e.audio.music || .6); np.play().catch(() => {}); } }

    async function recordVoiceover() {
      let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); } catch { return toast('Allow the microphone to record a voiceover'); }
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || ''; const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), ch = [];
      rec.ondataavailable = x => x.data.size && ch.push(x.data); vid.currentTime = e.trim.start; vid.muted = true; vid.play().catch(() => {});
      const bar = document.createElement('div'); bar.className = 'ed-rec'; bar.innerHTML = `<span class="dot"></span> Recording voiceover… <button>Stop</button>`; host.append(bar);
      const stop = () => { if (rec.state !== 'inactive') rec.stop(); }; $('button', bar).onclick = stop; const lim = setTimeout(stop, ((e.trim.end - e.trim.start) / e.speed) * 1000 + 300);
      rec.onstop = async () => { clearTimeout(lim); stream.getTracks().forEach(t => t.stop()); bar.remove(); vid.muted = e.audio.mute; const type = (rec.mimeType || mime || 'audio/webm').split(';')[0]; const blob = new Blob(ch, { type });
        if (blob.size < 2000) return toast('That was too short');
        try { const r = await fetch('/api/social/media', { method: 'POST', headers: { 'Content-Type': type, 'X-Media-Purpose': 'voiceover' }, body: blob, credentials: 'same-origin' }); const j = await r.json(); if (!r.ok) throw new Error(j.error);
          e.audio.voiceoverId = j.media.id; toast('Voiceover added'); pSound(); } catch (er) { toast(er.message || 'Upload failed'); } };
      rec.start(250);
    }
    async function pCaptions() {
      panel.innerHTML = `<div class="ed-row"><button class="ed-chip" data-auto>${IC.cc} ${e.captions.length ? 'Regenerate' : 'Auto captions'}</button><button class="ed-chip ${e.captionStyle === 'outline' ? 'on' : ''}" data-cs="outline">Outline</button><button class="ed-chip ${e.captionStyle === 'boxed' ? 'on' : ''}" data-cs="boxed">Boxed</button>${e.captions.length ? '<button class="ed-chip" data-clear>Remove</button>' : ''}</div>
        <div class="ed-caps">${e.captions.map((c, i) => `<label><small>${c.start.toFixed(1)}s</small><input data-ci="${i}" value="${escAttr(c.text)}" maxlength="120"></label>`).join('') || '<p class="ed-hint">Shukr listens to the speech in your video and writes captions you can edit.</p>'}</div>`;
      $$('[data-cs]', panel).forEach(b => b.onclick = () => { e.captionStyle = b.dataset.cs; pCaptions(); });
      $('[data-clear]', panel) && ($('[data-clear]', panel).onclick = () => { e.captions = []; pCaptions(); });
      $$('[data-ci]', panel).forEach(i => i.oninput = () => e.captions[+i.dataset.ci].text = i.value);
      $('[data-auto]', panel).onclick = async () => { const b = $('[data-auto]', panel); b.disabled = true; b.innerHTML = '<span class="spin"></span> Listening…';
        try { const m = await ensureUploaded(); const r = await api('/video/captions', { body: { mediaId: m.id } });
          // map source time → output time (trim + speed)
          const ed = e; ed.captions = r.captions.filter(c => c.end > ed.trim.start && c.start < ed.trim.end).map(c => ({ start: Math.max(0, (c.start - ed.trim.start) / ed.speed), end: (Math.min(c.end, ed.trim.end) - ed.trim.start) / ed.speed, text: c.text }));
          if (!ed.captions.length) toast('No speech found in this clip'); else toast(`${ed.captions.length} captions added`); } catch (er) { toast(er.message); } if (alive && tool === 'cc') pCaptions(); };
    }
    // caption preview while playing
    vid.addEventListener('timeupdate', () => { if (!it?.video) return; if (vid.currentTime < e.trim.start - .05 || vid.currentTime > e.trim.end) vid.currentTime = e.trim.start;
      const t = (vid.currentTime - e.trim.start) / e.speed, c = e.captions.find(c => t >= c.start && t <= c.end); capEl.hidden = !c; if (c) { capEl.textContent = c.text; capEl.className = 'ed-cap ' + e.captionStyle; }
      $$('.ed-L', layersEl).forEach(el => { const L = e.layers[+el.dataset.l]; el.style.opacity = (L.end == null || (t >= (L.start || 0) && t <= L.end)) ? 1 : .25; }); });
    function layerTiming(L) { if (!it.video) return; const D = (e.trim.end - e.trim.start) / e.speed;
      sheet(`<h3>Show this text…</h3><div class="seg"><button data-w="all" class="${L.end == null ? 'on' : ''}">Whole video</button><button data-w="part" class="${L.end != null ? 'on' : ''}">Part of it</button></div><div id="lt"></div><button class="btn accent block" data-ok style="margin-top:12px">Done</button>`, (sh, c) => {
        const draw = () => { $('#lt', sh).innerHTML = L.end == null ? '' : `<label class="ed-sl"><span>From</span><input type="range" id="l1" min="0" max="${Math.round(D * 10)}" value="${Math.round((L.start || 0) * 10)}"><b>${(L.start || 0).toFixed(1)}s</b></label><label class="ed-sl"><span>Until</span><input type="range" id="l2" min="0" max="${Math.round(D * 10)}" value="${Math.round(L.end * 10)}"><b>${L.end.toFixed(1)}s</b></label>`;
          $('#l1', sh) && ($('#l1', sh).oninput = ev => { L.start = Math.min(+ev.target.value / 10, L.end - .2); ev.target.nextElementSibling.textContent = L.start.toFixed(1) + 's'; });
          $('#l2', sh) && ($('#l2', sh).oninput = ev => { L.end = Math.max(+ev.target.value / 10, (L.start || 0) + .2); ev.target.nextElementSibling.textContent = L.end.toFixed(1) + 's'; }); };
        $$('[data-w]', sh).forEach(b => b.onclick = () => { $$('[data-w]', sh).forEach(x => x.classList.toggle('on', x === b)); if (b.dataset.w === 'all') L.end = null; else { L.start = 0; L.end = Math.min(D, 3); } draw(); });
        draw(); $('[data-ok]', sh).onclick = c; }); }
    // original clip upload (needed for captions & final render), reused
    async function ensureUploaded() { if (it.uploaded) return it.uploaded; const r = await fetch('/api/social/media', { method: 'POST', headers: { 'Content-Type': it.file.type, ...(it.meta.duration ? { 'X-Media-Duration': String(it.meta.duration) } : {}) }, body: it.file, credentials: 'same-origin' });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Upload failed'); it.uploaded = j.media; return j.media; }
    // ---------- top bar ----------
    $('[data-x]', host).onclick = () => { const dirty = items.some(x => JSON.stringify(x.edit) !== JSON.stringify({ ...defaultEdit(), trim: x.edit.trim, filter: x.edit.filter === 'normal' ? 'normal' : x.edit.filter }) || x.edit.filter !== 'normal');
      if (!dirty) return close(null); sheet(`<h3>Discard your edits?</h3><p class="muted">If you go back now, you’ll lose the changes you made.</p><button class="btn block" data-d style="background:#FF3B30;color:#fff;margin-top:12px">Discard</button><button class="btn ghost block" data-k style="margin-top:8px">Keep editing</button>`, (sh, c) => { $('[data-d]', sh).onclick = () => { c(); close(null); }; $('[data-k]', sh).onclick = c; }); };
    $('[data-undo]', host).onclick = () => { const h = history.pop(); if (!h) return; Object.assign(e, JSON.parse(h)); it.edit = e; if (tool) openTool(tool); layout(); paint(); };
    $('[data-done]', host).onclick = () => { if (np) np.pause(); items.forEach(x => x.edited = JSON.stringify({ ...x.edit, audio: null }) !== JSON.stringify({ ...defaultEdit(), audio: null }) || (x.video && JSON.stringify(x.edit.audio) !== JSON.stringify(defaultEdit().audio))); items.sound = items.find(x => !x.video)?.edit.audio?.sound || null; close(items); };
    host.insertAdjacentHTML('beforeend', `<div class="ed-trash">${I.trash || '🗑'}</div>`);
    addEventListener('resize', onResize); addEventListener('hashchange', onNav);
    // Android back button: first press closes open sheets/text box, then asks to discard — never silently drops edits.
    window.history.pushState({ shukrEditor: 1 }, ''); const onPop = () => { if (!alive) return; window.history.pushState({ shukrEditor: 1 }, '');
      const sh = document.querySelector('.sheet.open'); if (sh) { document.querySelector('.sheet-scrim')?.click(); return; }
      const tb = document.querySelector('.ed-txt'); if (tb) { tb.querySelector('[data-ok]')?.click(); return; }
      if (tool) { openTool(null); return; } $('[data-x]', host).click(); };
    addEventListener('popstate', onPop);
    document.querySelectorAll('.ed').forEach(x => { if (x !== host) x.remove(); }); // never stack two editors
    // re-fit the picture whenever the stage changes size (tool panels open/close, keyboard, rotation)
    { const ro = new ResizeObserver(() => { if (alive && src) { layout(); if (!it.video) paint(); else drawLayersDom(); } }); ro.observe($('.ed-stage', host)); const c0 = close; }
    // pinch/rotate anywhere on the picture moves the selected text or sticker (like Instagram)
    { const P = new Map(); let b0 = null; const stage = $('.ed-stage', host);
      stage.addEventListener('pointerdown', ev => { if (tool === 'draw' || tool === 'crop' || ev.target.closest('.ed-L')) return; P.set(ev.pointerId, [ev.clientX, ev.clientY]); if (P.size === 2 && sel) { snap(); const [a, c] = [...P.values()]; b0 = { s: sel.scale || 1, r: sel.rot || 0, d: Math.hypot(a[0] - c[0], a[1] - c[1]), a: Math.atan2(c[1] - a[1], c[0] - a[0]) }; } else if (P.size === 1) { P.t0 = Date.now(); P.p0 = [ev.clientX, ev.clientY]; } });
      stage.addEventListener('pointermove', ev => { if (!P.has(ev.pointerId)) return; P.set(ev.pointerId, [ev.clientX, ev.clientY]); if (P.size !== 2 || !b0 || !sel) return; const [a, c] = [...P.values()];
        sel.scale = Math.max(.2, Math.min(6, b0.s * Math.hypot(a[0] - c[0], a[1] - c[1]) / Math.max(10, b0.d))); sel.rot = b0.r + Math.atan2(c[1] - a[1], c[0] - a[0]) - b0.a;
        const el = $(`[data-l="${e.layers.indexOf(sel)}"]`, layersEl); if (el) el.style.transform = `translate(-50%,-50%) rotate(${sel.rot}rad) scale(${sel.scale})`; });
      const up = ev => { const single = P.size === 1 && !b0 && P.p0 && Date.now() - P.t0 < 300 && Math.hypot(ev.clientX - P.p0[0], ev.clientY - P.p0[1]) < 8; P.delete(ev.pointerId); if (P.size < 2) b0 = null; if (single && !P.size) { sel = null; $$('.ed-L.sel', layersEl).forEach(x => x.classList.remove('sel')); } }; stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up); }
    load(startIndex);
    items._ensureUploaded = ensureUploaded;
  });
}

// ---------- export ----------
export async function exportPhoto(it) { const im = new Image(); im.src = it.meta.url; await im.decode(); const c = await renderPhoto(im, it.edit, 1920);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .9)); return { file: new File([blob], 'photo.jpg', { type: 'image/jpeg' }), meta: { ...it.meta, width: c.width, height: c.height } }; }
// Video: overlays (text/stickers/drawings) become transparent PNG layers at the output size, then the server renders.
// Start a server render and poll until it's done (survives slow networks / long renders).
export async function renderJob(path, body, onStage = () => {}) {
  const { jobId } = await api(path + '?async=1', { body }); const t0 = Date.now();
  for (;;) { await new Promise(r => setTimeout(r, 1500)); let j;
    try { j = await api('/video/jobs/' + jobId); } catch (er) { if (Date.now() - t0 > 6 * 60e3) throw er; continue; }
    if (j.status === 'done') return j; if (j.status === 'error') throw new Error(j.error || 'Rendering failed');
    const s = Math.round((Date.now() - t0) / 1000); onStage(s < 8 ? 'Rendering your edit…' : `Rendering your edit… ${s}s`);
    if (Date.now() - t0 > 6 * 60e3) throw new Error('Rendering is taking too long — try a shorter clip.'); } }
export async function exportVideo(it, uploadOriginal, onStage = () => {}) {
  const e = it.edit; onStage('Uploading video…'); const m = it.uploaded || await uploadOriginal(); it.uploaded = m;
  const vw = it.meta.width || 1080, vh = it.meta.height || 1920, o = FX.outSize(vw, vh, e.rotate, e.aspect, 1280), cache = {}; const layers = [];
  const groups = new Map(); for (const L of e.layers) { const k = L.end == null ? 'all' : `${(L.start || 0).toFixed(2)}-${L.end.toFixed(2)}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(L); }
  if (e.strokes.length && !groups.has('all')) groups.set('all', []);
  for (const [k, list] of groups) { const c = document.createElement('canvas'); c.width = o.w; c.height = o.h; const g = c.getContext('2d');
    if (k === 'all' && e.strokes.length) drawStrokes(g, e.strokes, o.w, o.h);
    for (const L of list) { if (L.type === 'sticker' && L.src && !cache[L.src]) { const im = new Image(); im.src = L.src; cache[L.src] = im; await im.decode().catch(() => {}); } drawLayer(g, L, o.w, o.h, cache); }
    const [s, en] = k === 'all' ? [0, null] : k.split('-').map(Number); layers.push({ png: c.toDataURL('image/png'), start: s, end: en }); }
  onStage('Rendering your edit…');
  const r = await renderJob('/video/render', { mediaId: m.id, trim: e.trim, speed: e.speed, reverse: e.reverse, rotate: e.rotate, flip: e.flip, aspect: e.aspect === 'original' ? 'original' : e.aspect, crop: e.crop,
    filter: e.filter, strength: e.strength, adjust: e.adjust, layers: layers.map(l => ({ ...l, end: l.end == null ? undefined : l.end })), audio: e.audio, captions: e.captions, captionStyle: e.captionStyle,
    effect: e.effect || 'none', cover: e.cover, tts: e.layers.filter(L => L.type === 'text' && L.tts && L.text).slice(0, 6).map(L => ({ text: L.text, voice: L.tts, start: L.start || 0 })) }, onStage);
  return r; // { media:{id,url,width,height,duration}, poster:{id,url} }
}

// Shared colour engine for the camera, photo editor and server video renderer (identical maths everywhere):
// filter preset + adjustments → one affine colour matrix + a tone curve (+ vignette / sharpen / grain amounts).
(function (root) {
  const I = () => [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
  const mul = (A, B) => A.map(r => [0, 1, 2, 3].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j] + (j === 3 ? r[3] : 0)));
  const sat = s => [[.213 + .787 * s, .715 - .715 * s, .072 - .072 * s, 0], [.213 - .213 * s, .715 + .285 * s, .072 - .072 * s, 0], [.213 - .213 * s, .715 - .715 * s, .072 + .928 * s, 0]];
  const hue = d => { const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [[.213 + c * .787 - s * .213, .715 - c * .715 - s * .715, .072 - c * .072 + s * .928, 0], [.213 - c * .213 + s * .143, .715 + c * .285 + s * .140, .072 - c * .072 - s * .283, 0], [.213 - c * .213 - s * .787, .715 - c * .715 + s * .715, .072 + c * .928 + s * .072, 0]]; };
  const sepia = a => { const S = [[.393, .769, .189], [.349, .686, .168], [.272, .534, .131]]; return [0, 1, 2].map(i => [0, 1, 2].map(j => (1 - a) * (i === j ? 1 : 0) + a * S[i][j]).concat(0)); };
  const scale = (k, o = 0) => [[k, 0, 0, o], [0, k, 0, o], [0, 0, k, o]];
  const offs = (r, g, b) => [[1, 0, 0, r], [0, 1, 0, g], [0, 0, 1, b]];
  // Own preset names (no third-party trademarks).
  const FILTERS = [['normal', 'Normal', {}], ['noor', 'Noor', { bri: 8, con: 10, sat: 15 }], ['madinah', 'Madinah', { warm: 45, sat: 15, con: 12, hl: -10 }], ['oasis', 'Oasis', { sat: 35, con: 15, hue: -6 }],
    ['dawn', 'Dawn', { warm: 30, tint: 20, fade: 18, bri: 8 }], ['dusk', 'Dusk', { warm: 55, tint: 15, sat: -5, con: 18, vig: 40 }], ['sahara', 'Sahara', { sepia: 45, warm: 30, con: 10 }], ['silk', 'Silk', { fade: 30, sat: -15, bri: 6 }],
    ['teal', 'Teal & Gold', { hue: -14, sat: 30, con: 22, warm: 25, sh: 15 }], ['vivid', 'Vivid', { sat: 55, con: 20 }], ['cool', 'Cool', { warm: -55, sat: 10, bri: 5 }], ['retro', 'Retro', { sepia: 20, fade: 25, con: -8, vig: 30, grain: 25 }],
    ['mono', 'Mono', { gray: 100, con: 15 }], ['noir', 'Noir', { gray: 100, con: 45, bri: -5, vig: 40 }], ['moon', 'Moon', { gray: 100, bri: 10, fade: 20 }], ['night', 'Night', { bri: -10, con: 25, warm: -45, sat: -15, vig: 50 }]];
  const ADJUST = [['bri', 'Brightness', -100, 100], ['con', 'Contrast', -100, 100], ['sat', 'Saturation', -100, 100], ['warm', 'Warmth', -100, 100], ['tint', 'Tint', -100, 100],
    ['hl', 'Highlights', -100, 100], ['sh', 'Shadows', -100, 100], ['fade', 'Fade', 0, 100], ['vig', 'Vignette', 0, 100], ['sharp', 'Sharpen', 0, 100], ['grain', 'Grain', 0, 100]];
  function build(filter = 'normal', strength = 100, adj = {}) {
    const pre = (FILTERS.find(f => f[0] === filter) || FILTERS[0])[2], k = Math.max(0, Math.min(100, +strength || 0)) / 100;
    const v = n => (pre[n] || 0) * k + (+adj[n] || 0);
    let M = I(); const then = T => { M = mul(T, M); };
    if (pre.gray) then(sat(1 - pre.gray / 100 * k));
    if (pre.sepia) then(sepia(pre.sepia / 100 * k));
    if (pre.hue) then(hue(pre.hue * k));
    then(sat(Math.max(0, 1 + v('sat') / 100)));
    then(scale(Math.max(0, 1 + v('bri') / 200)));
    const c = Math.max(0, 1 + v('con') / 200); then(scale(c, .5 - .5 * c));
    const w = v('warm') / 100, t = v('tint') / 100; if (w || t) then([[1 + .16 * w + .04 * t, 0, 0, .03 * w], [0, 1 + .03 * w - .1 * t, 0, .005 * w], [0, 0, 1 - .2 * w + .04 * t, -.02 * w]]);
    const f = Math.max(0, v('fade')) / 100; if (f) then(scale(1 - .22 * f, .1 * f));
    const hl = v('hl') / 100, sh = v('sh') / 100;
    const sc = Math.max(-1, Math.min(1, v('con') / 200));
    const curve = Array.from({ length: 33 }, (_, i) => { const x = i / 32; let y = x + 1.6 * sh * x * (1 - x) * (1 - x) + 1.6 * hl * x * x * (1 - x); y += sc * .6 * (y - .5) * (1 - Math.abs(2 * y - 1)); return Math.min(1, Math.max(0, y)); });
    return { M, curve, vig: Math.max(0, v('vig')), sharp: Math.max(0, v('sharp')), grain: Math.max(0, v('grain')) };
  }
  const clip = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const curveAt = (c, x) => { const p = x * 32, i = Math.min(31, Math.floor(p)), fr = p - i; return c[i] + (c[i + 1] - c[i]) * fr; };
  function applyPixels(img, fx) { // ImageData in place
    const { M } = fx, lut = new Float32Array(256 * 4); // per-channel curve LUT on 0..1 input
    const L = new Uint8ClampedArray(1024); for (let i = 0; i < 1024; i++) L[i] = Math.round(curveAt(fx.curve, i / 1023) * 255);
    const d = img.data, m = M.flat().map(x => x);
    for (let i = 0; i < d.length; i += 4) { const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      d[i] = L[Math.round(clip(m[0] * r + m[1] * g + m[2] * b + m[3]) * 1023)];
      d[i + 1] = L[Math.round(clip(m[4] * r + m[5] * g + m[6] * b + m[7]) * 1023)];
      d[i + 2] = L[Math.round(clip(m[8] * r + m[9] * g + m[10] * b + m[11]) * 1023)]; }
    return img;
  }
  function svgFilter(fx) { const m = fx.M; return { matrix: [...m[0], ...m[1], ...m[2]].map((x, i) => i % 4 === 3 ? x : x).reduce((a, x, i) => (a.push(x), i % 4 === 2 ? a.push(0) : 0, a), []).concat([0, 0, 0, 1, 0]).map(x => +x.toFixed(5)), table: fx.curve.map(x => +x.toFixed(4)).join(' ') }; }
  // feColorMatrix wants [r g b a offset] per row → rebuild properly.
  function svgMatrix(fx) { const m = fx.M; return [m[0][0], m[0][1], m[0][2], 0, m[0][3], m[1][0], m[1][1], m[1][2], 0, m[1][3], m[2][0], m[2][1], m[2][2], 0, m[2][3], 0, 0, 0, 1, 0].map(x => +x.toFixed(5)).join(' '); }
  function cube(fx, N = 33) { const m = fx.M, out = [`LUT_3D_SIZE ${N}`];
    for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) { const r = ri / (N - 1), g = gi / (N - 1), b = bi / (N - 1);
      out.push([0, 1, 2].map(k => curveAt(fx.curve, clip(m[k][0] * r + m[k][1] * g + m[k][2] * b + m[k][3])).toFixed(5)).join(' ')); }
    return out.join('\n'); }
  const isIdentity = fx => JSON.stringify(fx.M) === JSON.stringify(I()) && fx.curve.every((x, i) => Math.abs(x - i / 32) < 1e-6) && !fx.vig && !fx.sharp && !fx.grain;
  const ASPECTS = { original: 0, '9:16': 9 / 16, '4:5': 4 / 5, '1:1': 1, '16:9': 16 / 9 };
  function outSize(sw, sh, rot, aspect, maxLong) { if ((rot / 90) % 2) [sw, sh] = [sh, sw];
    const r = ASPECTS[aspect] || sw / sh; let w, h; if (r < 1) { h = maxLong; w = h * r; } else { w = maxLong; h = w / r; }
    if (!ASPECTS[aspect] && Math.max(sw, sh) < maxLong) { const s = Math.max(sw, sh) / maxLong; w *= s; h *= s; }
    return { w: Math.max(2, Math.round(w / 2) * 2), h: Math.max(2, Math.round(h / 2) * 2), sw, sh }; }
  function cropRect(sw, sh, ow, oh, zoom = 1, px = 0, py = 0) { const s = Math.max(ow / sw, oh / sh) * Math.max(1, zoom); const dw = sw * s, dh = sh * s;
    return { s, dw, dh, x: (dw - ow) * (0.5 + Math.max(-1, Math.min(1, px)) / 2), y: (dh - oh) * (0.5 + Math.max(-1, Math.min(1, py)) / 2) }; }
  const api = { FILTERS, ADJUST, build, applyPixels, svgMatrix, cube, isIdentity, outSize, cropRect, ASPECTS };
  root.ShukrFX = api; if (typeof module === 'object' && module && module.exports) module.exports = api;
})(globalThis);

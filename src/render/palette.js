// The one fixed palette the whole game is snapped to (the same 44 colours as the MultiTest game): dusty beiges, greys, pinks, navy outlines.
// The GPU pixel pass and the sprite baker both use it, so sprites and the 3D world always match.
// 16-bit style: black for outlines, 14 hue families x 6 shades (muted), greys, skin tones, a few creams and bright accents (107 colours)
export const LOOK = typeof location !== 'undefined' ? (/[?&]look=(\w+)/.exec(location.search) || [])[1] : undefined; // previews: open the game with ?look=soft or ?look=mid
export const SOFT = LOOK === 'soft', MID = LOOK === 'mid';
const hsl = (h, s, l) => { const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join(''); };
export const PAL = ['#07080c'];
for (const [h, s] of [[2, 0.5], [18, 0.55], [32, 0.45], [45, 0.5], [62, 0.55], [95, 0.4], [125, 0.38], [160, 0.35], [195, 0.45], [215, 0.5], [235, 0.4], [265, 0.35], [300, 0.3], [340, 0.45]]) for (const l of [0.17, 0.29, 0.42, 0.56, 0.7, 0.84]) PAL.push(hsl(h, s, l));
for (let k = 1; k <= 9; k++) PAL.push(hsl(230, 0.1, k / 10));
for (const l of [0.35, 0.5, 0.62, 0.74, 0.85]) PAL.push(hsl(24, 0.5, l));
PAL.push('#fdf6e3', '#f4f1ea', '#e8e6e0', '#efe3cf', '#ffe14a', '#3cff8a', '#ff5a4a', '#4a90d9');
export const PALRGB = PAL.map((h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
// snap every pixel of a canvas to the palette (and make alpha all-or-nothing): crisp pixel-art sprites with hard edges
export function quantize(canvas) {
  const g = canvas.getContext('2d'), img = g.getImageData(0, 0, canvas.width, canvas.height), d = img.data, memo = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 110) { d[i + 3] = 0; continue; }
    const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3); let best = memo.get(key);
    if (best === undefined) { let bd = 1e9; best = 0; for (let j = 0; j < PALRGB.length; j++) { const c = PALRGB[j], dr = d[i] - c[0], dg = d[i + 1] - c[1], db = d[i + 2] - c[2], e = dr * dr * 3 + dg * dg * 4 + db * db * 2; if (e < bd) { bd = e; best = j; } } memo.set(key, best); }
    const c = PALRGB[best]; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return canvas;
}

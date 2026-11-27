// Anime-style procedural sprites, drawn with the canvas path API: ink outlines, cel shading (a darker crescent under a flat base colour),
// big glossy eyes, bright flat colours. Every sprite is baked ONCE into a small offscreen canvas (see draw.js) and then only copied.
// Unit space: 1 unit = 1 world unit, the anchor (0,0) is where the sprite touches the ground, and up is negative y.
import { rngFor, pick } from '../gen/rng.js';

const TAU = Math.PI * 2;
export const INK = '#050508';
export const rgb = (c, k = 1, a = 1) => `rgba(${Math.round(Math.min(1, c[0] * k) * 255)},${Math.round(Math.min(1, c[1] * k) * 255)},${Math.round(Math.min(1, c[2] * k) * 255)},${a})`;
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function bake(box, S, fn) { // render fn into a canvas that covers box (units) at S pixels per unit
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil((box.x1 - box.x0) * S)); c.height = Math.max(1, Math.ceil((box.y1 - box.y0) * S));
  const g = c.getContext('2d', { willReadFrequently: true }); g.translate(-box.x0 * S, -box.y0 * S); g.scale(S, S); // kept in main memory: the palette snap reads it straight back g.lineJoin = 'round'; g.lineCap = 'round';
  fn(g); return { c, ox: -box.x0 * S, oy: -box.y0 * S, S };
}
// shaded shape: darker base, lighter body shifted up-left (leaves a crescent of shade), then the ink outline
function cel(g, path, col, o = {}) {
  g.save(); g.beginPath(); path(g); g.fillStyle = rgb(col, o.shade ?? 0.72); g.fill(); g.clip();
  g.translate(o.dx ?? -0.13, o.dy ?? -0.17); g.beginPath(); path(g); g.fillStyle = rgb(col); g.fill(); g.restore();
  g.beginPath(); path(g); g.lineWidth = o.lw ?? 0.13; g.strokeStyle = o.ink ?? INK; g.stroke();
}
const ell = (cx, cy, rx, ry, rot = 0) => (g) => g.ellipse(cx, cy, rx, ry, rot, 0, TAU);
const rr = (x, y, w, h, r) => (g) => g.roundRect(x, y, w, h, r);
const poly = (...p) => (g) => { g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); };
const fillPath = (g, path, style) => { g.beginPath(); path(g); g.fillStyle = style; g.fill(); };
const line = (g, x0, y0, x1, y1, w, style) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineWidth = w; g.strokeStyle = style; g.stroke(); };

// ---------------------------------------------------------------- nature
const GREENS = [[0.3, 0.62, 0.27], [0.36, 0.66, 0.3], [0.25, 0.56, 0.32], [0.42, 0.64, 0.26]], AUTUMN = [[0.9, 0.52, 0.18], [0.92, 0.72, 0.24]], SNOW = [0.86, 0.93, 0.98];
export const TREE_BOX = { x0: -2.8, x1: 2.8, y0: -6.4, y1: 0.5 };
export function paintTree(g, v, biome) {
  const frozen = biome === 'frozen', trunk = [0.5, 0.34, 0.2];
  if (biome === 'tropical') { // palm
    const d = v % 2 ? 1 : -1;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(0.9 * d, -2.3, 0.4 * d, -4.6); g.lineWidth = 0.68; g.strokeStyle = INK; g.stroke(); g.lineWidth = 0.5; g.strokeStyle = rgb(trunk); g.stroke();
    for (let k = 1; k < 5; k++) { const t = k / 5; g.beginPath(); g.moveTo(0.9 * d * 2 * t * (1 - t) + 0.4 * d * t * t - 0.22, -4.6 * t * t - 2.3 * 2 * t * (1 - t)); g.lineTo(0.9 * d * 2 * t * (1 - t) + 0.4 * d * t * t + 0.22, -4.6 * t * t - 2.3 * 2 * t * (1 - t)); g.lineWidth = 0.07; g.strokeStyle = rgb(trunk, 0.6); g.stroke(); }
    const tx = 0.4 * d, ty = -4.6, leaf = GREENS[v % 4];
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.62, ca = Math.cos(a), sa = Math.sin(a); cel(g, (p) => { p.moveTo(tx, ty); p.quadraticCurveTo(tx + ca * 1.7, ty + sa * 1.3 - 0.6, tx + ca * 2.9, ty + sa * 1.9 + 0.7); p.quadraticCurveTo(tx + ca * 1.7, ty + sa * 1.3 + 0.1, tx, ty + 0.08); }, mixc(leaf, [0.5, 0.75, 0.3], i % 2 * 0.2)); }
    cel(g, ell(tx - 0.2, ty + 0.35, 0.22, 0.22), [0.5, 0.34, 0.12]); cel(g, ell(tx + 0.22, ty + 0.4, 0.22, 0.22), [0.55, 0.38, 0.14]);
    return;
  }
  if (frozen || v % 3 === 0) { // pine, with snow on frozen islands
    const c = frozen ? [0.3, 0.5, 0.45] : [0.18, 0.44, 0.3];
    cel(g, rr(-0.26, -1.4, 0.52, 1.4, 0.1), trunk);
    for (let k = 0; k < 3; k++) { const w = 1.9 - k * 0.45, y = -1.1 - k * 1.35; cel(g, poly(-w, y, w, y, 0, y - 2.1), mixc(c, [0.3, 0.6, 0.4], k * 0.12)); if (frozen) fillPath(g, poly(-w * 0.62, y - 0.8, w * 0.62, y - 0.8, 0, y - 2.1), rgb(SNOW)); }
    return;
  }
  const leaf = (v % 5 === 4) ? AUTUMN[v % 2] : GREENS[v % 4];
  cel(g, rr(-0.3, -2.6, 0.6, 2.6, 0.14), trunk);
  line(g, 0, -2.3, -0.8, -3.1, 0.2, rgb(trunk, 0.8)); line(g, 0, -2.2, 0.8, -3.0, 0.2, rgb(trunk, 0.8));
  for (const [cx, cy, r, k] of [[-1.15, -3.2, 1.15, 0.9], [1.2, -3.3, 1.2, 0.95], [0, -3.9, 1.7, 1], [-0.5, -5, 1.15, 1.08], [0.7, -4.8, 1.05, 1.05]]) cel(g, ell(cx, cy, r, r * 0.92), mixc(leaf, [1, 1, 1], 0), { shade: 0.62 + k * 0.1 });
  for (const [cx, cy, r] of [[-0.6, -4.5, 0.4], [0.5, -3.7, 0.3], [-1.2, -3.5, 0.25]]) fillPath(g, ell(cx, cy, r, r * 0.7), rgb(leaf, 1.28, 0.55));
}
export const BUSH_BOX = { x0: -1.8, x1: 1.8, y0: -1.8, y1: 0.4 };
export function paintBush(g, v) { const c = GREENS[v % 4]; cel(g, ell(-0.6, -0.55, 0.8, 0.65), c); cel(g, ell(0.65, -0.5, 0.75, 0.6), mixc(c, [1, 1, 1], 0.08)); cel(g, ell(0, -0.95, 0.85, 0.7), mixc(c, [1, 1, 1], 0.12)); fillPath(g, ell(-0.2, -1.2, 0.25, 0.14), rgb(c, 1.3, 0.55)); if (v % 3 === 0) for (const [x, y] of [[-0.5, -0.9], [0.4, -1.1], [0.1, -0.5]]) fillPath(g, ell(x, y, 0.1, 0.1), '#ff6f8a'); }
export const ROCK_BOX = { x0: -1.8, x1: 1.8, y0: -1.9, y1: 0.4 };
export function paintRock(g, v, biome) { const c = biome === 'volcanic' ? [0.32, 0.28, 0.3] : biome === 'frozen' ? [0.78, 0.84, 0.92] : [0.62, 0.6, 0.62], k = 0.85 + (v % 4) * 0.07; cel(g, poly(-1.2 * k, 0, -1.0 * k, -0.8 * k, -0.3, -1.4 * k, 0.5, -1.25 * k, 1.1 * k, -0.6 * k, 1.25 * k, 0), c); line(g, -0.4, -1.0 * k, 0.2, -0.5, 0.06, rgb(c, 0.6)); fillPath(g, poly(-0.5, -1.2 * k, 0.1, -1.15 * k, -0.2, -0.9 * k), rgb(c, 1.25, 0.7)); }
export const FLOWER_BOX = { x0: -0.9, x1: 0.9, y0: -1.2, y1: 0.2 };
export function paintFlower(g, v) { const cols = [[1, 0.85, 0.25], [1, 1, 1], [0.95, 0.35, 0.45], [0.7, 0.45, 0.9], [1, 0.6, 0.25]], c = cols[v % 5]; for (const [x, h] of [[-0.45, 0.7], [0, 1], [0.45, 0.6]]) { line(g, x, 0, x, -h, 0.09, rgb([0.25, 0.55, 0.25])); for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; fillPath(g, ell(x + Math.cos(a) * 0.17, -h + Math.sin(a) * 0.17, 0.12, 0.12), rgb(c)); } fillPath(g, ell(x, -h, 0.09, 0.09), '#ffd23f'); } }
export const TUFT_BOX = { x0: -0.7, x1: 0.7, y0: -1, y1: 0.2 };
export function paintTuft(g, v) { const c = GREENS[v % 4]; for (const [x, h, lean] of [[-0.35, 0.7, -0.2], [0, 1, 0], [0.35, 0.75, 0.2]]) { g.beginPath(); g.moveTo(x - 0.12, 0); g.quadraticCurveTo(x + lean * 0.3, -h * 0.5, x + lean, -h); g.quadraticCurveTo(x + lean * 0.5 + 0.05, -h * 0.4, x + 0.12, 0); g.fillStyle = rgb(c, 0.8 + (x + 0.4) * 0.3); g.fill(); } }

// ---------------------------------------------------------------- town furniture
export const CRATE_BOX = { x0: -0.9, x1: 0.9, y0: -1.5, y1: 0.2 };
export function paintCrate(g, v) { const w = [0.72, 0.52, 0.3]; cel(g, rr(-0.65, -1.15, 1.3, 1.15, 0.05), w); line(g, -0.65, -1.15, 0.65, 0, 0.07, rgb(w, 0.6)); line(g, 0.65, -1.15, -0.65, 0, 0.07, rgb(w, 0.6)); if (v % 2) cel(g, rr(-0.4, -1.65, 0.8, 0.55, 0.05), [0.8, 0.6, 0.35]); }
export function paintBarrel(g) { const w = [0.62, 0.42, 0.24]; cel(g, rr(-0.55, -1.35, 1.1, 1.35, 0.4), w); for (const y of [-1.0, -0.35]) line(g, -0.54, y, 0.54, y, 0.1, '#4a4650'); fillPath(g, ell(0, -1.33, 0.5, 0.18), rgb(w, 1.15)); g.beginPath(); g.ellipse(0, -1.33, 0.5, 0.18, 0, 0, TAU); g.lineWidth = 0.06; g.strokeStyle = INK; g.stroke(); }
export const LAMP_BOX = { x0: -0.9, x1: 0.9, y0: -4.4, y1: 0.3 };
export function paintLamp(g) { cel(g, rr(-0.13, -3.4, 0.26, 3.4, 0.06), [0.25, 0.24, 0.3]); cel(g, rr(-0.36, -4.1, 0.72, 0.8, 0.12), [1, 0.88, 0.45]); fillPath(g, ell(0, -3.7, 0.55, 0.55), 'rgba(255,230,140,0.28)'); cel(g, poly(-0.5, -4.1, 0.5, -4.1, 0, -4.4), [0.25, 0.24, 0.3]); }
export const WELL_BOX = { x0: -2, x1: 2, y0: -4, y1: 0.8 };
export function paintWell(g) { // a stone well seen from the side: brick ring with a dark mouth (no water showing, so no blue blob), posts, roof, rope and bucket
  cel(g, rr(-1.4, -1.15, 2.8, 1.15, 0.14), [0.62, 0.6, 0.6], { lw: 0.1 });
  for (const [y, off] of [[-0.88, 0], [-0.52, 0.2], [-0.17, 0]]) for (let k = -3; k <= 3; k++) line(g, k * 0.4 + off, y - 0.17, k * 0.4 + off, y + 0.17, 0.045, '#4a4a50');
  line(g, -1.3, -0.7, 1.3, -0.7, 0.045, '#4a4a50'); line(g, -1.3, -0.35, 1.3, -0.35, 0.045, '#4a4a50');
  cel(g, ell(0, -1.15, 1.35, 0.2), [0.5, 0.48, 0.5], { lw: 0.08 }); fillPath(g, ell(0, -1.15, 1.05, 0.12), '#1b2128');
  for (const s of [-1, 1]) cel(g, rr(s * 1.15 - 0.09, -3.0, 0.18, 1.95, 0.04), [0.5, 0.34, 0.2], { lw: 0.08 });
  cel(g, rr(-1.3, -3.15, 2.6, 0.22, 0.05), [0.45, 0.3, 0.18], { lw: 0.08 }); cel(g, poly(-1.75, -3.0, 1.75, -3.0, 0, -4.0), [0.72, 0.28, 0.2], { lw: 0.1 });
  line(g, 0, -2.95, 0, -1.75, 0.05, '#d9c28a'); cel(g, rr(-0.28, -1.8, 0.56, 0.45, 0.06), [0.55, 0.38, 0.2], { lw: 0.07 });
}
export const STALL_BOX = { x0: -2.1, x1: 2.1, y0: -3.6, y1: 0.4 };
// the realm whose look the baked sprites follow (set from sprites.js)
export let THEME = 'terra'; export const setArtTheme = (t) => { THEME = t || 'terra'; };
export function paintStall(g, v) {
  const vk = THEME === 'asgard', c = vk ? [[0.42, 0.3, 0.2], [0.5, 0.38, 0.26], [0.4, 0.38, 0.36], [0.5, 0.24, 0.2]][v % 4] : THEME === 'atlantis' ? [[0.2, 0.6, 0.62], [0.86, 0.68, 0.26], [0.36, 0.56, 0.78], [0.3, 0.7, 0.6]][v % 4] : THEME === 'olympus' ? [[0.94, 0.92, 0.86], [0.72, 0.3, 0.22], [0.3, 0.4, 0.62], [0.9, 0.72, 0.28]][v % 4] : [[0.88, 0.32, 0.28], [0.28, 0.52, 0.85], [0.95, 0.78, 0.28], [0.3, 0.68, 0.45]][v % 4];
  for (const s of [-1, 1]) cel(g, rr(s * 1.7 - 0.07, -3, 0.14, 3, 0.03), [0.5, 0.34, 0.2]);
  cel(g, rr(-1.8, -1.1, 3.6, 1.1, 0.08), [0.7, 0.5, 0.3]);
  for (let i = -3; i <= 2; i++) fillPath(g, vk ? ell(i * 0.5 + 0.25, -1.28, 0.26, 0.14) : ell(i * 0.5 + 0.25, -1.3, 0.2, 0.2), rgb((vk ? [[0.62, 0.66, 0.72], [0.5, 0.36, 0.24], [0.8, 0.78, 0.7]] : [[0.9, 0.3, 0.25], [0.95, 0.8, 0.25], [0.4, 0.7, 0.3]])[(i + 3) % 3])); // Asgard stalls sell fish, furs and cheese
  for (let i = 0; i < 8; i++) { const x = -2 + i * 0.5; g.beginPath(); g.moveTo(x, -3.1); g.lineTo(x + 0.5, -3.1); g.lineTo(x + 0.5, -2.2); g.arc(x + 0.25, -2.2, 0.25, 0, Math.PI); g.closePath(); g.fillStyle = i % 2 ? rgb(c) : vk ? '#cfc4a8' : '#fff'; g.fill(); g.lineWidth = 0.05; g.strokeStyle = INK; g.stroke(); }
  cel(g, poly(-2.1, -3.1, 2.1, -3.1, 1.8, -3.55, -1.8, -3.55), c);
}
export const BENCH_BOX = { x0: -1, x1: 1, y0: -1.1, y1: 0.3 };
export function paintBench(g) { cel(g, rr(-0.8, -0.65, 1.6, 0.2, 0.05), [0.6, 0.42, 0.25]); cel(g, rr(-0.8, -1, 1.6, 0.25, 0.05), [0.58, 0.4, 0.24]); for (const s of [-1, 1]) cel(g, rr(s * 0.65 - 0.06, -0.7, 0.12, 0.7, 0.03), [0.4, 0.28, 0.17]); }
// enemy health bar floating over a ship: f = 0..1 of health left
export const HP_BOX = { x0: -1.7, x1: 1.7, y0: -0.34, y1: 0.34 };
export function paintHp(g, f) { line(g, -1.45, 0, 1.45, 0, 0.62, INK); if (f > 0.02) line(g, -1.4, 0, -1.4 + 2.8 * f, 0, 0.4, f > 0.55 ? '#5ad45a' : f > 0.25 ? '#f0c030' : '#e83a3a'); }
// a raider's bar carries a skull on its left end
export const SKULL_HP_BOX = { x0: -2.9, x1: 1.7, y0: -0.75, y1: 0.75 };
export function paintSkullHp(g, f) {
  paintHp(g, f); const x = -2.15;
  fillPath(g, ell(x, -0.08, 0.6, 0.55), INK); line(g, x - 0.26, 0.42, x + 0.26, 0.42, 0.42, INK);
  fillPath(g, ell(x, -0.1, 0.48, 0.43), '#f2efe4'); line(g, x - 0.19, 0.4, x + 0.19, 0.4, 0.24, '#f2efe4'); // cranium and jaw
  for (const s of [-1, 1]) fillPath(g, ell(x + s * 0.19, -0.06, 0.15, 0.16), '#c02a22'); // red eyes
  fillPath(g, poly(x, 0.1, x - 0.08, 0.24, x + 0.08, 0.24), INK); for (const s of [-1, 0, 1]) line(g, x + s * 0.12, 0.34, x + s * 0.12, 0.5, 0.05, INK);
}
export const XMARK_BOX = { x0: -0.9, x1: 0.9, y0: -0.7, y1: 0.7 };
export function paintXMark(g) { line(g, -0.5, -0.45, 0.5, 0.45, 0.28, INK); line(g, 0.5, -0.45, -0.5, 0.45, 0.28, INK); line(g, -0.5, -0.45, 0.5, 0.45, 0.17, '#e83a3a'); line(g, 0.5, -0.45, -0.5, 0.45, 0.17, '#e83a3a'); }

// ---------------------------------------------------------------- buildings (front view with the roof seen from above, like a classic JRPG town)
const WALLS = [[0.97, 0.9, 0.76], [0.9, 0.8, 0.66], [0.98, 0.95, 0.88], [0.8, 0.86, 0.9]], ROOFS = [[0.82, 0.32, 0.26], [0.42, 0.52, 0.66], [0.78, 0.55, 0.28], [0.62, 0.34, 0.45]];
const SIGN = { smith: [0.5, 0.52, 0.6], guard: [0.25, 0.36, 0.72], merchant: [0.25, 0.68, 0.38], tavern: [0.85, 0.28, 0.22], shipwright: [0.25, 0.48, 0.88], sailor: [0.6, 0.62, 0.68], warden: [0.82, 0.92, 1] };
const WOOD = [0.72, 0.52, 0.32], DARK = [0.4, 0.28, 0.18], STONE = [0.7, 0.68, 0.68];
export const houseBox = (b) => ({ x0: -b.w / 2 - 1.1, x1: b.w / 2 + 1.1, y0: -(b.d + b.h + 3.2 + Math.min(b.w, b.d) * 0.3), y1: 0.7 });

function roofOf(g, b, biome) { // the roof, seen from above; the anchor is the front edge of the building at ground level
  const hw = b.w / 2, h = b.h, d = b.d, ov = 0.6, rise = 1.3 + Math.min(hw, d / 2) * 0.55, rc = mixc(ROOFS[b.roof % 4], [0.95, 0.97, 1], biome === 'frozen' ? 0.35 : 0);
  if (b.w >= d) {
    const yN = -h - d - ov * 0.5, yR = -h - d / 2 - rise, yS = -h + ov * 0.5;
    cel(g, poly(-hw - ov, yN, hw + ov, yN, hw + ov, yR, -hw - ov, yR), rc, { shade: 0.6 });
    cel(g, poly(-hw - ov, yR, hw + ov, yR, hw + ov, yS, -hw - ov, yS), rc, { shade: 0.8 });
    for (let k = 1; k < 5; k++) { const y = yR + (yS - yR) * (k / 5); line(g, -hw - ov + 0.2, y, hw + ov - 0.2, y, 0.05, rgb(rc, 0.7, 0.6)); }
    for (let x = -hw; x < hw; x += 1.2) line(g, x, yR + 0.1, x + 0.0, yS - 0.1, 0.035, rgb(rc, 0.78, 0.35));
    line(g, -hw - ov, yR, hw + ov, yR, 0.2, rgb(rc, 0.65));
    return yR;
  }
  const yP = -h - rise;
  cel(g, poly(-hw - ov, -h + 0.1, 0, yP, 0, yP - d, -hw - ov, -h - d), rc, { shade: 0.6 });
  cel(g, poly(hw + ov, -h + 0.1, 0, yP, 0, yP - d, hw + ov, -h - d), rc, { shade: 0.85 });
  line(g, 0, yP, 0, yP - d, 0.2, rgb(rc, 0.65));
  return yP - d / 2;
}
function windowAt(g, x, y, trim, shut) {
  cel(g, rr(x - 0.62, y - 0.62, 1.24, 1.24, 0.12), trim, { lw: 0.06 });
  const gr = g.createLinearGradient(0, y - 0.5, 0, y + 0.5); gr.addColorStop(0, '#bfe6ff'); gr.addColorStop(1, '#6fa6d8');
  fillPath(g, rr(x - 0.48, y - 0.48, 0.96, 0.96, 0.08), gr); line(g, x, y - 0.48, x, y + 0.48, 0.05, rgb(trim)); line(g, x - 0.48, y, x + 0.48, y, 0.05, rgb(trim));
  line(g, x - 0.34, y - 0.3, x - 0.08, y - 0.04, 0.08, 'rgba(255,255,255,0.7)');
  for (const s of [-1, 1]) cel(g, rr(x + s * 0.82 - 0.17, y - 0.62, 0.34, 1.24, 0.07), shut, { lw: 0.05 });
}
export function paintHouse(g, b, biome) {
  const hw = b.w / 2, h = b.h, wall = mixc(WALLS[b.roof % 4], [0.92, 0.95, 1], biome === 'frozen' ? 0.4 : 0), trim = mixc(wall, [1, 1, 1], 0.45), rr0 = rngFor(Math.round(b.x * 3 + b.z * 5), 2);
  const shut = pick(rr0, [[0.28, 0.5, 0.62], [0.65, 0.3, 0.25], [0.35, 0.58, 0.4]]);
  const ridgeY = roofOf(g, b, biome);
  if (b.w < b.d) cel(g, poly(-hw, -h, 0, -h - (1.3 + hw * 0.55), hw, -h), wall); // front gable
  cel(g, rr(-hw, -h, b.w, h, 0.06), wall);
  cel(g, rr(-hw - 0.05, -0.6, b.w + 0.1, 0.6, 0.05), STONE); // plinth
  const dh = Math.min(2.5, h * 0.7);
  cel(g, (p) => { p.moveTo(-0.65, -0.6); p.lineTo(-0.65, -dh + 0.5); p.arc(0, -dh + 0.5, 0.65, Math.PI, 0); p.lineTo(0.65, -0.6); p.closePath(); }, [0.5, 0.33, 0.2]);
  fillPath(g, ell(0.38, -1.2, 0.07, 0.07), '#ffd23f'); cel(g, rr(-0.95, -0.2, 1.9, 0.25, 0.05), STONE);
  if (hw > 2.2) for (const s of [-1, 1]) { windowAt(g, s * Math.max(1.9, hw * 0.62), -h * 0.62, trim, shut); if (rr0() < 0.5) { cel(g, rr(s * Math.max(1.9, hw * 0.62) - 0.65, -h * 0.62 + 0.62, 1.3, 0.28, 0.05), DARK, { lw: 0.05 }); for (let i = -2; i <= 2; i++) fillPath(g, ell(s * Math.max(1.9, hw * 0.62) + i * 0.25, -h * 0.62 + 0.55, 0.11, 0.11), rgb([[1, 0.4, 0.5], [1, 0.85, 0.3], [1, 1, 1]][(i + 2) % 3])); } }
  if (b.w > 5) { cel(g, rr(hw * 0.45, ridgeY - 1.2, 0.95, 1.7, 0.05), [0.62, 0.55, 0.55]); cel(g, rr(hw * 0.45 - 0.12, ridgeY - 1.4, 1.2, 0.28, 0.05), [0.5, 0.45, 0.46]); fillPath(g, ell(hw * 0.45 + 0.4, ridgeY - 2.1, 0.32, 0.26), 'rgba(255,255,255,0.7)'); fillPath(g, ell(hw * 0.45 + 0.75, ridgeY - 2.8, 0.4, 0.3), 'rgba(255,255,255,0.5)'); } // chimney with smoke
}
// shops come in three parts so the shopkeeper can stand INSIDE: back (floor, walls, shelves), counter, front (wall with a doorway, awning, roof; fades when you are inside)
export const shopBackBox = (b) => ({ x0: -b.w / 2 - 0.4, x1: b.w / 2 + 0.4, y0: -b.h - 0.5, y1: b.d + 0.4 });
export const shopMidBox = { x0: -2, x1: 2, y0: -1.8, y1: 0.4 };
export function paintShopBack(g, b, biome) {
  const hw = b.w / 2, h = b.h, d = b.d, wall = mixc(WALLS[b.roof % 4], [0.92, 0.95, 1], biome === 'frozen' ? 0.4 : 0), inner = mixc(wall, [0.4, 0.3, 0.2], 0.28);
  cel(g, rr(-hw, 0, b.w, d, 0.05), [0.78, 0.58, 0.38], { shade: 0.85, dx: -0.05, dy: -0.05 }); for (let i = 1; i < d; i++) line(g, -hw + 0.1, i, hw - 0.1, i, 0.04, 'rgba(90,55,30,0.35)');
  cel(g, rr(-hw, -h, b.w, h, 0.05), inner, { shade: 0.85 });
  for (const s of [-1, 1]) cel(g, rr(s > 0 ? hw - 0.5 : -hw, -h, 0.5, d + h, 0.05), wall, { shade: 0.75 });
  const k = b.kind, shelf = (y, goods) => { cel(g, rr(-hw + 0.8, y, b.w - 1.6, 0.18, 0.04), DARK, { lw: 0.05 }); goods.forEach((c, i) => cel(g, rr(-hw + 1 + i * ((b.w - 2) / goods.length), y - 0.5, 0.55, 0.5, 0.08), c, { lw: 0.045 })); };
  if (k === 'merchant') { shelf(-h * 0.35, [[0.88, 0.3, 0.25], [0.3, 0.7, 0.4], [0.95, 0.8, 0.3], [0.35, 0.5, 0.88], [0.9, 0.5, 0.2], [0.7, 0.4, 0.8]]); shelf(-h * 0.7, [[0.95, 0.8, 0.3], [0.88, 0.3, 0.25], [0.35, 0.5, 0.88], [0.3, 0.7, 0.4], [0.9, 0.5, 0.2]]); cel(g, rr(-hw + 0.8, d - 1.3, 0.9, 1.1, 0.35), [0.62, 0.42, 0.24]); cel(g, rr(hw - 1.7, d - 1.1, 1, 0.9, 0.3), [0.82, 0.74, 0.55]); }
  else if (k === 'tavern') { cel(g, rr(-1.2, -h * 0.95, 2.4, h * 0.95 - 0.1, 0.1), [0.55, 0.5, 0.5]); fillPath(g, ell(0, -0.55, 0.65, 0.5), '#ff9a2e'); fillPath(g, ell(0, -0.45, 0.3, 0.3), '#ffe066'); for (const s of [-1, 1]) { cel(g, ell(s * (hw * 0.5), d * 0.62, 0.95, 0.5), [0.72, 0.5, 0.3]); fillPath(g, ell(s * (hw * 0.5) + 0.1, d * 0.58, 0.14, 0.1), '#ffe9a8'); cel(g, ell(s * (hw * 0.5) - 1.3, d * 0.7, 0.3, 0.2), DARK); } cel(g, rr(hw - 1.4, -1.3, 1, 1.3, 0.35), [0.62, 0.42, 0.24]); }
  else if (k === 'shipwright') { cel(g, rr(-hw * 0.55, d * 0.35, hw * 1.1, 0.5, 0.08), DARK); cel(g, poly(-1.3, d * 0.35, 1.3, d * 0.35, 1.0, d * 0.35 - 0.5, -1.0, d * 0.35 - 0.5), [0.72, 0.5, 0.3]); line(g, 0, d * 0.35 - 0.5, 0, d * 0.35 - 1.7, 0.08, rgb(DARK)); cel(g, poly(0, d * 0.35 - 1.7, 0, d * 0.35 - 0.7, 0.9, d * 0.35 - 0.8), [0.97, 0.95, 0.86]); for (let i = 0; i < 4; i++) cel(g, rr(hw - 2.3, d - 0.9 - i * 0.2, 1.9, 0.18, 0.04), i % 2 ? WOOD : DARK, { lw: 0.04 }); for (const [x, c] of [[-hw + 1.2, [0.5, 0.5, 0.58]], [-hw + 1.9, [0.72, 0.4, 0.3]], [-hw + 2.6, [0.5, 0.5, 0.58]]]) line(g, x, -h * 0.85, x, -h * 0.4, 0.12, rgb(c)); }
  else if (k === 'sailor') { cel(g, rr(-hw + 0.7, d * 0.2, 2.6, 1.6, 0.1), [0.75, 0.35, 0.35]); cel(g, rr(-hw + 0.7, d * 0.2, 2.6, 0.5, 0.1), [0.95, 0.9, 0.8]); cel(g, ell(hw * 0.35, d * 0.45, 1.1, 0.6), WOOD); cel(g, rr(hw * 0.35 - 0.6, d * 0.45 - 0.2, 1.2, 0.4, 0.04), [0.97, 0.92, 0.75], { lw: 0.04 }); cel(g, ell(hw - 1, -h * 0.5, 0.45, 0.45), [0.3, 0.5, 0.7]); line(g, hw - 1, -h * 0.5 - 0.45, hw - 1, -h * 0.5 + 0.45, 0.05, INK); }
  else { cel(g, rr(-1.3, -h * 0.95, 2.6, h * 0.95 - 0.1, 0.1), [0.6, 0.62, 0.68]); fillPath(g, ell(0, -0.6, 0.7, 0.55), '#ff8a2e'); fillPath(g, ell(0, -0.5, 0.32, 0.3), '#ffe066'); cel(g, ell(0, d * 0.62, 1.7, 0.8), [0.96, 0.97, 1]); cel(g, ell(hw - 1.4, d * 0.45, 0.5, 0.3), WOOD); fillPath(g, poly(hw - 1.4, d * 0.45 - 0.9, hw - 1.1, d * 0.45 - 0.45, hw - 1.7, d * 0.45 - 0.45), '#7fe3ff'); }
  fillPath(g, ell(hw * 0.5, -h * 0.55, 0.28, 0.28), '#ffe58a'); fillPath(g, ell(hw * 0.5, -h * 0.55, 0.75, 0.75), 'rgba(255,230,140,0.18)'); // hanging lamp glow
}
// the town notice board: two posts, a little roof, and pinned notes
export const RUNE_BOX = { x0: -1.1, x1: 1.1, y0: -3.1, y1: 0.3 };
export function paintRune(g) { // an Asgard rune stone: a tall grey slab with a rounded top, a red serpent band carved round its face and angular runes inside
  cel(g, poly(-0.85, 0, -0.95, -1.6, -0.75, -2.55, -0.25, -2.95, 0.35, -2.9, 0.8, -2.45, 0.9, -1.5, 0.8, 0), [0.6, 0.62, 0.66], { lw: 0.1 });
  g.beginPath(); g.moveTo(-0.55, -0.35); g.lineTo(-0.65, -1.6); g.quadraticCurveTo(-0.55, -2.55, 0.05, -2.6); g.quadraticCurveTo(0.6, -2.45, 0.6, -1.5); g.lineTo(0.5, -0.35); g.lineWidth = 0.13; g.strokeStyle = '#b8342a'; g.stroke();
  fillPath(g, ell(-0.55, -0.32, 0.12, 0.09), '#b8342a');
  for (const [x, y] of [[-0.25, -2.1], [0.15, -2.05], [-0.3, -1.5], [0.1, -1.45], [-0.25, -0.9], [0.15, -0.85]]) { line(g, x, y, x, y + 0.38, 0.06, '#2a2c36'); line(g, x, y + 0.08, x + 0.17, y - 0.04 + ((x * 10) & 1) * 0.2, 0.06, '#2a2c36'); }
  fillPath(g, poly(-0.6, -2.5, -0.2, -2.8, -0.45, -2.3), rgb([0.6, 0.62, 0.66], 1.25, 0.7));
}
export const PILLAR_BOX = { x0: -0.9, x1: 0.9, y0: -4.6, y1: 0.3 };
export function paintPillar(g) { // an Atlantis crystal pillar: a fluted white marble shaft carved with waves, a gold ring, and a sea-glass crystal on top (its gold stays lit at night)
  cel(g, rr(-0.75, -0.45, 1.5, 0.45, 0.06), [0.86, 0.85, 0.8], { lw: 0.08 }); cel(g, rr(-0.5, -3.1, 1.0, 2.7, 0.05), [0.95, 0.94, 0.9], { lw: 0.08 });
  for (const x of [-0.25, 0, 0.25]) line(g, x, -3.0, x, -0.55, 0.04, 'rgba(120,130,140,0.45)');
  for (const y of [-2.4, -1.5]) { g.beginPath(); g.moveTo(-0.45, y); for (let k = 0; k < 3; k++) g.quadraticCurveTo(-0.3 + k * 0.3, y - 0.18, -0.15 + k * 0.3, y); g.lineWidth = 0.07; g.strokeStyle = '#2f8a86'; g.stroke(); }
  cel(g, rr(-0.62, -3.35, 1.24, 0.3, 0.06), [0.96, 0.78, 0.3], { lw: 0.08 });
  cel(g, poly(-0.42, -3.35, -0.3, -4.1, 0, -4.5, 0.3, -4.1, 0.42, -3.35), [0.45, 0.88, 0.85], { lw: 0.08 }); fillPath(g, poly(-0.1, -3.5, 0, -4.3, 0.12, -3.6), 'rgba(235,255,252,0.8)');
}
export const STATUE_BOX = { x0: -1.0, x1: 1.0, y0: -5.4, y1: 0.3 };
export function paintStatue(g) { // an Olympus marble statue: a robed figure on a plinth with a laurel wreath and a gold-tipped spear
  cel(g, rr(-0.85, -1.25, 1.7, 1.25, 0.05), [0.8, 0.78, 0.72], { lw: 0.08 }); line(g, -0.7, -0.62, 0.7, -0.62, 0.05, 'rgba(110,105,95,0.6)');
  cel(g, poly(-0.5, -1.25, -0.36, -3.35, 0.36, -3.35, 0.5, -1.25), [0.94, 0.92, 0.86], { lw: 0.08 });
  for (const x of [-0.2, 0.05, 0.28]) line(g, x, -3.1, x * 1.25, -1.4, 0.04, 'rgba(120,115,105,0.5)'); // folds of the robe
  line(g, 0.58, -5.1, 0.58, -1.3, 0.09, '#6e5a3a'); cel(g, poly(0.47, -5.0, 0.58, -5.35, 0.69, -5.0), [0.96, 0.78, 0.3], { lw: 0.05 });
  cel(g, poly(0.3, -3.2, 0.6, -3.5, 0.66, -3.3, 0.36, -2.9), [0.94, 0.92, 0.86], { lw: 0.06 }); // the arm holding the spear
  cel(g, ell(0, -3.72, 0.3, 0.33), [0.95, 0.93, 0.88], { lw: 0.08 });
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) fillPath(g, ell(sx * (0.24 - k * 0.04), -3.82 - k * 0.1, 0.09, 0.05, sx * 0.6), '#5d8a3a'); // laurel wreath
}
export const BOARD_BOX = { x0: -2.3, x1: 2.3, y0: -4.4, y1: 0.3 };
export function paintBoard(g) {
  for (const s of [-1, 1]) cel(g, rr(s * 1.7 - 0.12, -3.4, 0.24, 3.4, 0.04), [0.4, 0.28, 0.18], { lw: 0.08 });
  cel(g, poly(-2.25, -3.5, 2.25, -3.5, 1.9, -4.35, -1.9, -4.35), [0.55, 0.3, 0.22], { lw: 0.1 });
  cel(g, rr(-2.0, -3.4, 4.0, 2.4, 0.1), [0.45, 0.31, 0.19], { lw: 0.1 });
  cel(g, rr(-1.85, -3.25, 3.7, 2.1, 0.08), [0.62, 0.46, 0.28], { lw: 0.06, shade: 0.9 });
  for (const [x, y, w, h, c] of [[-1.6, -3.1, 1.0, 1.1, [0.95, 0.9, 0.75]], [-0.45, -3.15, 0.8, 0.9, [0.9, 0.92, 0.82]], [0.5, -3.1, 1.1, 1.2, [0.96, 0.88, 0.7]], [-1.55, -1.95, 0.9, 0.7, [0.88, 0.86, 0.78]], [-0.3, -2.1, 1.3, 0.8, [0.95, 0.92, 0.8]], [1.15, -1.95, 0.6, 0.7, [0.9, 0.8, 0.7]]]) {
    cel(g, rr(x, y, w, h, 0.04), c, { lw: 0.05 }); for (let k = 1; k < 3; k++) line(g, x + 0.12, y + (h * k) / 3.2 + 0.03, x + w - 0.12, y + (h * k) / 3.2 + 0.03, 0.04, '#6a5a44'); fillPath(g, ell(x + w / 2, y + 0.07, 0.07, 0.07), '#a8302a');
  }
}
// the cell gate: iron bars, drawn only while the gate is shut after an arrest
export const GATE_BOX = { x0: -1.1, x1: 1.1, y0: -2.9, y1: 0.2 };
export function paintGate(g) {
  cel(g, rr(-1.0, -2.8, 2.0, 0.22, 0.04), [0.3, 0.31, 0.36], { lw: 0.08 }); cel(g, rr(-1.0, -0.15, 2.0, 0.2, 0.04), [0.3, 0.31, 0.36], { lw: 0.08 });
  for (let i = 0; i < 6; i++) cel(g, rr(-0.92 + i * 0.37, -2.6, 0.13, 2.5, 0.04), [0.4, 0.42, 0.48], { lw: 0.07 });
}
// armoury and guard-station furniture: flat pixel sprites, drawn square-on like the shop counters
const IRON = [0.34, 0.36, 0.43], IRON_L = [0.55, 0.58, 0.66], BLADE = [0.82, 0.85, 0.92];
export const BAR_BOX = { x0: -0.2, x1: 0.2, y0: -2.9, y1: 0.1 };
export function paintBar(g) { cel(g, rr(-0.1, -2.7, 0.2, 2.7, 0.04), IRON, { lw: 0.07 }); cel(g, rr(-0.14, -2.85, 0.28, 0.16, 0.05), IRON_L, { lw: 0.05 }); }
export const railBox = (w) => ({ x0: -w / 2, x1: w / 2, y0: -3.1, y1: 0.2 });
export function paintRail(g, w) { cel(g, rr(-w / 2, -2.95, w, 0.2, 0.04), IRON, { lw: 0.07 }); cel(g, rr(-w / 2, -0.12, w, 0.18, 0.04), IRON, { lw: 0.07 }); } // the top rail and the sill of the cell front
export const BUNK_BOX = { x0: -1, x1: 1, y0: -1.2, y1: 0.2 };
export function paintBunk(g) { cel(g, rr(-0.95, -0.55, 1.9, 0.5, 0.06), WOOD); cel(g, rr(-0.9, -0.82, 1.8, 0.34, 0.12), [0.62, 0.62, 0.56]); cel(g, rr(-0.9, -0.95, 0.6, 0.3, 0.12), [0.9, 0.88, 0.8]); for (const x of [-0.85, 0.85]) cel(g, rr(x - 0.06, -0.1, 0.12, 0.3, 0.02), DARK, { lw: 0.04 }); }
export const DESK_BOX = { x0: -1.2, x1: 1.2, y0: -1.5, y1: 0.2 };
export function paintDesk(g) { cel(g, rr(-1.1, -1.0, 2.2, 0.2, 0.05), [0.7, 0.5, 0.3]); cel(g, rr(-1.0, -0.8, 2.0, 0.8, 0.05), WOOD); cel(g, rr(-0.5, -1.4, 0.5, 0.4, 0.04), [0.95, 0.9, 0.75], { lw: 0.05 }); fillPath(g, ell(0.55, -1.15, 0.12, 0.12), '#a8302a'); line(g, -0.4, -1.28, -0.1, -1.28, 0.04, '#6a5a44'); line(g, -0.4, -1.16, -0.15, -1.16, 0.04, '#6a5a44'); }
export const KEYS_BOX = { x0: -0.8, x1: 0.8, y0: -1.9, y1: 0.1 };
export function paintKeys(g) { cel(g, rr(-0.7, -1.7, 1.4, 1.4, 0.08), WOOD); for (let i = 0; i < 4; i++) { const x = -0.45 + i * 0.3; line(g, x, -1.45, x, -1.12, 0.05, '#e3b73e'); fillPath(g, ell(x, -1.0, 0.1, 0.1), '#e3b73e'); } }
export const NOTICES_BOX = { x0: -1, x1: 1, y0: -2.2, y1: 0.1 };
export function paintNotices(g) { for (const [x, y, c] of [[-0.85, -2.0, [0.95, 0.9, 0.75]], [0.05, -1.9, [0.9, 0.85, 0.68]]]) { cel(g, rr(x, y, 0.8, 1.0, 0.04), c, { lw: 0.05 }); for (let k = 0; k < 3; k++) line(g, x + 0.12, y + 0.34 + k * 0.2, x + 0.68, y + 0.34 + k * 0.2, 0.04, '#6a5a44'); fillPath(g, ell(x + 0.4, y + 0.14, 0.08, 0.08), '#a8302a'); } }
export const RACK_BOX = { x0: -1.6, x1: 1.6, y0: -2.6, y1: 0.2 };
export function paintRack(g) {
  for (const s of [-1, 1]) cel(g, rr(s * 1.4 - 0.08, -2.4, 0.16, 2.4, 0.03), DARK, { lw: 0.06 });
  for (const y of [-2.0, -1.0]) cel(g, rr(-1.5, y, 3.0, 0.14, 0.04), WOOD, { lw: 0.05 });
  for (let i = 0; i < 5; i++) { const x = -1.2 + i * 0.6; if (i % 2) { line(g, x, -2.3, x, -1.15, 0.1, rgb(BLADE)); cel(g, rr(x - 0.22, -1.15, 0.44, 0.1, 0.03), [0.9, 0.72, 0.25], { lw: 0.04 }); } else { line(g, x, -2.2, x, -0.6, 0.07, '#6b4326'); cel(g, poly(x, -2.3, x + 0.4, -2.1, x + 0.38, -1.7, x, -1.8), IRON_L, { lw: 0.05 }); } }
}
export const ANVIL_BOX = { x0: -0.8, x1: 0.8, y0: -1.2, y1: 0.2 };
export function paintAnvil(g) { cel(g, rr(-0.35, -0.45, 0.7, 0.45, 0.05), WOOD); cel(g, poly(-0.75, -1.0, 0.7, -1.0, 0.5, -0.8, 0.28, -0.72, 0.4, -0.45, -0.4, -0.45, -0.28, -0.72, -0.5, -0.8), IRON, { lw: 0.07 }); cel(g, rr(-0.75, -1.05, 1.4, 0.14, 0.04), IRON_L, { lw: 0.05 }); }
export const FORGE_BOX = { x0: -1, x1: 1, y0: -2.2, y1: 0.2 };
export function paintForge(g) { cel(g, rr(-0.9, -2.0, 1.8, 2.0, 0.08), [0.5, 0.48, 0.46]); cel(g, rr(-0.55, -0.95, 1.1, 0.95, 0.12), [0.2, 0.18, 0.18], { lw: 0.06 }); fillPath(g, ell(0, -0.35, 0.4, 0.28), '#ff8a2e'); fillPath(g, ell(0, -0.3, 0.22, 0.17), '#ffe066'); cel(g, rr(-0.35, -2.25, 0.7, 0.3, 0.05), [0.4, 0.38, 0.36], { lw: 0.05 }); }
// the mead hall: a long stone-ringed hearth with a fire and a spit, and a long feast table with meat, bread and drinking horns
export const HEARTH_BOX = { x0: -1.8, x1: 1.8, y0: -2.2, y1: 0.2 };
export function paintHearth(g) {
  cel(g, rr(-1.7, -0.55, 3.4, 0.55, 0.1), [0.5, 0.48, 0.46]); for (let i = 0; i < 6; i++) fillPath(g, ell(-1.45 + i * 0.58, -0.5, 0.22, 0.12), rgb([0.6, 0.58, 0.55]));
  for (const [x, h] of [[-0.9, 0.9], [-0.3, 1.25], [0.35, 1.05], [0.95, 0.8]]) { fillPath(g, poly(x - 0.32, -0.5, x, -0.5 - h, x + 0.32, -0.5), '#ff8a2e'); fillPath(g, poly(x - 0.16, -0.5, x, -0.5 - h * 0.55, x + 0.16, -0.5), '#ffe066'); }
  for (const s of [-1, 1]) line(g, s * 1.35, -0.5, s * 1.35, -1.9, 0.09, '#2a1c10'); line(g, -1.5, -1.85, 1.5, -1.85, 0.07, '#2a1c10'); fillPath(g, ell(0.1, -1.75, 0.5, 0.24), '#8a4a26');
}
export const FEAST_BOX = { x0: -1.9, x1: 1.9, y0: -1.6, y1: 0.2 };
export function paintFeast(g, v) {
  cel(g, rr(-1.8, -1.05, 3.6, 0.22, 0.05), [0.62, 0.44, 0.26]); for (const x of [-1.55, 1.55]) cel(g, rr(x - 0.08, -0.85, 0.16, 0.85, 0.03), [0.4, 0.28, 0.17]);
  cel(g, rr(-1.6, -0.42, 3.2, 0.16, 0.04), [0.55, 0.38, 0.22]); // the bench in front
  fillPath(g, ell(v ? 0.7 : -0.6, -1.22, 0.42, 0.2), '#9a5a2e'); fillPath(g, ell(v ? -0.5 : 0.6, -1.17, 0.26, 0.14), '#d8b070'); // a roast and a loaf
  for (const x of v ? [-1.3, 0.1, 1.4] : [-1.35, 0, 1.35]) cel(g, poly(x - 0.12, -1.05, x + 0.12, -1.05, x + 0.2, -1.45, x - 0.02, -1.35), [0.92, 0.88, 0.76], { lw: 0.04 }); // drinking horns
}
// battle effects: a muzzle/impact flash, a puff of smoke and a splash (drawn as flat pixel sprites, scaled and moved by the game)
export const FX_BOX = { x0: -1.2, x1: 1.2, y0: -1.2, y1: 1.2 };
export function paintFlash(g) {
  const pts = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, r = i % 2 ? 0.45 : 1.1; pts.push(Math.cos(a) * r, Math.sin(a) * r); }
  cel(g, poly(...pts), [1, 0.62, 0.15], { lw: 0.08 }); fillPath(g, poly(...pts.map((v) => v * 0.55)), '#ffe066'); fillPath(g, ell(0, 0, 0.28, 0.28), '#fffbe0');
}
export function paintHurt(g) { for (const [x, y, r] of [[-0.5, 0.2, 0.28], [0.3, -0.3, 0.34], [0.55, 0.4, 0.22], [-0.1, 0.5, 0.2], [-0.4, -0.5, 0.24]]) cel(g, ell(x, y, r, r, 0), [0.78, 0.1, 0.12], { lw: 0.06, shade: 0.7 }); }
export function paintSmoke(g) { for (const [x, y, r] of [[-0.45, 0.2, 0.55], [0.4, 0.25, 0.5], [0, -0.3, 0.65]]) cel(g, ell(x, y, r, r * 0.9), [0.62, 0.64, 0.7], { lw: 0.09 }); }
export function paintSplash(g) { // round drops flung up and out
  for (const [x, y, r] of [[-0.75, 0.35, 0.2], [-0.4, -0.1, 0.27], [0, -0.5, 0.31], [0.42, -0.12, 0.26], [0.78, 0.3, 0.2], [-0.15, 0.45, 0.24], [0.28, 0.5, 0.2], [-0.62, -0.55, 0.12], [0.6, -0.6, 0.13], [0.05, -0.98, 0.11], [-0.95, -0.15, 0.09], [0.98, -0.2, 0.09]]) {
    fillPath(g, ell(x, y, r, r), 'rgba(196,226,250,1)'); fillPath(g, ell(x - r * 0.25, y - r * 0.28, r * 0.55, r * 0.55), '#f6fbff');
  }
}
// a signpost outside every shop: a board on a post with the trade's picture (bag = shop, mug = tavern, ship = shipwright, anchor = sailor, snowflake = warden)
export const SIGN_BOX = { x0: -1.6, x1: 1.6, y0: -4.1, y1: 0.3 };
export function paintSign(g, kind) {
  cel(g, rr(-0.1, -2.5, 0.2, 2.5, 0.04), [0.4, 0.28, 0.18], { lw: 0.08 });
  cel(g, rr(-1.45, -4.0, 2.9, 1.7, 0.14), [0.45, 0.31, 0.19], { lw: 0.1 });
  cel(g, rr(-1.28, -3.84, 2.56, 1.38, 0.1), [0.93, 0.86, 0.68], { lw: 0.07, shade: 0.9 });
  const cx = 0, cy = -3.15, ink = '#1a1410';
  if (kind === 'merchant') { // a money bag
    cel(g, ell(cx, cy + 0.17, 0.5, 0.45), [0.62, 0.45, 0.25], { lw: 0.08 }); cel(g, poly(cx - 0.2, cy - 0.15, cx + 0.2, cy - 0.15, cx + 0.32, cy - 0.42, cx - 0.32, cy - 0.42), [0.62, 0.45, 0.25], { lw: 0.07 });
    line(g, cx - 0.22, cy - 0.15, cx + 0.22, cy - 0.15, 0.09, '#a8302a'); fillPath(g, ell(cx, cy + 0.2, 0.17, 0.17), '#e8c24a'); line(g, cx, cy + 0.08, cx, cy + 0.32, 0.05, '#7a5a1a');
  } else if (kind === 'tavern') { // a foaming mug
    cel(g, rr(cx - 0.42, cy - 0.28, 0.66, 0.78, 0.08), [0.8, 0.52, 0.18], { lw: 0.08 }); g.beginPath(); g.arc(cx + 0.3, cy + 0.12, 0.2, -1.4, 1.4); g.lineWidth = 0.14; g.strokeStyle = ink; g.stroke(); g.lineWidth = 0.07; g.strokeStyle = '#c9a050'; g.stroke();
    cel(g, ell(cx - 0.3, cy - 0.3, 0.2, 0.15), [0.98, 0.97, 0.9], { lw: 0.06 }); cel(g, ell(cx - 0.05, cy - 0.36, 0.22, 0.17), [0.98, 0.97, 0.9], { lw: 0.06 }); cel(g, ell(cx + 0.15, cy - 0.3, 0.17, 0.14), [0.98, 0.97, 0.9], { lw: 0.06 });
  } else if (kind === 'shipwright') { // a sailing ship
    cel(g, poly(cx - 0.62, cy + 0.2, cx + 0.62, cy + 0.2, cx + 0.42, cy + 0.48, cx - 0.42, cy + 0.48), [0.5, 0.33, 0.2], { lw: 0.08 });
    line(g, cx, cy + 0.2, cx, cy - 0.58, 0.07, ink); cel(g, poly(cx + 0.06, cy - 0.5, cx + 0.06, cy + 0.12, cx + 0.5, cy + 0.12), [0.97, 0.95, 0.88], { lw: 0.06 }); cel(g, poly(cx - 0.06, cy - 0.36, cx - 0.06, cy + 0.12, cx - 0.44, cy + 0.12), [0.9, 0.86, 0.76], { lw: 0.06 });
    g.beginPath(); g.moveTo(cx - 0.7, cy + 0.6); g.quadraticCurveTo(cx - 0.35, cy + 0.5, cx, cy + 0.6); g.quadraticCurveTo(cx + 0.35, cy + 0.7, cx + 0.7, cy + 0.6); g.lineWidth = 0.08; g.strokeStyle = '#3f6a8a'; g.stroke();
  } else if (kind === 'sailor') { // an anchor
    g.lineCap = 'round'; line(g, cx, cy - 0.4, cx, cy + 0.38, 0.17, ink); line(g, cx - 0.26, cy - 0.2, cx + 0.26, cy - 0.2, 0.15, ink); g.beginPath(); g.arc(cx, cy + 0.12, 0.5, 0.15 * Math.PI, 0.85 * Math.PI); g.lineWidth = 0.17; g.strokeStyle = ink; g.stroke();
    g.beginPath(); g.arc(cx, cy - 0.5, 0.1, 0, 7); g.lineWidth = 0.1; g.stroke(); line(g, cx, cy - 0.4, cx, cy + 0.38, 0.08, '#4a6a8a'); line(g, cx - 0.26, cy - 0.2, cx + 0.26, cy - 0.2, 0.07, '#4a6a8a');
  } else if (kind === 'smith') { // an anvil with a hammer
    cel(g, poly(cx - 0.55, cy - 0.1, cx + 0.5, cy - 0.1, cx + 0.3, cy + 0.1, cx + 0.2, cy + 0.15, cx + 0.3, cy + 0.45, cx - 0.35, cy + 0.45, cx - 0.2, cy + 0.15, cx - 0.3, cy + 0.1), [0.42, 0.44, 0.5], { lw: 0.08 });
    line(g, cx - 0.1, cy - 0.5, cx + 0.3, cy - 0.12, 0.09, '#6b4326'); cel(g, rr(cx - 0.3, cy - 0.62, 0.34, 0.22, 0.04), [0.6, 0.62, 0.7], { lw: 0.06 });
  } else if (kind === 'guard') { // a shield with a cross
    cel(g, poly(cx - 0.5, cy - 0.5, cx + 0.5, cy - 0.5, cx + 0.5, cy + 0.05, cx, cy + 0.6, cx - 0.5, cy + 0.05), [0.25, 0.36, 0.72], { lw: 0.09 });
    line(g, cx, cy - 0.42, cx, cy + 0.38, 0.12, '#f0d060'); line(g, cx - 0.38, cy - 0.12, cx + 0.38, cy - 0.12, 0.12, '#f0d060');
  } else { // a snowflake (the warden)
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI; line(g, cx - Math.cos(a) * 0.5, cy - Math.sin(a) * 0.5, cx + Math.cos(a) * 0.5, cy + Math.sin(a) * 0.5, 0.13, ink); line(g, cx - Math.cos(a) * 0.5, cy - Math.sin(a) * 0.5, cx + Math.cos(a) * 0.5, cy + Math.sin(a) * 0.5, 0.06, '#5fb0d8'); }
  }
}
export const SHELF_BOX = { x0: -3.4, x1: 3.4, y0: -2.9, y1: 0.3 };
export function paintShelf(g, kind) {
  const goods = { smith: [[0.7, 0.72, 0.8], [0.55, 0.57, 0.64], [0.45, 0.3, 0.2], [0.8, 0.82, 0.9]], guard: [[0.9, 0.85, 0.7]], merchant: [[0.9, 0.3, 0.25], [0.95, 0.8, 0.3], [0.4, 0.7, 0.3], [0.35, 0.5, 0.88], [0.9, 0.5, 0.2]], tavern: [[0.95, 0.8, 0.4], [0.62, 0.42, 0.24], [0.85, 0.3, 0.28], [0.97, 0.9, 0.7]], shipwright: [[0.6, 0.6, 0.65], [0.55, 0.4, 0.25], [0.72, 0.4, 0.3], [0.5, 0.5, 0.58]], sailor: [[0.97, 0.92, 0.75], [0.6, 0.6, 0.65], [0.3, 0.5, 0.7]], warden: [[0.5, 0.9, 1], [0.92, 0.95, 1], [0.6, 0.6, 0.7]] }[kind] || [[0.7, 0.5, 0.3]];
  for (const s of [-1, 1]) cel(g, rr(s * 3 - 0.1, -2.5, 0.2, 2.5, 0.04), DARK, { lw: 0.05 });
  for (const y of [-0.85, -1.7]) { cel(g, rr(-3.2, y, 6.4, 0.2, 0.05), WOOD, { lw: 0.05 }); goods.forEach((c, i) => { const x = -2.7 + i * (5.4 / Math.max(1, goods.length - 1)); cel(g, rr(x - 0.3, y - 0.62, 0.6, 0.62, 0.1), c, { lw: 0.045 }); }); }
}
export function paintShopCounter(g, b) { const hw = 1.6; cel(g, rr(-hw, -0.95, hw * 2, 0.95, 0.07), WOOD); cel(g, rr(-hw - 0.1, -1.1, hw * 2 + 0.2, 0.2, 0.06), [0.82, 0.62, 0.4]); const gs = { smith: [[0.7, 0.72, 0.8], [0.45, 0.3, 0.2], [0.55, 0.57, 0.64]], guard: [[0.9, 0.85, 0.7]], merchant: [[0.9, 0.3, 0.25], [0.95, 0.8, 0.3], [0.4, 0.7, 0.3]], tavern: [[0.95, 0.8, 0.4], [0.97, 0.9, 0.7]], shipwright: [[0.6, 0.6, 0.65], [0.55, 0.4, 0.25]], sailor: [[0.97, 0.92, 0.75]], warden: [[0.5, 0.9, 1]] }[b.kind] || []; gs.forEach((c, i) => cel(g, ell(-0.9 + i * 0.7, -1.28, 0.2, 0.18), c, { lw: 0.045 })); }
export function paintShopFront(g, b, biome) {
  const hw = b.w / 2, h = b.h, wall = mixc(WALLS[b.roof % 4], [0.92, 0.95, 1], biome === 'frozen' ? 0.4 : 0), trim = mixc(wall, [1, 1, 1], 0.45), sc = SIGN[b.kind] || [0.5, 0.5, 0.5], shut = mixc(sc, [0.3, 0.3, 0.3], 0.3);
  roofOf(g, b, biome);
  cel(g, rr(-hw, -h, hw - 1.3, h, 0.05), wall); cel(g, rr(1.3, -h, hw - 1.3, h, 0.05), wall); cel(g, rr(-1.3, -h, 2.6, h - 2.6, 0.05), wall); // wall around a 2.6-wide doorway
  cel(g, rr(-hw - 0.05, -0.6, hw - 1.25, 0.6, 0.05), STONE); cel(g, rr(1.3, -0.6, hw - 1.25, 0.6, 0.05), STONE);
  for (const x of [-hw * 0.62 - 0.4, hw * 0.62 + 0.4]) if (hw > 3) windowAt(g, x, -h * 0.55, trim, shut);
  cel(g, rr(-1.4, -2.65, 0.14, 2.65, 0.03), DARK, { lw: 0.04 }); cel(g, rr(1.26, -2.65, 0.14, 2.65, 0.03), DARK, { lw: 0.04 }); cel(g, rr(-1.45, -2.78, 2.9, 0.2, 0.05), DARK, { lw: 0.045 }); // door frame
  for (let i = 0; i < 8; i++) { const x = -2 + i * 0.5; g.beginPath(); g.moveTo(x, -2.65); g.lineTo(x + 0.5, -2.65); g.lineTo(x + 0.55, -1.9); g.arc(x + 0.275, -1.9, 0.275, 0, Math.PI); g.lineTo(x - 0.05, -1.9); g.closePath(); g.fillStyle = i % 2 ? rgb(sc) : '#fff'; g.fill(); g.lineWidth = 0.05; g.strokeStyle = INK; g.stroke(); } // striped awning
  cel(g, rr(-1.7, -h + 0.15, 3.4, 0.85, 0.12), sc); cel(g, rr(-1.55, -h + 0.28, 3.1, 0.6, 0.1), mixc(sc, [1, 1, 1], 0.45), { lw: 0.04 }); // sign board
  const ic = { merchant: () => { fillPath(g, ell(0, -h + 0.58, 0.2, 0.2), '#ffd23f'); }, tavern: () => { cel(g, rr(-0.13, -h + 0.42, 0.26, 0.34, 0.06), [1, 0.9, 0.5], { lw: 0.04 }); }, shipwright: () => { line(g, 0, -h + 0.38, 0, -h + 0.8, 0.07, INK); g.beginPath(); g.arc(0, -h + 0.55, 0.18, 0, Math.PI); g.lineWidth = 0.07; g.strokeStyle = INK; g.stroke(); }, sailor: () => { fillPath(g, ell(0, -h + 0.58, 0.2, 0.2), '#fff'); }, warden: () => { fillPath(g, poly(0, -h + 0.35, 0.18, -h + 0.58, 0, -h + 0.8, -0.18, -h + 0.58), '#7fe3ff'); } }[b.kind]; if (ic) ic();
  cel(g, ell(-hw - 0.2, -h * 0.55, 0.25, 0.3), [1, 0.85, 0.4]); cel(g, ell(hw + 0.2, -h * 0.55, 0.25, 0.3), [1, 0.85, 0.4]); // lanterns
}

// ---------------------------------------------------------------- people: big glossy eyes, hair with highlights, chibi proportions
// People: grounded fantasy-RPG figures (about seven heads tall, small plain faces, weathered skin, muted worn cloth, leather belts, boots, trade gear).
const SKIN = [[0.92, 0.77, 0.64], [0.8, 0.6, 0.45], [0.62, 0.44, 0.32], [0.44, 0.3, 0.22]];
const HAIRC = [[0.12, 0.1, 0.1], [0.3, 0.2, 0.12], [0.5, 0.34, 0.18], [0.62, 0.6, 0.6], [0.45, 0.2, 0.12], [0.7, 0.55, 0.3]];
const LEATHER = [0.36, 0.24, 0.15];
const CLOTH = { smith: [[0.34, 0.3, 0.28], [0.3, 0.27, 0.3]], guard: [[0.22, 0.32, 0.58], [0.2, 0.3, 0.52]], merchant: [[0.22, 0.38, 0.3], [0.45, 0.3, 0.2]], tavern: [[0.5, 0.22, 0.2], [0.42, 0.3, 0.2]], shipwright: [[0.3, 0.4, 0.5], [0.38, 0.38, 0.34]], sailor: [[0.2, 0.28, 0.42], [0.25, 0.32, 0.4]], warden: [[0.7, 0.74, 0.8], [0.6, 0.66, 0.74]], miner: [[0.4, 0.34, 0.28], [0.32, 0.3, 0.3], [0.44, 0.3, 0.2]], smuggler: [[0.86, 0.82, 0.72], [0.5, 0.2, 0.18], [0.3, 0.36, 0.3]], priest: [[0.92, 0.88, 0.78], [0.86, 0.82, 0.7]],
  villager: [[0.45, 0.32, 0.22], [0.36, 0.42, 0.26], [0.55, 0.28, 0.2], [0.3, 0.36, 0.44], [0.6, 0.5, 0.28], [0.42, 0.3, 0.4]], player: [[0.26, 0.34, 0.5]] };
// Asgardians: fair or red hair, thick beards, braids, fur collars, round shields, iron helmets for fighters
const V_SKIN = [[0.95, 0.82, 0.72], [0.9, 0.74, 0.62], [0.84, 0.66, 0.52]], V_HAIR = [[0.82, 0.66, 0.34], [0.7, 0.5, 0.22], [0.62, 0.22, 0.1], [0.3, 0.2, 0.12], [0.88, 0.78, 0.5], [0.2, 0.16, 0.12]];
const V_CLOTH = [[0.5, 0.18, 0.15], [0.2, 0.32, 0.5], [0.36, 0.3, 0.2], [0.3, 0.4, 0.28], [0.5, 0.4, 0.22], [0.28, 0.24, 0.3]], V_SHIELD = [[0.7, 0.18, 0.15], [0.9, 0.75, 0.25], [0.2, 0.35, 0.6], [0.86, 0.84, 0.78], [0.15, 0.4, 0.25]];
const O_CLOTH = [[0.95, 0.93, 0.86], [0.92, 0.88, 0.78], [0.7, 0.28, 0.22], [0.3, 0.38, 0.6]], O_TRIM = ['#b83a2a', '#d8b040', '#2f4f8a'];
const A_CLOTH = [[0.94, 0.93, 0.88], [0.3, 0.62, 0.6], [0.36, 0.56, 0.78], [0.92, 0.88, 0.76]];
export function personSpec(kind, seed, theme = 'terra') {
  const r = rngFor(seed, kind.length * 17 + 3), P = { kind, skin: pick(r, SKIN), hair: pick(r, HAIRC), eye: [0.14, 0.12, 0.12], style: (r() * 4) | 0, cloth: pick(r, CLOTH[kind] || CLOTH.villager), pants: pick(r, [[0.26, 0.26, 0.3], [0.34, 0.28, 0.2], [0.24, 0.3, 0.32]]), extra: (r() * 4) | 0 };
  if (theme === 'asgard' && kind !== 'player') { const q = rngFor(seed, kind.length * 29 + 11); P.vik = true; P.skin = pick(q, V_SKIN); P.hair = pick(q, V_HAIR); P.cloth = kind === 'guard' || kind === 'warden' ? P.cloth : pick(q, V_CLOTH); P.extra = q() < 0.78 ? 0 : 3; P.shield = pick(q, V_SHIELD); P.hasShield = kind === 'guard' || kind === 'warden' || q() < 0.3; P.helm = kind === 'guard' || kind === 'warden' || (kind === 'villager' && q() < 0.15); P.horns = kind === 'guard' || (P.helm && q() < 0.35); P.braids = q() < 0.6; }
  if (theme === 'atlantis' && kind !== 'player') { const q = rngFor(seed, kind.length * 31 + 5); P.atl = true; P.skin = SKIN[(q() * 3) | 0]; P.hair = HAIRC[[0, 1, 4][(q() * 3) | 0]]; if (kind !== 'guard' && kind !== 'warden') P.cloth = pick(q, A_CLOTH); P.pants = [0.86, 0.84, 0.78]; } // Atlanteans: white, sea-green and sky-blue robes, a gold circlet and belt
  if (theme === 'olympus' && kind !== 'player') { const q = rngFor(seed, kind.length * 37 + 9); P.oly = true; P.skin = SKIN[1 + ((q() * 2) | 0)]; P.hair = HAIRC[[0, 1, 2][(q() * 3) | 0]]; if (kind !== 'guard' && kind !== 'warden') P.cloth = pick(q, O_CLOTH); P.trim = pick(q, O_TRIM); P.pants = P.cloth; P.laurel = kind !== 'guard' && q() < 0.4; } // Olympians: a chiton with a coloured hem, sandals, some with a laurel wreath
  if (kind === 'child') { P.hair = P.vik ? V_HAIR[seed % 3] : HAIRC[1 + (seed % 2)]; P.extra = 3; P.helm = P.horns = P.hasShield = false; }
  if (kind === 'player') { P.skin = SKIN[1]; P.hair = HAIRC[1]; P.style = 0; P.extra = 3; P.pants = [0.22, 0.24, 0.3]; }
  return P;
}
export const FALLEN_BOX = { x0: -0.4, x1: 3.6, y0: -1.4, y1: 0.4 }; // a person lying on the ground: the standing sprite turned 90 degrees about the feet
export const PERSON_BOX = { x0: -1.2, x1: 1.2, y0: -3.1, y1: 0.35 };
export function paintPerson(g, P, dir, fr) {
  const step = fr === 1 ? 0.17 : fr === 2 ? -0.17 : 0, bob = fr ? -0.05 : 0, front = dir === 'down', back = dir === 'up', K = P.kind;
  g.save(); if (dir === 'left') g.scale(-1, 1); g.translate(0, bob);
  const sk = P.skin, hair = P.hair, cl = P.cloth, dark = (c, t = 0.3) => mixc(c, [0, 0, 0], t), hy = -2.55, bearded = P.extra < 2 && K !== 'player' && K !== 'warden';
  // legs and boots
  for (const s of [-1, 1]) { const o = s * step, lx = front || back ? s * 0.25 : -s * step * 1.6; cel(g, rr(lx - 0.2, -1.05, 0.4, 0.86 + o * 0.3, 0.12), P.pants, { lw: 0.08 }); cel(g, rr(lx - 0.23 + (front || back ? 0 : 0.06), -0.34 + o * 0.3, 0.46, 0.34, 0.1), LEATHER, { lw: 0.08 }); }
  if (K === 'warden' || K === 'merchant' || K === 'smuggler' || K === 'priest') cel(g, poly(-0.62, -1.95, 0.62, -1.95, 0.78, -0.3, -0.78, -0.3), K === 'smuggler' ? [0.2, 0.2, 0.24] : K === 'priest' ? cl : dark(cl, 0.2), { lw: 0.08 }); // long coat / robe skirt behind the arms
  const wide = front || back, atk = fr >= 3 && front; // frames 3 and 4 are the attack: wind-up, then the blow
  // arms (behind the torso on the side view)
  const arm = (x, o) => { cel(g, rr(x - 0.13, -1.9, 0.26, 0.95 + o * 0.25, 0.1), dark(cl, 0.12), { lw: 0.07 }); fillPath(g, ell(x, -0.92 + o * 0.25, 0.13, 0.13), rgb(sk)); };
  if (!wide) arm(0.0 - step * 0.8, -step * 0.5);
  // torso: tunic with a belt
  cel(g, rr(wide ? -0.52 : -0.4, -2.0, wide ? 1.04 : 0.8, 1.05, 0.16), cl, { lw: 0.08 });
  line(g, wide ? -0.5 : -0.38, -1.2, wide ? 0.5 : 0.38, -1.2, 0.1, rgb(LEATHER)); if (front) cel(g, rr(-0.09, -1.28, 0.18, 0.16, 0.03), [0.8, 0.68, 0.3], { lw: 0.04 });
  if (wide) { arm(-0.67, step * 0.6); if (!atk) arm(0.67, -step * 0.6); }
  // trade gear on the body
  if (K === 'tavern' && !back) cel(g, rr(-0.4, -1.5, 0.8, 1.1, 0.06), [0.9, 0.88, 0.8], { lw: 0.06 });
  else if (K === 'shipwright' && !back) cel(g, rr(-0.4, -1.55, 0.8, 1.15, 0.05), [0.5, 0.35, 0.2], { lw: 0.06 });
  else if (K === 'sailor') for (let y = -1.85; y < -1.25; y += 0.2) line(g, wide ? -0.48 : -0.36, y, wide ? 0.48 : 0.36, y, 0.06, '#e8e6e0');
  else if (K === 'merchant' && front) { cel(g, ell(0.38, -1.05, 0.17, 0.2), [0.5, 0.36, 0.2], { lw: 0.05 }); }
  else if (K === 'smith' && !back) cel(g, rr(-0.42, -1.65, 0.84, 1.25, 0.06), [0.42, 0.28, 0.18], { lw: 0.06 }); // a leather apron
  else if (K === 'priest') { line(g, wide ? -0.46 : -0.34, -1.25, wide ? 0.46 : 0.34, -1.25, 0.08, '#b89a5a'); if (front) for (const s of [-1, 1]) line(g, s * 0.16, -1.95, s * 0.16, -0.5, 0.11, '#c0402e'); } // a rope belt, a red stole
  else if (K === 'smuggler') { line(g, wide ? -0.5 : -0.38, -1.27, wide ? 0.5 : 0.38, -1.27, 0.16, '#9c3028'); if (!back) for (const s of [-1, 1]) line(g, s * (wide ? 0.5 : 0.38), -1.95, s * (wide ? 0.3 : 0.2), -1.3, 0.1, rgb([0.2, 0.2, 0.24])); } // a red sash, the open coat's lapels
  else if (K === 'miner') { line(g, -0.4, -1.95, 0.4, -1.25, 0.09, rgb(LEATHER)); if (front) fillPath(g, ell(0.18, -1.55, 0.12, 0.08), 'rgba(20,18,20,0.45)'); } // a strap across the chest, soot
  else if (K === 'guard') { cel(g, rr(-0.42, -1.9, 0.84, 0.9, 0.1), [0.6, 0.63, 0.7], { lw: 0.07 }); line(g, 0, -1.9, 0, -1.0, 0.07, rgb([0.9, 0.78, 0.3])); } // a breastplate
  else if (K === 'warden') { cel(g, ell(0, -1.98, 0.74, 0.3), [0.9, 0.92, 0.95], { lw: 0.07 }); } // fur mantle over the shoulders
  else if (K === 'player') { if (!front) cel(g, rr(-0.46, -1.9, 0.62, 0.95, 0.12), [0.45, 0.3, 0.2], { lw: 0.07 }); line(g, -0.2, -1.95, -0.2, -1.2, 0.07, rgb(LEATHER)); }
  // neck and head
  cel(g, rr(-0.12, -2.28, 0.24, 0.3, 0.05), dark(sk, 0.18), { lw: 0.05 });
  if (back || (!front && P.style === 1)) cel(g, ell(front ? 0 : -0.1, hy + 0.1, 0.4, 0.44), hair, { lw: 0.07 });
  cel(g, ell(0, hy + 0.03, 0.34, 0.4), sk, { lw: 0.07 });
  if (front) {
    for (const s of [-1, 1]) { fillPath(g, ell(s * 0.14, hy + 0.04, 0.045, 0.05), '#1a1414'); line(g, s * 0.14 - 0.1, hy - 0.08 - s * 0.01, s * 0.14 + 0.1, hy - 0.1 + s * 0.02, 0.05, rgb(dark(hair, 0.25))); } // plain dark eyes under a brow
    line(g, 0, hy + 0.1, 0.03, hy + 0.2, 0.04, rgb(dark(sk, 0.3))); line(g, -0.09, hy + 0.3, 0.09, hy + 0.3, 0.04, '#5a2c26');
  } else if (!back) { fillPath(g, ell(0.2, hy + 0.04, 0.04, 0.05), '#1a1414'); line(g, 0.1, hy - 0.08, 0.3, hy - 0.09, 0.05, rgb(dark(hair, 0.25))); fillPath(g, ell(0.36, hy + 0.14, 0.05, 0.06), rgb(dark(sk, 0.12))); line(g, 0.22, hy + 0.3, 0.32, hy + 0.3, 0.04, '#5a2c26'); }
  if (bearded && !back) cel(g, (p) => { p.moveTo(-0.34, hy + 0.12); p.bezierCurveTo(-0.34, hy + 0.6, 0.34, hy + 0.6, 0.34, hy + 0.12); p.lineTo(0.2, hy + 0.2); p.bezierCurveTo(0.1, hy + 0.3, -0.1, hy + 0.3, -0.2, hy + 0.2); p.closePath(); }, front ? dark(hair, 0.05) : hair, { lw: 0.06 });
  // hair
  const cap = (low) => cel(g, (p) => { p.moveTo(-0.38, hy + 0.05); p.bezierCurveTo(-0.42, hy - 0.62, 0.42, hy - 0.62, 0.38, hy + 0.05); if (front || back) { p.lineTo(0.2, hy - 0.16 + low); p.lineTo(0, hy - 0.2); p.lineTo(-0.2, hy - 0.16 + low); } else { p.lineTo(0.2, hy - 0.2); p.lineTo(-0.1, hy - 0.04); p.lineTo(-0.3, hy + 0.1); } p.closePath(); }, hair, { lw: 0.07 });
  if (K !== 'warden' && K !== 'sailor' && K !== 'merchant' && P.style !== 3) cap(P.style === 2 ? 0.08 : 0);
  if (back) cel(g, ell(0, hy + 0.0, 0.38, 0.4), hair, { lw: 0.07 });
  // headwear
  if (K === 'merchant') { cel(g, ell(0, hy - 0.28, 0.62, 0.15), [0.3, 0.22, 0.16], { lw: 0.07 }); cel(g, rr(-0.34, hy - 0.62, 0.68, 0.4, 0.14), [0.34, 0.25, 0.18], { lw: 0.07 }); line(g, -0.32, hy - 0.34, 0.32, hy - 0.34, 0.07, '#8a3a2a'); }
  else if (K === 'tavern' && P.style !== 3) line(g, -0.36, hy - 0.2, 0.36, hy - 0.2, 0.08, '#d9d4c4');
  else if (K === 'shipwright') cel(g, rr(-0.4, hy - 0.5, 0.8, 0.28, 0.1), [0.4, 0.36, 0.3], { lw: 0.07 });
  else if (K === 'smith') cel(g, rr(-0.38, hy - 0.4, 0.76, 0.2, 0.08), [0.22, 0.2, 0.2], { lw: 0.07 }); // a sooty headband
  else if (K === 'priest') cel(g, (p) => { p.moveTo(-0.5, hy + 0.3); p.bezierCurveTo(-0.56, hy - 0.78, 0.56, hy - 0.78, 0.5, hy + 0.3); if (!back) { p.lineTo(0.36, hy + 0.3); p.bezierCurveTo(0.4, hy - 0.4, -0.4, hy - 0.4, -0.36, hy + 0.3); } p.closePath(); }, dark(cl, 0.08), { lw: 0.07 }); // a hood, open at the face
  else if (K === 'smuggler') { cel(g, (p) => { p.moveTo(-0.43, hy - 0.12); p.bezierCurveTo(-0.44, hy - 0.62, 0.44, hy - 0.62, 0.43, hy - 0.12); p.closePath(); }, [0.2, 0.2, 0.26], { lw: 0.07 }); if (!front) { const kx = back ? 0 : -0.4; line(g, kx, hy - 0.18, kx - (back ? 0.12 : 0.3), hy + 0.2, 0.09, '#33333f'); line(g, kx, hy - 0.18, kx + (back ? 0.14 : -0.12), hy + 0.24, 0.09, '#33333f'); } } // a dark headscarf knotted at the back
  else if (K === 'miner') { cel(g, (p) => { p.moveTo(-0.44, hy - 0.06); p.bezierCurveTo(-0.46, hy - 0.66, 0.46, hy - 0.66, 0.44, hy - 0.06); p.closePath(); }, [0.46, 0.34, 0.2], { lw: 0.07 }); if (!back) { const lx = front ? 0 : 0.26; cel(g, rr(lx - 0.1, hy - 0.5, 0.2, 0.16, 0.04), [0.3, 0.28, 0.26], { lw: 0.04 }); fillPath(g, ell(lx, hy - 0.6, 0.06, 0.1), '#ffd76a'); } } // a leather cap with a candle lamp
  else if (K === 'guard') { cel(g, (p) => { p.moveTo(-0.42, hy + 0.02); p.bezierCurveTo(-0.44, hy - 0.62, 0.44, hy - 0.62, 0.42, hy + 0.02); p.closePath(); }, [0.6, 0.63, 0.7], { lw: 0.07 }); line(g, 0, hy - 0.5, 0, hy - 0.1, 0.07, rgb([0.45, 0.48, 0.55])); } // a helmet
  else if (K === 'sailor') { cel(g, (p) => { p.moveTo(-0.4, hy - 0.08); p.bezierCurveTo(-0.4, hy - 0.6, 0.4, hy - 0.6, 0.4, hy - 0.08); p.closePath(); }, [0.62, 0.2, 0.18], { lw: 0.07 }); if (!front) line(g, -0.3, hy - 0.2, -0.62, hy - 0.05, 0.1, '#9c3028'); }
  else if (K === 'warden') { cel(g, (p) => { p.moveTo(-0.5, hy + 0.35); p.bezierCurveTo(-0.62, hy - 0.7, 0.62, hy - 0.7, 0.5, hy + 0.35); p.lineTo(0.36, hy + 0.1); p.bezierCurveTo(0.34, hy - 0.3, -0.34, hy - 0.3, -0.36, hy + 0.1); p.closePath(); }, [0.9, 0.92, 0.95], { lw: 0.07 }); if (front && !atk) { line(g, 0.95, -0.3, 0.95, -2.85, 0.1, '#5a3c22'); fillPath(g, ell(0.95, -2.95, 0.16, 0.24), '#9fe6f5'); fillPath(g, ell(0.95, -2.95, 0.36, 0.4), 'rgba(160,230,245,0.22)'); } }
  else if (K === 'player') cel(g, rr(-0.38, hy - 0.46, 0.76, 0.26, 0.1), dark(cl, 0.2), { lw: 0.07 });
  else if (P.extra === 0) cel(g, (p) => { p.moveTo(-0.45, hy + 0.2); p.bezierCurveTo(-0.55, hy - 0.7, 0.55, hy - 0.7, 0.45, hy + 0.2); p.lineTo(0.3, hy + 0.05); p.bezierCurveTo(0.3, hy - 0.3, -0.3, hy - 0.3, -0.3, hy + 0.05); p.closePath(); }, dark(cl, 0.1), { lw: 0.07 }); // hood
  if (P.atl) { const wd = front || back ? 0.5 : 0.38; line(g, -wd, -1.2, wd, -1.2, 0.1, '#d8b040'); if (K !== 'guard') { line(g, -0.36, hy - 0.2, 0.36, hy - 0.2, 0.08, '#d8b040'); if (front) fillPath(g, ell(0, hy - 0.22, 0.07, 0.07), '#7fe3d8'); } } // gold belt, a gold circlet with a sea-glass bead
  if (P.oly) { const wd = front || back ? 0.52 : 0.4; line(g, -wd, -0.55, wd, -0.55, 0.12, P.trim); line(g, -wd * 0.8, -1.25, wd * 0.8, -1.25, 0.07, '#d8b040'); if (P.laurel) for (const sx of [-1, 1]) fillPath(g, ell(sx * 0.3, hy - 0.2, 0.12, 0.06, sx * 0.5), '#5d8a3a'); } // the chiton's hem, a gold girdle, a laurel wreath
  if (P.vik) { // Asgardian gear over the shared body: fur collar, braids, helmet with horns, a round shield on the left arm
    cel(g, ell(0, -1.98, 0.7, 0.26), [0.62, 0.52, 0.4], { lw: 0.07 }); for (let k = -3; k <= 3; k++) line(g, k * 0.2, -2.1, k * 0.2 + 0.03, -1.9, 0.07, rgb([0.78, 0.7, 0.58]));
    if (P.braids && !back) for (const s of [-1, 1]) { const bx = front ? s * 0.36 : 0.14; for (let k = 0; k < 4; k++) fillPath(g, ell(bx - (front ? 0 : 0.05 * k), hy + 0.35 + k * 0.17, 0.07, 0.09), rgb(hair)); }
    if (P.helm) { cel(g, (p) => { p.moveTo(-0.44, hy + 0.0); p.bezierCurveTo(-0.46, hy - 0.66, 0.46, hy - 0.66, 0.44, hy + 0.0); p.closePath(); }, [0.62, 0.65, 0.7], { lw: 0.08 }); line(g, -0.44, hy - 0.04, 0.44, hy - 0.04, 0.09, rgb([0.4, 0.42, 0.46])); if (front) line(g, 0, hy - 0.04, 0, hy + 0.3, 0.08, rgb([0.5, 0.52, 0.56]));
      if (P.horns) for (const s of [-1, 1]) { g.save(); g.lineCap = 'round'; g.lineWidth = 0.14; g.strokeStyle = '#07080c'; g.beginPath(); g.moveTo(s * 0.4, hy - 0.2); g.quadraticCurveTo(s * 0.78, hy - 0.2, s * 0.7, hy - 0.8); g.stroke(); g.lineWidth = 0.08; g.strokeStyle = '#efe9d8'; g.stroke(); g.restore(); } }
    if (P.hasShield && !back && !atk) { cel(g, ell(front ? -0.82 : 0.1, -1.3, 0.5, 0.5), P.shield, { lw: 0.09 }); fillPath(g, ell(front ? -0.82 : 0.1, -1.3, 0.14, 0.14), '#c9c2b0'); for (let a = 0; a < 6; a++) line(g, (front ? -0.82 : 0.1) + Math.cos(a) * 0.16, -1.3 + Math.sin(a) * 0.16, (front ? -0.82 : 0.1) + Math.cos(a) * 0.45, -1.3 + Math.sin(a) * 0.45, 0.03, rgb(mixc(P.shield, [0, 0, 0], 0.4))); }
  }
  // held tools
  if (K === 'priest' && !atk && !back) { const px = front ? 0.8 : -0.25; line(g, px, -0.2, px, -2.9, 0.08, '#6a4a2a'); fillPath(g, ell(px, -2.95, 0.12, 0.12), '#d8b040'); } // a staff topped with brass
  if (K === 'smuggler' && !atk && !back) { const lx = front ? 0.78 : -0.2; line(g, lx, -0.95, lx, -0.7, 0.05, '#2a2a30'); cel(g, rr(lx - 0.13, -0.72, 0.26, 0.32, 0.05), [0.3, 0.28, 0.26], { lw: 0.05 }); fillPath(g, rr(lx - 0.07, -0.66, 0.14, 0.2, 0.03), '#ffd76a'); } // a shuttered lantern in hand
  if (K === 'miner' && !atk && !back) { const px = front ? 0.82 : -0.3; line(g, px, -0.5, px - 0.1, -2.1, 0.08, '#5a3c22'); line(g, px - 0.45, -2.2, px + 0.3, -1.95, 0.09, '#8a8c92'); } // a pick held upright
  if (K === 'shipwright' && front) { line(g, -0.82, -1.0, -0.82, -1.7, 0.07, '#5a3c22'); cel(g, rr(-0.98, -1.82, 0.34, 0.2, 0.04), [0.45, 0.46, 0.5], { lw: 0.05 }); }
  if (atk) { // the weapon arm: raised and cocked back, then swung across the body with a white slash arc
    const blade = K === 'villager' ? [0.55, 0.38, 0.22] : [0.88, 0.9, 0.94], sleeve = dark(cl, 0.12);
    if (fr === 3) {
      cel(g, poly(0.5, -1.9, 0.82, -1.9, 1.02, -2.7, 0.78, -2.78), sleeve, { lw: 0.07 }); fillPath(g, ell(0.92, -2.8, 0.16, 0.16), rgb(sk));
      line(g, 0.92, -2.8, 1.08, -3.08, 0.26, '#07080c'); line(g, 0.92, -2.8, 1.08, -3.08, 0.14, rgb(blade)); line(g, 0.78, -2.84, 1.06, -2.74, 0.1, '#5a3c22');
    } else {
      line(g, 0.62, -1.85, 0.05, -1.3, 0.34, '#07080c'); line(g, 0.62, -1.85, 0.05, -1.3, 0.24, rgb(sleeve)); fillPath(g, ell(0.02, -1.26, 0.16, 0.16), rgb(sk));
      line(g, 0.02, -1.26, -0.98, -0.4, 0.26, '#07080c'); line(g, 0.02, -1.26, -0.98, -0.4, 0.14, rgb(blade)); line(g, 0.18, -1.2, -0.12, -1.42, 0.1, '#5a3c22');
      g.save(); g.lineCap = 'round'; g.lineWidth = 0.13; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.moveTo(1.08, -2.6); g.quadraticCurveTo(0.9, -0.9, -1.0, -0.2); g.stroke(); g.restore();
    }
  }
  g.restore();
}

// ---------------------------------------------------------------- ships, seen from above (bow at +x; rotate the sprite to the heading)
const LOOKS = {
  player: { hull: [0.72, 0.46, 0.26], sail: [0.98, 0.96, 0.9], accent: [0.25, 0.5, 0.95] },
  trader: { hull: [0.7, 0.5, 0.3], sail: [0.95, 0.88, 0.7], accent: [0.9, 0.78, 0.25] },
  navy: { hull: [0.38, 0.4, 0.55], sail: [0.98, 0.98, 1], accent: [0.85, 0.2, 0.2] },
  raider: { hull: [0.3, 0.24, 0.26], sail: [0.3, 0.28, 0.34], accent: [0.9, 0.2, 0.25] },
  ghost: { hull: [0.62, 0.78, 0.86], sail: [0.82, 0.95, 1], accent: [0.5, 0.95, 1] },
};
export function shipSpec(seed, kind) { const r = rngFor(seed, 9), look = LOOKS[kind] || LOOKS.trader; return { L: kind === 'player' ? 8.5 : 7 + r() * 5, B: 2.4 + r() * 1, masts: kind === 'player' ? 2 : 1 + ((r() * 3) | 0), kind, seed, ...look }; }
export const shipBox = (p) => ({ x0: -p.L * 1.15, x1: p.L * 1.55, y0: -p.B * 2.4, y1: p.B * 2.4 });
export function paintShip(g, p) {
  const { L, B } = p, hull = p.hull, hp = (k) => (g2) => { g2.moveTo(L * 1.15 * k, 0); g2.bezierCurveTo(L * 0.75 * k, -B * 0.9 * k, L * 0.15 * k, -B * 1.08 * k, -L * 0.7 * k, -B * 0.95 * k); g2.quadraticCurveTo(-L * 1.05 * k, -B * 0.85 * k, -L * 1.0 * k, -B * 0.35 * k); g2.lineTo(-L * 1.0 * k, B * 0.35 * k); g2.quadraticCurveTo(-L * 1.05 * k, B * 0.85 * k, -L * 0.7 * k, B * 0.95 * k); g2.bezierCurveTo(L * 0.15 * k, B * 1.08 * k, L * 0.75 * k, B * 0.9 * k, L * 1.15 * k, 0); g2.closePath(); };
  fillPath(g, ell(0, 0.25, L * 1.15, B * 1.12), 'rgba(0,20,40,0.22)'); // shadow on the water
  line(g, L * 1.1, 0, L * 1.65, 0, 0.22, INK); line(g, L * 1.1, 0, L * 1.65, 0, 0.12, rgb(mixc(hull, [0, 0, 0], 0.3))); // bowsprit
  cel(g, hp(1), mixc(hull, [0, 0, 0], 0.18), { lw: 0.12 });
  cel(g, hp(0.84), mixc(hull, [1, 1, 1], 0.28), { lw: 0.07, shade: 0.8 }); // deck
  g.save(); g.beginPath(); hp(0.84)(g); g.clip(); for (let x = -L; x < L * 1.1; x += 0.8) line(g, x, -B, x, B, 0.045, 'rgba(70,40,20,0.3)'); g.restore();
  for (const s of [-1, 1]) for (let i = -2; i <= 2; i++) fillPath(g, rr(i * L * 0.2 - 0.18, s * B * 0.99 - 0.1, 0.36, 0.2, 0.05), '#241d22'); // gun ports
  cel(g, rr(-L * 0.98, -B * 0.58, L * 0.42, B * 1.16, 0.2), mixc(hull, [0, 0, 0], 0.1)); for (const s of [-1, 0, 1]) fillPath(g, rr(-L * 0.99, s * B * 0.32 - 0.14, 0.14, 0.28, 0.04), '#ffe58a'); // stern cabin
  const mx = p.masts === 1 ? [L * 0.1] : p.masts === 2 ? [L * 0.45, -L * 0.2] : [L * 0.55, L * 0.1, -L * 0.3];
  for (const x of mx) { // sails seen from above: curved, billowing, with a boom line, slightly trimmed off the centre line
    const w = B * 1.65;
    g.save(); g.translate(x, 0); g.rotate(0.22);
    cel(g, (q) => { q.moveTo(-0.3, -w); q.quadraticCurveTo(1.6, 0, -0.3, w); q.lineTo(-0.9, w); q.quadraticCurveTo(0.7, 0, -0.9, -w); q.closePath(); }, p.sail, { lw: 0.08, shade: 0.7 });
    line(g, -0.6, -w, -0.6, w, 0.1, rgb(hull, 0.7)); g.restore();
    cel(g, ell(x, 0, 0.42, 0.42), mixc(hull, [1, 1, 1], 0.1), { lw: 0.07 });
  }
  line(g, mx[0], 0, L * 1.55, 0, 0.04, 'rgba(70,45,25,0.8)'); cel(g, poly(L * 1.05, 0, L * 1.5, 0, mx[0] + 0.9, B * 0.9), mixc(p.sail, [1, 1, 1], 0.05), { lw: 0.06 }); // jib
  cel(g, poly(-L * 1.0, -0.15, -L * 1.0 - 1.9, -0.55, -L * 1.0 - 1.9, 0.55), p.accent, { lw: 0.06 }); // flag streaming astern
}

// ---------------------------------------------------------------- sea life and birds (ambient, flat sprites). Every sprite faces right; dir 'L' mirrors it. y up is negative, the anchor is the waterline.
export const CRIT_BOX = {
  whale: { x0: -4.7, x1: 4.7, y0: -3.6, y1: 1.2 }, icewhale: { x0: -4.7, x1: 4.7, y0: -3.6, y1: 1.2 }, dolphin: { x0: -2, x1: 2, y0: -1.6, y1: 1.6 }, orca: { x0: -3, x1: 3, y0: -2.4, y1: 2 }, narwhal: { x0: -2.6, x1: 4.2, y0: -2, y1: 2 },
  school: { x0: -1.8, x1: 1.8, y0: -0.7, y1: 0.5 }, flyfish: { x0: -0.8, x1: 0.8, y0: -0.6, y1: 0.5 }, turtle: { x0: -1.1, x1: 1.1, y0: -0.9, y1: 0.5 }, fin: { x0: -1, x1: 1, y0: -1.7, y1: 0.3 }, seal: { x0: -1.1, x1: 1.1, y0: -1.1, y1: 0.7 }, ray: { x0: -1.9, x1: 1.6, y0: -1.3, y1: 0.5 },
  serhead: { x0: -2.2, x1: 3.6, y0: -6.4, y1: 0.7 }, sercoil: { x0: -3, x1: 3, y0: -3.4, y1: 0.6 }, krarm: { x0: -1.8, x1: 2.4, y0: -7, y1: 0.6 }, krhead: { x0: -3.8, x1: 3.8, y0: -6.2, y1: 0.7 }, hyhead: { x0: -2.2, x1: 3.6, y0: -6.4, y1: 0.7 }, hybody: { x0: -3, x1: 3, y0: -3.4, y1: 0.6 }, cyclops: { x0: -3.4, x1: 3.4, y0: -7.6, y1: 0.2 }, boulder: { x0: -1, x1: 1, y0: -1, y1: 0.9 },
  gull: { x0: -1.6, x1: 1.4, y0: -1.2, y1: 1.1 }, albatross: { x0: -3.1, x1: 3.1, y0: -1.2, y1: 1.2 }, raven: { x0: -1.4, x1: 1.2, y0: -1.1, y1: 1 }, eagle: { x0: -3, x1: 3, y0: -1.4, y1: 1.4 }, harpy: { x0: -3, x1: 3, y0: -2.4, y1: 2.6 },
};
const curve = (...p) => (g) => { g.moveTo(p[0], p[1]); for (let i = 2; i + 3 < p.length; i += 4) g.quadraticCurveTo(p[i], p[i + 1], p[i + 2], p[i + 3]); g.closePath(); };
const porp = (g, o) => { // a porpoise-like body (dolphin, orca, narwhal), nose to the right
  const s = o.s || 1.35; g.save(); g.rotate(o.rot || 0); g.scale(s, s);
  cel(g, poly(-1.4, 0.1, -2, -0.35, -1.8, 0.1, -2.05, 0.55), o.dark, { lw: 0.1 }); // tail flukes
  cel(g, curve(-1.4, 0.1, -0.6, -0.8, 0.7, -0.5, 1.2, -0.42, 1.65, -0.12, 1.0, 0.12, 0.6, 0.35, -0.4, 0.55, -1.4, 0.1), o.body, { lw: 0.1 });
  fillPath(g, curve(-0.9, 0.3, -0.2, 0.12, 0.8, 0.12, 1.4, -0.08, 0.7, 0.3, -0.3, 0.5, -0.9, 0.3), rgb(o.belly)); // pale belly
  if (o.white) fillPath(g, ell(0.45, -0.18, 0.28, 0.14, -0.2), '#f4f8fb'); // orca eye patch
  cel(g, poly(-0.1, -0.5, o.fin ? -0.45 : -0.4, o.fin ? -1.4 : -1, 0.25, -0.45), o.dark, { lw: 0.09 });
  fillPath(g, ell(1.0, -0.2, 0.05, 0.05), '#050508');
  if (o.tusk) { g.beginPath(); g.moveTo(1.6, -0.2); g.lineTo(3.9, -0.55); g.lineWidth = 0.1; g.strokeStyle = '#f4efe0'; g.stroke(); }
  if (o.spots) for (const [x, y] of [[-0.6, -0.3], [0.1, -0.45], [-0.2, -0.1], [0.6, -0.3], [-1, -0.1]]) fillPath(g, ell(x, y, 0.1, 0.07), rgb(o.dark));
  g.restore();
};
const wingBird = (g, o) => { // side-on bird: body, head, beak, two wings (far one darker); fr 0 wings up, 1 wings down; len = wing length
  const up = o.fr === 0, L = o.len, w = (k) => (up ? poly(-0.1 * k, -0.05, -L * 0.5 * k, -L * 0.8, -L * k, -L * 0.5, -L * 0.55 * k, 0.05) : poly(-0.1 * k, 0, -L * 0.55 * k, L * 0.65, -L * k, L * 0.4, -L * 0.55 * k, -0.05));
  g.save(); g.translate(0.3, 0); cel(g, w(1), mixc(o.wing, [0, 0, 0], 0.25), { lw: 0.07 }); g.restore();
  cel(g, ell(0, 0, o.b, o.b * 0.45), o.body, { lw: 0.07 }); if (o.tail) fillPath(g, poly(-o.b * 0.9, -0.05, -o.b * 1.5, -0.15, -o.b * 1.5, 0.15), rgb(o.tail));
  cel(g, ell(o.b * 0.95, -0.05, o.b * 0.3, o.b * 0.28), o.head || o.body, { lw: 0.06 }); fillPath(g, poly(o.b * 1.2, -0.08, o.b * 1.65, 0, o.b * 1.2, 0.04), rgb(o.beak || [1, 0.8, 0.2]));
  cel(g, w(1), o.wing, { lw: 0.07 }); if (o.tips) { g.save(); g.beginPath(); w(1)(g); g.clip(); fillPath(g, (gg) => gg.rect(-L * 1.2, -L, L * 0.45, L * 2), rgb(o.tips)); g.restore(); }
};
export function paintCritter(g, kind, dir, fr) {
  if (dir === 'L') g.scale(-1, 1);
  switch (kind) {
    case 'whale': case 'icewhale': {
      const c = kind === 'whale' ? [0.36, 0.44, 0.55] : [0.82, 0.88, 0.94], bel = kind === 'whale' ? [0.7, 0.76, 0.82] : [0.96, 0.98, 1];
      if (fr === 1) { cel(g, curve(-1.2, 0.5, 0, -0.6, 1.8, -0.3, 2.6, 0.4, 0, 0.9, -1.2, 0.5), c, { lw: 0.12 }); cel(g, poly(-1.6, 0.3, -2.5, -0.3, -3.4, -2.6, -2.6, -1.9, -2.3, -3.1, -1.4, -0.7), mixc(c, [0, 0, 0], 0.15), { lw: 0.12 }); break; }
      cel(g, curve(-3.9, -0.1, -2.4, -1.8, 0.2, -1.55, 2.2, -1.35, 3.9, -0.5, 4.1, 0.1, 3.4, 0.45, 0, 1.1, -3.9, 0.3, -3.9, -0.1), c, { lw: 0.12 });
      fillPath(g, curve(-2.5, 0.4, 0, 0.1, 2.5, 0.05, 3.7, -0.3, 2.2, 0.5, -1, 0.85, -2.5, 0.4), rgb(bel)); cel(g, poly(-0.9, -1.5, -1.5, -2.2, -0.4, -1.55), mixc(c, [0, 0, 0], 0.12), { lw: 0.1 }); fillPath(g, ell(3.2, -0.45, 0.08, 0.08), INK);
      if (fr === 2) { fillPath(g, poly(1.9, -1.4, 2.15, -1.4, 2.7, -3.4, 1.35, -3.3), 'rgba(235,246,255,0.95)'); fillPath(g, ell(2.0, -3.4, 0.5, 0.25), 'rgba(235,246,255,0.9)'); }
      break;
    }
    case 'dolphin': porp(g, { rot: [-0.75, 0, 0.8][fr], dark: [0.3, 0.36, 0.45], body: [0.5, 0.6, 0.7], belly: [0.9, 0.93, 0.95] }); break;
    case 'orca': porp(g, { s: 1.35, rot: [-0.7, 0, 0.75][fr], dark: [0.08, 0.09, 0.12], body: [0.12, 0.14, 0.18], belly: [0.95, 0.97, 0.98], white: true, fin: true }); break;
    case 'narwhal': porp(g, { s: 1.1, rot: [-0.7, 0, 0.75][fr], dark: [0.42, 0.48, 0.55], body: [0.72, 0.78, 0.84], belly: [0.95, 0.96, 0.97], tusk: true, spots: true }); break;
    case 'flyfish': { cel(g, curve(-0.5, 0, 0, -0.18, 0.5, -0.02, 0, 0.14, -0.5, 0), [0.7, 0.82, 0.92], { lw: 0.06 }); cel(g, fr ? poly(-0.1, 0.05, -0.6, 0.45, 0.1, 0.1) : poly(-0.1, -0.05, -0.55, -0.5, 0.1, -0.1), [0.8, 0.9, 1], { lw: 0.05 }); break; }
    case 'turtle': { cel(g, curve(-0.75, 0.05, 0, -1.55, 0.75, 0.05, 0, 0.2, -0.75, 0.05), [0.34, 0.5, 0.28], { lw: 0.1 }); for (const x of [-0.35, 0, 0.35]) line(g, x, -0.05, x * 0.8, -0.45, 0.05, rgb([0.2, 0.3, 0.16])); cel(g, ell(0.9, -0.1, 0.22, 0.16), [0.55, 0.6, 0.32], { lw: 0.07 }); cel(g, fr ? poly(0.2, 0, 0.9, 0.3, 0.3, 0.12) : poly(0.2, 0, 0.8, 0.05, 0.3, 0.14), [0.5, 0.58, 0.3], { lw: 0.06 }); break; }
    case 'school': { for (const [x, y, r] of [[-1.1, -0.1, 0.5], [0.2, -0.25, 0.9], [1.1, 0.0, 0.6]]) { g.beginPath(); g.ellipse(x, y, r, r * 0.28, 0, 0, TAU); g.lineWidth = 0.07; g.strokeStyle = 'rgba(230,245,255,0.85)'; g.stroke(); } const P = fr ? [[-0.9, -0.15], [-0.1, -0.35], [0.5, -0.05], [1.0, -0.3], [0.2, 0.1]] : [[-1.0, -0.25], [-0.3, -0.05], [0.4, -0.4], [0.9, -0.1], [0.0, -0.2]]; for (const [x, y] of P) { cel(g, ell(x, y, 0.2, 0.08), [0.78, 0.88, 0.96], { lw: 0.04 }); } break; }
    case 'ray': { const up = fr ? -0.35 : -1.05, c = [0.2, 0.32, 0.44]; cel(g, poly(-0.2, -0.1, -0.7, up, -0.05, -0.3), mixc(c, [0, 0, 0], 0.2), { lw: 0.07 }); cel(g, curve(-1.0, 0, -0.4, -0.45, 0.8, -0.2, 1.3, -0.05, 0.8, 0.15, -0.3, 0.2, -1.0, 0), c, { lw: 0.08 }); cel(g, poly(0.1, -0.15, 0.55, up - 0.1, 0.65, -0.2), c, { lw: 0.07 }); fillPath(g, curve(-0.6, 0.08, 0.2, 0.0, 1.0, 0.05, 0.2, 0.17, -0.6, 0.08), '#e8eef2'); line(g, -1.0, 0, -1.8, 0.1, 0.05, INK); for (const s of [-1, 1]) line(g, 1.2, -0.05, 1.45, -0.05 + s * 0.12, 0.05, rgb(c)); break; } // a manta at the surface, both wing tips out of the water (frame 0 raised, frame 1 down), horn-fins at the head
    case 'fin': cel(g, poly(-0.8, 0.1, 0.1, -1.55, 0.7, 0.1), [0.34, 0.38, 0.44], { lw: 0.1 }); break;
    case 'seal': { cel(g, curve(-0.9, 0.5, -0.7, -0.15, 0, -0.2, 0.6, -0.1, 0.9, 0.5, 0, 0.7, -0.9, 0.5), [0.48, 0.44, 0.4], { lw: 0.09 }); const dy = fr ? 0.25 : 0; cel(g, ell(0.2, -0.55 + dy, 0.5, 0.4), [0.56, 0.52, 0.48], { lw: 0.09 }); fillPath(g, ell(0.48, -0.5 + dy, 0.07, 0.07), INK); fillPath(g, ell(0.62, -0.4 + dy, 0.1, 0.08), INK); for (const k of [-0.1, 0.1]) line(g, 0.62, -0.38 + dy + k, 1.0, -0.38 + dy + k * 2, 0.025, '#e8e4dc'); break; }
    case 'serhead': case 'sercoil': case 'hyhead': case 'hybody': { // the sea serpent: green scales, a pale belly, a red crest; the head opens its jaw on frame 1. The hydra: the same shapes in purple with a gold crest
      const hy = kind[0] === 'h', sc = hy ? [0.42, 0.26, 0.44] : [0.2, 0.5, 0.42], dk = hy ? [0.24, 0.12, 0.26] : [0.1, 0.3, 0.26], bel = hy ? [0.85, 0.72, 0.5] : [0.8, 0.82, 0.55], crest = hy ? [0.9, 0.7, 0.2] : [0.75, 0.2, 0.18];
      if (kind === 'sercoil' || kind === 'hybody') { for (const x of [-1.5, -0.5, 0.5, 1.5]) cel(g, poly(x - 0.35, -2.2 + Math.abs(x) * 0.35, x, -3.2 + Math.abs(x) * 0.4, x + 0.35, -2.2 + Math.abs(x) * 0.35), crest, { lw: 0.08 }); cel(g, curve(-2.8, 0.4, -2.4, -3.2, 0, -2.9, 2.4, -3.2, 2.8, 0.4, 1.7, 0.4, 1.6, -1.6, 0, -1.8, -1.6, -1.6, -1.7, 0.4, -2.8, 0.4), sc, { lw: 0.12 }); fillPath(g, curve(-2.3, 0.3, -1.9, -1.2, -1.75, 0.3, -2.3, 0.3), rgb(bel)); fillPath(g, curve(2.3, 0.3, 1.9, -1.2, 1.75, 0.3, 2.3, 0.3), rgb(bel)); for (const [x, y] of [[-1.2, -2.5], [0, -2.6], [1.2, -2.5], [-2.1, -1.5], [2.1, -1.5]]) fillPath(g, ell(x, y, 0.22, 0.13), rgb(dk)); break; }
      for (const y of [-1.4, -2.6, -3.8]) cel(g, poly(-1.1, y + 0.4, -2.0, y - 0.3, -1.0, y - 0.5), crest, { lw: 0.08 }); // fins down the back of the neck
      cel(g, curve(-1.4, 0.5, -1.6, -3.4, -0.4, -4.9, 0.2, -5.2, 0.6, -4.2, -0.1, -3.2, 0.2, -1.2, 0.7, 0.5, -1.4, 0.5), sc, { lw: 0.12 }); // the neck
      fillPath(g, curve(-0.2, 0.4, -0.3, -2.4, 0.3, -3.8, 0.4, -3.6, 0.0, -2.2, 0.5, 0.4, -0.2, 0.4), rgb(bel));
      cel(g, curve(-0.6, -5.4, 0.4, -6.2, 2.0, -5.6, 3.4, -5.3, 3.2, -4.8, 2.2, -4.7, 0.6, -4.2, -0.6, -5.4), sc, { lw: 0.12 }); // the upper jaw and skull
      cel(g, fr ? poly(0.6, -4.5, 2.9, -3.6, 2.7, -3.2, 0.4, -4.0) : poly(0.6, -4.5, 3.0, -4.6, 2.9, -4.3, 0.5, -4.1), mixc(sc, [0, 0, 0], 0.15), { lw: 0.1 }); // the lower jaw
      if (fr) { fillPath(g, poly(0.8, -4.45, 2.8, -4.65, 2.8, -3.75), '#5a1416'); for (const x of [1.4, 2.0, 2.6]) fillPath(g, poly(x - 0.12, -4.7, x, -4.35, x + 0.12, -4.7), '#f4efe0'); }
      cel(g, poly(-0.4, -5.6, -1.6, -6.3, -0.1, -5.9), crest, { lw: 0.08 }); fillPath(g, ell(1.3, -5.45, 0.24, 0.17), '#ffd84a'); fillPath(g, ell(1.36, -5.45, 0.07, 0.15), INK); // horn and eye
      break;
    }
    case 'krarm': { // a kraken's arm: a deep red-purple tentacle rising from the water and curling over, pale suckers on the inside; frame 1 leans
      const c = [0.56, 0.2, 0.36]; if (fr) g.transform(1, 0, -0.18, 1, 0, 0);
      cel(g, curve(-0.9, 0.4, -1.4, -3.2, -0.6, -5.0, 0.2, -6.7, 1.5, -6.1, 2.2, -5.4, 1.4, -4.9, 0.7, -5.4, 0.3, -4.4, 0.4, -2.0, 0.9, 0.4), c, { lw: 0.12 });
      for (const [x, y] of [[0.55, -0.8], [0.4, -1.8], [0.3, -2.8], [0.35, -3.7], [0.75, -4.6]]) fillPath(g, ell(x, y, 0.17, 0.14), rgb([0.95, 0.78, 0.72]));
      break;
    }
    case 'krhead': { // the kraken's head: a great red-purple dome with darker blotches and two gold eyes with black slits
      const c = [0.5, 0.18, 0.33];
      cel(g, curve(-3.6, 0.5, -3.8, -3.6, -1.2, -5.4, 0.2, -6.4, 1.6, -5.2, 3.9, -3.4, 3.6, 0.5, 0, 0.8, -3.6, 0.5), c, { lw: 0.14 });
      for (const [x, y, r] of [[-1.6, -3.4, 0.5], [0.4, -4.6, 0.4], [1.9, -2.8, 0.45], [-0.3, -2.6, 0.3]]) fillPath(g, ell(x, y, r, r * 0.7), rgb(mixc(c, [0, 0, 0], 0.3)));
      for (const x of [-1.5, 1.5]) { fillPath(g, ell(x, -1.2, 0.62, 0.48), '#ffd84a'); fillPath(g, ell(x, -1.2, 0.5, 0.12), INK); }
      break;
    }
    case 'cyclops': { // the cyclops: a hulking bald giant in a goatskin, one great eye; frame 1 holds a boulder over his head to throw
      const skin = [0.82, 0.6, 0.46], hide = [0.5, 0.38, 0.24], dk = mixc(skin, [0, 0, 0], 0.25);
      for (const x of [-0.9, 0.9]) cel(g, poly(x - 0.55, -3.0, x + 0.55, -3.0, x + 0.5, 0, x - 0.6, 0), dk, { lw: 0.1 }); // legs
      cel(g, curve(-2.1, -2.6, -2.5, -5.0, -1.2, -5.9, 0, -6.1, 1.2, -5.9, 2.5, -5.0, 2.1, -2.6, 0, -2.2, -2.1, -2.6), skin, { lw: 0.12 }); // a barrel body
      cel(g, poly(-2.2, -3.6, 2.2, -3.6, 2.0, -2.2, 1.0, -1.7, 0, -2.1, -1.0, -1.7, -2.0, -2.2), hide, { lw: 0.1 }); // goatskin kilt
      fillPath(g, poly(-1.4, -5.8, 0.6, -3.7, 1.0, -3.7, -1.0, -5.9), rgb(hide)); // the strap
      cel(g, ell(0, -6.55, 1.0, 0.95), skin, { lw: 0.11 }); // head
      fillPath(g, ell(0.15, -6.7, 0.48, 0.4), '#f6f2e6'); fillPath(g, ell(0.25, -6.7, 0.22, 0.26), '#c8402a'); fillPath(g, ell(0.27, -6.7, 0.1, 0.12), INK); // the one eye
      line(g, -0.3, -6.05, 0.6, -6.0, 0.07, INK); // mouth
      if (fr) { for (const x of [-1.7, 1.7]) cel(g, poly(x * 1.15 - 0.35, -5.3, x * 1.15 + 0.35, -5.3, x * 0.55 + 0.3, -7.3, x * 0.55 - 0.3, -7.3), skin, { lw: 0.1 }); cel(g, ell(0, -7.4, 1.3, 0.75), [0.6, 0.58, 0.54], { lw: 0.1 }); } // arms up, a boulder overhead
      else for (const x of [-1, 1]) cel(g, poly(x * 2.0, -5.2, x * 2.6, -4.9, x * 2.7, -2.2, x * 2.1, -2.3), skin, { lw: 0.1 }); // arms hanging
      break;
    }
    case 'boulder': cel(g, curve(-0.9, 0.2, -1.0, -0.6, -0.2, -0.95, 0.7, -0.8, 1.0, 0.0, 0.5, 0.85, -0.4, 0.8, -0.9, 0.2), [0.6, 0.58, 0.54], { lw: 0.1 }); fillPath(g, ell(-0.25, -0.3, 0.25, 0.18), rgb([0.48, 0.46, 0.43])); break;
    case 'gull': wingBird(g, { fr, len: 1.35, b: 0.45, body: [0.97, 0.97, 0.98], wing: [0.88, 0.9, 0.93], tips: [0.2, 0.22, 0.26] }); break;
    case 'albatross': wingBird(g, { fr, len: 2.9, b: 0.8, body: [0.97, 0.97, 0.98], wing: [0.95, 0.96, 0.97], tips: [0.12, 0.13, 0.16], beak: [0.95, 0.75, 0.55] }); break;
    case 'raven': wingBird(g, { fr, len: 1.2, b: 0.42, body: [0.1, 0.1, 0.14], wing: [0.14, 0.15, 0.2], beak: [0.25, 0.25, 0.3] }); break;
    case 'eagle': wingBird(g, { fr, len: 2.6, b: 0.7, body: [0.42, 0.3, 0.2], wing: [0.36, 0.26, 0.18], head: [0.95, 0.95, 0.93], tail: [0.97, 0.97, 0.97], tips: [0.18, 0.12, 0.08], beak: [1, 0.78, 0.2] }); break;
    case 'harpy': { // a harpy: dark grey-brown wings, a woman's pale face with black hair streaming back, red eyes and gold talons; fr 0 wings up, 1 down
      for (const x of [-0.25, 0.2]) line(g, x, 0.25, x + 0.15, 0.95, 0.09, rgb([0.85, 0.65, 0.2])); // talons
      g.save(); g.scale(1.3, 1.3); fillPath(g, poly(0.75, -0.42, -0.3, -0.6, -0.9, -0.2, 0.55, -0.12), rgb([0.08, 0.07, 0.1])); g.restore(); // hair
      wingBird(g, { fr, len: 2.4, b: 0.8, body: [0.3, 0.26, 0.24], wing: [0.36, 0.32, 0.3], head: [0.9, 0.74, 0.62], tips: [0.12, 0.1, 0.1], beak: [0.82, 0.64, 0.52] });
      fillPath(g, ell(0.86, -0.12, 0.07, 0.06), '#d0201c'); break;
    }
  }
}

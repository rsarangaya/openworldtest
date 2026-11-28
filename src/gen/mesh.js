// Procedural meshes: islands + towns, ships, people, the ice wall, water. No model files, no textures.
// Vertex = 9 floats: position, normal, colour. Mostly flat-shaded; terrain uses smooth normals and per-vertex colour.
import { SHIPS } from '../rules/ships.js';
import { rngFor, clamp, mix, range, pick, fbm, sstep } from './rng.js';
import { islandHeight, islandTown, townsfolk, dockDist, DOCK_Y, pathDist, gateAngle, WALL_R, GATE_HALF, SECTOR, TAU } from './world.js';

const dim = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// glass and lamps: every channel raised by 2 marks them for the renderer, which lights them up at night (and takes the 2 off)
const glow = (c) => c.map((v) => v + 2);
export class Mesh {
  constructor() { this.v = []; }
  push(p, n, c) { this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2]); }
  tri(a, b, c, col) { const n = norm(cross(sub(b, a), sub(c, a))); this.push(a, n, col); this.push(b, n, col); this.push(c, n, col); }
  triV(a, b, c, ca, cb, cc) { const n = norm(cross(sub(b, a), sub(c, a))); this.push(a, n, ca); this.push(b, n, cb); this.push(c, n, cc); } // flat normal, colour per vertex
  triN(a, b, c, ca, cb, cc, na, nb, nc) { this.push(a, na, ca); this.push(b, nb, cb); this.push(c, nc, cc); } // smooth normals + colours
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  quadV(a, b, c, d, ca) { this.quad(a, b, c, d, ca); } // flat on purpose: smooth colour gradients land on different palette colours as you move and make pixels crawl
  // axis-aligned box centred at (x,y,z). ao darkens the bottom edge of the side faces (cheap ambient occlusion).
  box(x, y, z, w, h, d, col, ao = 0) {
    const [x0, x1, y0, y1, z0, z1] = [x - w / 2, x + w / 2, y - h / 2, y + h / 2, z - d / 2, z + d / 2], lo = ao ? dim(col, 1 - ao) : col;
    const P = (i, j, k) => [i ? x1 : x0, j ? y1 : y0, k ? z1 : z0];
    this.quadV(P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1), lo, lo, col, col); this.quadV(P(1, 0, 0), P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), lo, lo, col, col);
    this.quad(P(0, 1, 1), P(1, 1, 1), P(1, 1, 0), P(0, 1, 0), col); this.quad(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1), lo);
    this.quadV(P(1, 0, 1), P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), lo, lo, col, col); this.quadV(P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0), lo, lo, col, col);
  }
  // a rounded-ish lump (octahedron): bushes, tree crowns, rocks
  blob(x, y, z, r, col, sq = 0.8, sx = 1, sz = 1) {
    const t = [x, y + r * sq, z], b = [x, y - r * 0.35, z], A = [x + r * sx, y, z], B = [x, y, z + r * sz], C = [x - r * sx, y, z], D = [x, y, z - r * sz];
    const c2 = dim(col, 0.86), c3 = dim(col, 0.7);
    this.triV(t, A, B, col, c2, c2); this.triV(t, B, C, col, c2, c2); this.triV(t, C, D, col, c2, c2); this.triV(t, D, A, col, c2, c2);
    this.triV(b, B, A, c3, c2, c2); this.triV(b, C, B, c3, c2, c2); this.triV(b, D, C, c3, c2, c2); this.triV(b, A, D, c3, c2, c2);
  }
  // a thin double-crossed strip between two points: rope, rigging, wires
  line(a, b, w, col) {
    const d = norm(sub(b, a)), s = norm(cross(d, [0, 1, 0]));
    this.quad([a[0], a[1] - w, a[2]], [a[0], a[1] + w, a[2]], [b[0], b[1] + w, b[2]], [b[0], b[1] - w, b[2]], col);
    this.quad([a[0] - s[0] * w, a[1], a[2] - s[2] * w], [a[0] + s[0] * w, a[1], a[2] + s[2] * w], [b[0] + s[0] * w, b[1], b[2] + s[2] * w], [b[0] - s[0] * w, b[1], b[2] - s[2] * w], col);
  }
  get count() { return this.v.length / 9; }
  data() { return new Float32Array(this.v); }
}

// ---------------------------------------------------------------- terrain colours
const PAL = {
  tropical: { low: [0.88, 0.8, 0.56], mid: [0.27, 0.52, 0.2], high: [0.4, 0.38, 0.33] },
  temperate: { low: [0.72, 0.67, 0.5], mid: [0.32, 0.47, 0.22], high: [0.46, 0.43, 0.4] },
  rocky: { low: [0.6, 0.57, 0.5], mid: [0.42, 0.4, 0.37], high: [0.55, 0.53, 0.5] },
  volcanic: { low: [0.25, 0.22, 0.2], mid: [0.2, 0.17, 0.16], high: [0.38, 0.12, 0.06] },
  sandbar: { low: [0.92, 0.86, 0.64], mid: [0.9, 0.84, 0.62], high: [0.9, 0.84, 0.62] },
  frozen: { low: [0.82, 0.88, 0.92], mid: [0.9, 0.94, 0.98], high: [0.96, 0.98, 1] },
};
const OL_PAL = { rocky: { low: [0.82, 0.76, 0.6], mid: [0.6, 0.6, 0.5], high: [0.88, 0.86, 0.8] }, temperate: { low: [0.84, 0.78, 0.58], mid: [0.44, 0.52, 0.28], high: [0.86, 0.84, 0.78] } }; // Olympus: pale limestone peaks, dry olive-green slopes
function terrainColor(isl, y, steep) {
  const p = (isl.theme === 'olympus' && OL_PAL[isl.biome]) || PAL[isl.biome];
  if (y < 1.2) return lerp3(isl.biome === 'frozen' ? [0.7, 0.78, 0.84] : [0.58, 0.52, 0.38], p.low, clamp((y + 2) / 3, 0, 1));
  const t = clamp((y - 1.2) / (isl.h * 0.8), 0, 1);
  const c = t < 0.55 ? lerp3(p.low, p.mid, clamp(t * 4, 0, 1)) : lerp3(p.mid, p.high, (t - 0.55) / 0.45);
  return steep > 0.4 ? lerp3(c, isl.theme === 'olympus' ? [0.7, 0.68, 0.62] : [0.4, 0.37, 0.34], Math.min(0.75, (steep - 0.4) * 3)) : c;
}

// ---------------------------------------------------------------- vegetation + rocks
const GREENS = [[0.2, 0.46, 0.18], [0.26, 0.52, 0.2], [0.34, 0.54, 0.22], [0.18, 0.4, 0.22]], AUTUMN = [[0.7, 0.4, 0.14], [0.76, 0.58, 0.18]];
function tree(m, x, y, z, biome, r) {
  const hh = range(r, 3.5, 6.5);
  if (biome === 'tropical') {
    m.box(x, y + hh / 2, z, 0.5, hh, 0.5, [0.42, 0.3, 0.18]); // palm: curved-looking trunk rings + fronds
    for (let k = 1; k < 4; k++) m.box(x, y + (hh * k) / 4, z, 0.58, 0.1, 0.58, [0.34, 0.24, 0.14]);
    for (let l = 0; l < 7; l++) { const a = (l / 7) * TAU + r(); m.tri([x, y + hh, z], [x + Math.cos(a) * 2.6, y + hh - 1.4, z + Math.sin(a) * 2.6], [x + Math.cos(a + 0.45) * 1, y + hh - 0.1, z + Math.sin(a + 0.45) * 1], pick(r, GREENS)); }
    m.box(x + 0.25, y + hh - 0.3, z, 0.25, 0.25, 0.25, [0.45, 0.32, 0.12]); // coconuts
  } else if (biome === 'frozen' || r() < 0.35) { // pine
    const c = biome === 'frozen' ? [0.84, 0.91, 0.96] : [0.12, 0.34, 0.2];
    m.box(x, y + 0.7, z, 0.5, 1.4, 0.5, [0.3, 0.2, 0.12]);
    for (let k = 0; k < 4; k++) { const w = (2 - k * 0.45) * hh / 5, yy = y + 1.1 + k * hh * 0.24, ty = yy + hh * 0.38, cc = dim(c, 1 - k * 0.04); m.tri([x - w, yy, z - w], [x + w, yy, z - w], [x, ty, z], cc); m.tri([x + w, yy, z - w], [x + w, yy, z + w], [x, ty, z], dim(cc, 0.9)); m.tri([x + w, yy, z + w], [x - w, yy, z + w], [x, ty, z], cc); m.tri([x - w, yy, z + w], [x - w, yy, z - w], [x, ty, z], dim(cc, 0.9)); }
  } else { // broadleaf: trunk, branches, three lumpy crowns
    m.box(x, y + hh * 0.35, z, 0.55, hh * 0.7, 0.55, [0.38, 0.27, 0.16], 0.3);
    const col = r() < 0.15 ? pick(r, AUTUMN) : pick(r, GREENS), cr = hh * 0.42;
    m.blob(x, y + hh * 0.72, z, cr, col, 0.85); m.blob(x + cr * 0.55, y + hh * 0.6, z + cr * 0.2, cr * 0.7, dim(col, 1.08), 0.8); m.blob(x - cr * 0.4, y + hh * 0.85, z - cr * 0.4, cr * 0.65, dim(col, 0.92), 0.8);
  }
}
const bush = (m, x, y, z, r) => { const c = pick(r, GREENS), s = range(r, 0.6, 1.2); m.blob(x, y + 0.1, z, s, c, 0.7); m.blob(x + s * 0.7, y, z + s * 0.3, s * 0.65, dim(c, 1.1), 0.7); };
const rock = (m, x, y, z, r, biome) => { const s = range(r, 0.4, 1.5), c = biome === 'volcanic' ? [0.22, 0.2, 0.2] : biome === 'frozen' ? [0.7, 0.74, 0.8] : [0.5, 0.49, 0.46]; m.blob(x, y - 0.1, z, s, dim(c, range(r, 0.85, 1.1)), 0.65, 1, range(r, 0.7, 1.2)); };
const FLOWERS = [[0.95, 0.85, 0.2], [0.95, 0.95, 0.95], [0.85, 0.2, 0.25], [0.6, 0.35, 0.8], [0.95, 0.55, 0.15]];
const flowers = (m, x, y, z, r) => { const c = pick(r, FLOWERS); for (let k = 0; k < 4; k++) { const fx = x + (r() - 0.5) * 1.6, fz = z + (r() - 0.5) * 1.6; m.box(fx, y + 0.14, fz, 0.04, 0.28, 0.04, [0.2, 0.45, 0.18]); m.box(fx, y + 0.3, fz, 0.16, 0.1, 0.16, c); } };

// ---------------------------------------------------------------- buildings
const ROOFS = [[0.64, 0.24, 0.17], [0.3, 0.35, 0.42], [0.58, 0.4, 0.2], [0.42, 0.22, 0.24]];
const WALLS = [[0.86, 0.78, 0.62], [0.74, 0.66, 0.54], [0.9, 0.86, 0.78], [0.64, 0.7, 0.74]];
const SIGN = { merchant: [0.2, 0.6, 0.3], tavern: [0.75, 0.2, 0.15], shipwright: [0.2, 0.4, 0.8], sailor: [0.55, 0.55, 0.6], warden: [0.9, 0.95, 1], smith: [0.45, 0.46, 0.52], guard: [0.2, 0.3, 0.62] };
const DIRV = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
const WOOD = [0.5, 0.36, 0.22], DARKWOOD = [0.33, 0.22, 0.13], STONE = [0.5, 0.48, 0.46];

// Asgard's longhouses: dark timber walls with plank lines, steep turf or thatch roofs with an overhang, a carved dragon head at each end of the ridge, round shields along the walls, a smoke hole instead of a chimney
const AT_WALL = [[0.95, 0.94, 0.9], [0.9, 0.91, 0.88], [0.96, 0.92, 0.84]], AT_ROOF = [[0.98, 0.8, 0.3], [0.2, 0.6, 0.62], [0.96, 0.74, 0.26]]; // Atlantis: white walls, gold and sea-green roofs
const OL_WALL = [[0.93, 0.9, 0.82], [0.9, 0.86, 0.78], [0.95, 0.93, 0.87]], OL_ROOF = [[0.78, 0.4, 0.24], [0.96, 0.76, 0.28], [0.72, 0.36, 0.22]]; // Olympus: warm marble walls, terracotta and gold roofs
const VK_WALL = [[0.4, 0.27, 0.17], [0.33, 0.23, 0.15], [0.45, 0.31, 0.2]], VK_ROOF = [[0.36, 0.42, 0.26], [0.52, 0.44, 0.28], [0.3, 0.36, 0.3]], VK_SHIELD = [[0.7, 0.18, 0.15], [0.9, 0.75, 0.25], [0.2, 0.35, 0.6], [0.88, 0.86, 0.8], [0.15, 0.4, 0.25]];
function vikingTrim(m, b, y0, y1, ry, alongX) {
  const hw = b.w / 2, hd = b.d / 2, dk = [0.2, 0.13, 0.08], gold = [0.85, 0.7, 0.3];
  for (const e of [-1, 1]) { // a dragon head and a curled tail at the two ends of the ridge
    const ex = alongX ? b.x + e * (hw + 0.5) : b.x, ez = alongX ? b.z : b.z + e * (hd + 0.5), fx = alongX ? e : 0, fz = alongX ? 0 : e;
    m.box(ex, ry - 0.2, ez, alongX ? 0.28 : 0.28, 1.5, 0.28, dk); m.box(ex + fx * 0.15, ry + 0.75, ez + fz * 0.15, alongX ? 0.4 : 0.55, 0.55, alongX ? 0.55 : 0.4, dk); // post and neck
    m.box(ex + fx * 0.5, ry + 1.05, ez + fz * 0.5, alongX ? 0.8 : 0.4, 0.38, alongX ? 0.4 : 0.8, dk, 0.1); m.box(ex + fx * 0.55, ry + 0.82, ez + fz * 0.55, alongX ? 0.55 : 0.28, 0.16, alongX ? 0.28 : 0.55, gold); // head and jaw
    for (const q of [-1, 1]) m.box(ex + fx * 0.2 - (alongX ? 0 : q * 0.18), ry + 1.45, ez + fz * 0.2 + (alongX ? q * 0.18 : 0), 0.1, 0.4, 0.1, [0.9, 0.88, 0.8]); // horns
  }
  const n = Math.max(2, Math.floor((alongX ? b.w : b.d) / 2.4));
  for (let k = 0; k < n; k++) { const u = ((k + 0.5) / n - 0.5) * (alongX ? b.w : b.d) * 0.85, c = VK_SHIELD[(((k + Math.round(b.x + b.z)) % 5) + 5) % 5]; // round shields hung along the long walls
    for (const s of [-1, 1]) { if (alongX) m.box(b.x + u, y0 + b.h * 0.62, b.z + s * (hd + 0.1), 0.95, 0.95, 0.12, c); else m.box(b.x + s * (hw + 0.1), y0 + b.h * 0.62, b.z + u, 0.12, 0.95, 0.95, c); m.box(alongX ? b.x + u : b.x + s * (hw + 0.17), y0 + b.h * 0.62, alongX ? b.z + s * (hd + 0.17) : b.z + u, 0.28, 0.28, 0.28, gold); } }
  for (let k = 0; k < Math.floor((alongX ? b.w : b.d) / 0.9); k++) { const u = (k + 0.5) * 0.9 - (alongX ? hw : hd); for (const s of [-1, 1]) { if (alongX) m.box(b.x + u, y0 + b.h / 2, b.z + s * (hd + 0.03), 0.07, b.h, 0.05, dk); else m.box(b.x + s * (hw + 0.03), y0 + b.h / 2, b.z + u, 0.05, b.h, 0.07, dk); } } // plank seams
  m.box(b.x, ry + 0.15, b.z, alongX ? 1.4 : 0.9, 0.25, alongX ? 0.9 : 1.4, [0.1, 0.08, 0.07]); // smoke hole
}
// each kind of town has its own colours: weathered boards and thatch, bright plaster and red tile, or grey stone and slate
const STYLE_LOOK = {
  fishing: { wall: [[0.52, 0.39, 0.27], [0.4, 0.5, 0.52], [0.62, 0.52, 0.4]], roof: [[0.72, 0.6, 0.32], [0.62, 0.5, 0.26], [0.5, 0.44, 0.3]] },
  trade: { wall: [[0.96, 0.86, 0.6], [0.9, 0.6, 0.45], [0.72, 0.84, 0.94]], roof: [[0.76, 0.24, 0.16], [0.18, 0.4, 0.6], [0.7, 0.32, 0.14]] },
  fortress: { wall: [[0.56, 0.57, 0.62], [0.46, 0.46, 0.5], [0.64, 0.62, 0.6]], roof: [[0.22, 0.27, 0.36], [0.3, 0.3, 0.34], [0.2, 0.24, 0.3]] },
  mining: { wall: [[0.58, 0.44, 0.32], [0.64, 0.6, 0.54], [0.52, 0.44, 0.36]], roof: [[0.34, 0.32, 0.32], [0.44, 0.32, 0.24], [0.38, 0.38, 0.4]] }, // weathered timber and sooty slate
  smuggler: { wall: [[0.5, 0.42, 0.34], [0.44, 0.48, 0.46], [0.56, 0.46, 0.36]], roof: [[0.42, 0.44, 0.3], [0.36, 0.36, 0.38], [0.5, 0.38, 0.28]] }, // tarred planks, mossy thatch and old sailcloth
  temple: { wall: [[0.95, 0.93, 0.86], [0.92, 0.84, 0.7], [0.88, 0.9, 0.92]], roof: [[0.72, 0.36, 0.22], [0.66, 0.42, 0.26], [0.26, 0.4, 0.62]] }, // whitewash, terracotta and the odd blue dome-paint
};
function landmark(m, k, x, y, z, w, d, seed) {
  const wood = [0.42, 0.29, 0.18], dark = [0.24, 0.17, 0.11], stone = [0.55, 0.55, 0.6], cloth = [0.75, 0.18, 0.14];
  if (k === 'rack') { // drying racks hung with fish
    for (const s of [-1, 0, 1]) m.box(x + s * (w / 2 - 0.15), y + 1.3, z, 0.18, 2.6, 0.18, wood);
    for (const h of [2.45, 1.55]) m.box(x, y + h, z, w, 0.12, 0.12, wood);
    for (let i = 0; i < 9; i++) { const fx = x - w / 2 + 0.45 + i * ((w - 0.9) / 8), h = i % 2 ? 2.05 : 1.15; m.box(fx, y + h, z, 0.34, 0.68, 0.16, [0.92, 0.58, 0.34]); m.box(fx, y + h - 0.42, z, 0.5, 0.18, 0.12, [0.74, 0.36, 0.2]); }
  } else if (k === 'boat') { // a boat hauled up on blocks, a net heaped beside it
    for (const [dx, len, wid] of [[0, 3, 1.9], [1.9, 1.1, 1.3], [-1.9, 1.1, 1.5], [2.65, 0.5, 0.6]]) m.box(x + dx, y + 0.7, z, len, 0.8, wid, wood, 0.25);
    m.box(x, y + 1.14, z, 3.2, 0.08, 1.35, dark); for (const s of [-1, 1]) { m.box(x, y + 1.2, z + s * 0.95, 4.4, 0.16, 0.14, [0.62, 0.46, 0.28]); m.box(x + s * 1.3, y + 0.2, z, 0.5, 0.4, 1.4, dark); }
    m.blob(x - 1.2, y + 0.15, z + 1.7, 0.7, [0.55, 0.5, 0.36], 0.4);
  } else if (k === 'plot') { // a hamlet's crop plot: tilled rows of greens or grain inside a post-and-rail fence
    const crop = Math.abs(Math.round(x + z)) % 3 ? [0.34, 0.58, 0.26] : [0.84, 0.72, 0.32];
    m.box(x, y + 0.05, z, w - 0.3, 0.12, d - 0.3, [0.42, 0.3, 0.2]);
    for (let i = 0, n = Math.floor((d - 1) / 0.9); i < n; i++) m.box(x, y + 0.3, z - (n - 1) * 0.45 + i * 0.9, w - 1.2, 0.4, 0.42, crop);
    for (const [ax, az, len, alongX] of [[0, -d / 2, w, 1], [0, d / 2, w, 1], [-w / 2, 0, d, 0], [w / 2, 0, d, 0]]) {
      for (const hy of [0.5, 0.95]) m.box(x + ax, y + hy, z + az, alongX ? len : 0.1, 0.1, alongX ? 0.1 : len, wood);
      for (let p = 0, n = Math.max(2, Math.round(len / 1.6)); p <= n; p++) { const o = -len / 2 + (p * len) / n; m.box(x + ax + (alongX ? o : 0), y + 0.55, z + az + (alongX ? 0 : o), 0.16, 1.1, 0.16, dark); }
    }
  } else if (k === 'hall') { // an open market hall: four pillars, a tiled roof, counters of goods
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(x + sx * (w / 2 - 0.3), y + 1.9, z + sz * (d / 2 - 0.3), 0.55, 3.8, 0.55, [0.92, 0.88, 0.78]);
    const ex = w / 2 + 0.6, ez = d / 2 + 0.6, e = y + 3.7, ry = y + 5.6, red = [0.76, 0.24, 0.16], rd = [0.6, 0.18, 0.12];
    m.quad([x - ex, e, z - ez], [x + ex, e, z - ez], [x + ex, ry, z], [x - ex, ry, z], red); m.quad([x + ex, e, z + ez], [x - ex, e, z + ez], [x - ex, ry, z], [x + ex, ry, z], red);
    m.tri([x - w / 2, e, z - d / 2], [x - w / 2, ry - 0.2, z], [x - w / 2, e, z + d / 2], rd); m.tri([x + w / 2, e, z + d / 2], [x + w / 2, ry - 0.2, z], [x + w / 2, e, z - d / 2], rd);
    m.box(x, y + 0.55, z - d * 0.22, w * 0.55, 1.1, 0.9, wood); for (let i = 0; i < 7; i++) m.box(x - w * 0.24 + i * w * 0.08, y + 1.28, z - d * 0.22, 0.32, 0.34, 0.5, [[0.85, 0.3, 0.2], [0.95, 0.75, 0.2], [0.3, 0.65, 0.3], [0.4, 0.3, 0.7]][i % 4]);
    for (let i = -4; i <= 4; i++) m.box(x + i * (w / 9), e - 0.25, z + ez - 0.05, w / 10, 0.5, 0.1, i % 2 ? [0.95, 0.95, 0.9] : red);
  } else if (k === 'crane') { // a loading crane
    m.box(x, y + 0.4, z, 2.4, 0.8, 2.4, stone, 0.15); m.box(x, y + 3.6, z, 0.4, 6, 0.4, wood); m.box(x + 1.4, y + 6.5, z, 3.6, 0.3, 0.3, wood); m.box(x - 0.7, y + 5.7, z, 1.4, 0.2, 0.2, dark);
    m.line([x + 3, y + 6.4, z], [x + 3, y + 3, z], 0.08, [0.7, 0.62, 0.44]); m.box(x + 3, y + 2.5, z, 1, 1, 1, [0.66, 0.46, 0.26], 0.2);
  } else if (k === 'tower') { // a watchtower with battlements and the town banner
    m.box(x, y + 5, z, w - 0.8, 10, d - 0.8, stone, 0.2); m.box(x, y + 10.4, z, w, 0.8, d, [0.48, 0.48, 0.53]);
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { m.box(x - w / 2 + 0.5 + i * (w / 2 - 0.5), y + 11.4, z + s * (d / 2 - 0.3), 0.9, 1.2, 0.6, stone); m.box(x + s * (w / 2 - 0.3), y + 11.4, z - d / 2 + 0.5 + i * (d / 2 - 0.5), 0.6, 1.2, 0.9, stone); }
    m.box(x, y + 1.2, z + (d - 0.8) / 2 + 0.03, 1.2, 2.4, 0.08, dark); for (const h of [4.5, 7.5]) m.box(x, y + h, z + (d - 0.8) / 2 + 0.03, 0.3, 1, 0.08, [0.1, 0.1, 0.12]);
    m.box(x, y + 13.2, z, 0.16, 4.4, 0.16, wood); m.box(x + 0.85, y + 14.7, z, 1.6, 1.1, 0.08, cloth);
  } else if (k === 'mine' || k === 'cave') { // a heap of rock with a black mouth: a mine (timber frame, rails) or a smugglers' cave (a ragged mouth, kegs and crates outside); a lamp by the door
    const rk = [0.56, 0.54, 0.5], fz = z + d / 2, mine = k === 'mine';
    m.box(x, y + 1.3, z, w, 2.6, d, rk, 0.2); m.box(x - 0.4, y + 3.3, z - 0.3, w * 0.78, 1.4, d * 0.75, dim(rk, 0.9)); m.blob(x + 0.6, y + 4, z - 0.5, 2.2, dim(rk, 1.08), 0.6, 1.1, 0.8); for (const s of [-1, 1]) m.blob(x + s * (w / 2 - 0.5), y + 2.3, z + s * 0.4, 1.6, dim(rk, s > 0 ? 0.94 : 1.04), 0.75, 0.9, 1.1); // lumps that break up the box
    m.box(x, y + 1.15, fz + 0.03, 1.9, 2.3, 0.06, [0.05, 0.04, 0.05]);
    if (mine) { for (const s of [-1, 1]) m.box(x + s * 1.1, y + 1.25, fz + 0.15, 0.3, 2.5, 0.3, wood); m.box(x, y + 2.55, fz + 0.15, 2.7, 0.32, 0.36, wood);
      for (const s of [-0.45, 0.45]) m.box(x + s, y + 0.06, fz + 1.4, 0.1, 0.1, 2.8, [0.36, 0.34, 0.34]); for (let i = 0; i < 4; i++) m.box(x, y + 0.02, fz + 0.4 + i * 0.7, 1.2, 0.06, 0.2, dark); }
    else { m.box(x, y + 2.45, fz + 0.1, 1.3, 0.5, 0.2, dim(rk, 0.9)); for (const s of [-1, 1]) m.box(x + s * 1.05, y + 0.8, fz + 0.12, 0.5, 1.6, 0.24, dim(rk, 0.94)); // a ragged mouth
      for (const [dx, dz] of [[-2.1, 0.9], [-1.6, 1.5]]) { m.box(x + dx, y + 0.45, fz + dz, 0.7, 0.9, 0.7, [0.46, 0.3, 0.18], 0.3); m.box(x + dx, y + 0.45, fz + dz, 0.74, 0.1, 0.74, [0.3, 0.3, 0.32]); } // rum kegs
      m.box(x + 2.1, y + 0.4, fz + 1, 0.8, 0.8, 0.8, wood); m.box(x + 2.1, y + 1.05, fz + 1, 0.6, 0.5, 0.6, [0.56, 0.42, 0.26]); }
    m.box(x + 1.55, y + 1.9, fz + 0.2, 0.28, 0.36, 0.28, [1, 0.82, 0.36]);
  } else if (k === 'stash') { // contraband under a tarred tarp on four poles: crates and kegs, a lantern hung from the ridge
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(x + sx * (w / 2 - 0.15), y + 0.9, z + sz * (d / 2 - 0.15), 0.14, 1.8, 0.14, wood);
    m.box(x, y + 1.85, z, w + 0.3, 0.1, d + 0.3, [0.26, 0.28, 0.27]); m.box(x, y + 1.98, z, w + 0.1, 0.12, 0.3, [0.22, 0.24, 0.23]);
    for (const [dx, dz, s] of [[-0.9, -0.3, 0.9], [0.1, -0.4, 0.8], [-0.9, 0.5, 0.7], [-0.95, -0.3, 0.6]]) m.box(x + dx, y + s / 2 + (s === 0.6 ? 0.9 : 0), z + dz, s, s, s, s === 0.8 ? [0.56, 0.42, 0.26] : wood);
    for (const dz of [-0.4, 0.5]) { m.box(x + 1, y + 0.4, z + dz, 0.65, 0.8, 0.65, [0.46, 0.3, 0.18], 0.3); m.box(x + 1, y + 0.4, z + dz, 0.69, 0.1, 0.69, [0.3, 0.3, 0.32]); }
    m.box(x + ((seed % 3) - 1) * 0.5, y + 1.6, z, 0.24, 0.3, 0.24, [1, 0.82, 0.36]);
  } else if (k === 'temple') { // a pillared temple on a stepped plinth, its pediment to the front (+z): a dark door, braziers either side of the steps
    const mb = [0.9, 0.87, 0.8], tile = [0.72, 0.36, 0.22], fz = z + d / 2, e = y + 4.9, ry = y + 6.5, hx = w / 2 + 0.3, hz = d / 2 + 0.3;
    m.box(x, y + 0.3, z - 0.5, w, 0.6, d - 1, dim(mb, 0.92)); m.box(x, y + 0.2, fz - 0.5, w, 0.4, 1, dim(mb, 0.96)); // plinth, front step
    m.box(x, y + 2.6, z - 1, w - 2.6, 4, d - 3.4, [0.94, 0.9, 0.82]); m.box(x, y + 1.6, z - 1 + (d - 3.4) / 2 + 0.03, 1.3, 2, 0.06, [0.08, 0.06, 0.06]); // the cella and its door
    for (let i = 0; i < 4; i++) m.box(x - w / 2 + 0.6 + i * ((w - 1.2) / 3), y + 2.7, fz - 1.4, 0.55, 4.2, 0.55, mb); // the front colonnade
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) m.box(x + s * (w / 2 - 0.6), y + 2.7, z - d / 2 + 0.6 + i * 1.7, 0.5, 4.2, 0.5, dim(mb, 0.95));
    m.box(x, y + 4.95, z - 0.5, w + 0.2, 0.5, d - 0.6, dim(mb, 0.9)); for (let i = 0; i < 7; i++) m.box(x - w / 2 + 0.6 + i * ((w - 1.2) / 6), y + 4.95, z + d / 2 - 0.78, 0.4, 0.3, 0.06, [0.74, 0.6, 0.3]); // entablature and its gilt frieze
    m.quad([x + hx, e, z - hz], [x + hx, e, z + hz - 0.8], [x, ry, z + hz - 0.8], [x, ry, z - hz], tile); m.quad([x - hx, e, z + hz - 0.8], [x - hx, e, z - hz], [x, ry, z - hz], [x, ry, z + hz - 0.8], tile);
    m.tri([x + w / 2, e, z - d / 2], [x, ry - 0.2, z - d / 2], [x - w / 2, e, z - d / 2], dim(mb, 0.9)); m.tri([x - w / 2, e, fz - 0.8], [x, ry - 0.2, fz - 0.8], [x + w / 2, e, fz - 0.8], mb);
    m.box(x, y + 5.6, fz - 0.76, 0.5, 0.5, 0.06, [0.86, 0.68, 0.24]); // a gilt sun in the pediment
    for (const s of [-1, 1]) { m.box(x + s * (w / 2 - 0.5), y + 0.75, fz - 0.4, 0.5, 0.7, 0.5, [0.36, 0.34, 0.34]); m.box(x + s * (w / 2 - 0.5), y + 1.2, fz - 0.4, 0.34, 0.24, 0.34, [1, 0.6, 0.2]); } // braziers
  } else if (k === 'shrine') { // a wayside shrine: a robed figure on a plinth, candles and flowers laid at its feet
    const mb = [0.9, 0.87, 0.8];
    m.box(x, y + 0.4, z, w * 0.7, 0.8, d * 0.7, [0.6, 0.6, 0.62], 0.15); m.box(x, y + 1.6, z, 0.7, 1.6, 0.55, mb); m.box(x, y + 2.15, z + 0.1, 0.9, 0.5, 0.5, dim(mb, 0.94)); m.blob(x, y + 2.65, z, 0.3, mb, 0.9);
    for (const [dx, c] of [[-0.6, [1, 0.82, 0.36]], [0.55, [1, 0.82, 0.36]], [-0.25, [0.85, 0.3, 0.3]], [0.25, [0.95, 0.75, 0.2]]]) m.box(x + dx, y + 0.95, z + d * 0.28, 0.14, c[1] > 0.8 ? 0.3 : 0.14, 0.14, c);
  } else if (k === 'cart') { // an ore cart on a short run of rails, heaped with ore
    for (const s of [-0.45, 0.45]) m.box(x, y + 0.06, z + s, w, 0.1, 0.1, [0.36, 0.34, 0.34]); for (let i = 0; i < 6; i++) m.box(x - w / 2 + 0.3 + i * ((w - 0.6) / 5), y + 0.02, z, 0.2, 0.06, 1.3, dark);
    const cx = x + ((seed % 3) - 1) * 0.6; m.box(cx, y + 0.75, z, 1.6, 0.8, 1.1, [0.32, 0.3, 0.3], 0.15); for (const sx of [-0.5, 0.5]) for (const s of [-0.58, 0.58]) m.box(cx + sx, y + 0.25, z + s, 0.4, 0.4, 0.08, [0.14, 0.13, 0.14]);
    m.blob(cx - 0.3, y + 1.2, z, 0.5, [0.5, 0.34, 0.24], 0.7); m.blob(cx + 0.35, y + 1.2, z + 0.1, 0.42, [0.55, 0.52, 0.5], 0.7);

  }
}
function building(m, isl, b) {
  const vik = isl.theme === 'asgard', at = isl.theme === 'atlantis' ? [AT_WALL, AT_ROOF] : isl.theme === 'olympus' ? [OL_WALL, OL_ROOF] : null, sl = STYLE_LOOK[isl.style], wall = vik ? VK_WALL[b.roof % 3] : at ? at[0][b.roof % 3] : sl ? sl.wall[b.roof % 3] : isl.biome === 'frozen' ? [0.82, 0.84, 0.9] : WALLS[b.roof % 4], roof = vik ? VK_ROOF[b.roof % 3] : at ? at[1][b.roof % 3] : sl ? sl.roof[b.roof % 3] : ROOFS[b.roof], y0 = b.pad, y1 = y0 + b.h, hw = b.w / 2, hd = b.d / 2, trim = dim(wall, 1.12).map((v) => Math.min(1, v));
  m.box(b.x, y0 - 1.4, b.z, b.w + 0.4, 2.8, b.d + 0.4, [0.44, 0.42, 0.4]); // foundation reaches below the terrain on any slope
  if (!b.door) m.box(b.x, y0 + 0.3, b.z, b.w + 0.25, 0.6, b.d + 0.25, STONE, 0.15); // stone plinth (houses only: shops are hollow)
  if (b.door) {
    for (const [x0, x1, z0, z1] of b.solids) m.box((x0 + x1) / 2, y0 + b.h / 2, (z0 + z1) / 2, x1 - x0, b.h, z1 - z0, wall, 0.18);
    m.box(b.x, y0 + 0.05, b.z, b.w - 0.8, 0.14, b.d - 0.8, WOOD); // floor
    m.box(b.x, y1 - 0.6, b.z, 0.35, 0.35, 0.35, glow([1, 0.85, 0.45])); // lamp
    const [dx, dz] = DIRV[b.door], sc = SIGN[b.kind] || [0.5, 0.5, 0.5];
    m.box(b.x + dx * (hw + 0.1), y1 - 0.25, b.z + dz * (hd + 0.1), dx ? 0.2 : 3.4, 0.8, dz ? 0.2 : 3.4, sc); // sign over the door
    m.box(b.x + dx * (hw + 0.14), y1 - 0.25, b.z + dz * (hd + 0.14), dx ? 0.06 : 3.7, 1, dz ? 0.06 : 3.7, DARKWOOD);
    for (let k = -3; k <= 3; k++) { // striped awning over the doorway
      const o = k * 0.55, w = 0.55, c = (k & 1) ? sc : [0.95, 0.95, 0.92], px = (u) => [b.x + dx * (hw + u) - dz * o, 0, b.z + dz * (hd + u) + dx * o];
      const A = px(0), B = px(1.5), pw = (p, y) => [p[0] - dz * w / 2 * 0, y, p[2]];
      m.quad([A[0] + dz * w / 2, y1 - 0.7, A[2] - dx * w / 2], [A[0] - dz * w / 2, y1 - 0.7, A[2] + dx * w / 2], [B[0] - dz * w / 2, y1 - 1.4, B[2] + dx * w / 2], [B[0] + dz * w / 2, y1 - 1.4, B[2] - dx * w / 2], c); void pw;
    }
    for (const s of [-1, 1]) m.box(b.x + dx * (hw + 1.4) - dz * s * 1.55, y0 + 0.9, b.z + dz * (hd + 1.4) + dx * s * 1.55, 0.14, 1.8, 0.14, DARKWOOD); // awning posts
    const lp = [b.x + dx * (hw + 0.7) - dz * 1.9, y0 + 2.3, b.z + dz * (hd + 0.7) + dx * 1.9]; m.box(lp[0], lp[1], lp[2], 0.28, 0.36, 0.28, [1, 0.8, 0.35]); // lantern by the door
  } else {
    m.box(b.x, y0 + b.h / 2, b.z, b.w, b.h, b.d, wall, 0.18);
    m.box(b.x, y0 + b.h * 0.5, b.z, b.w + 0.12, 0.14, b.d + 0.12, trim); // string course
    const [dx, dz] = DIRV[b.face];
    m.box(b.x + dx * (hw + 0.04), y0 + 1.1, b.z + dz * (hd + 0.04), dx ? 0.12 : 1.5, 2.3, dz ? 0.12 : 1.5, trim); // door frame
    m.box(b.x + dx * (hw + 0.1), y0 + 1.05, b.z + dz * (hd + 0.1), dx ? 0.1 : 1.1, 2.1, dz ? 0.1 : 1.1, [0.34, 0.22, 0.12]); // door
    m.box(b.x + dx * (hw + 0.5), y0 + 0.15, b.z + dz * (hd + 0.5), dx ? 1 : 1.6, 0.3, dz ? 1 : 1.6, STONE); // step
    m.box(b.x + dx * (hw + 0.17), y0 + 1.0, b.z + dz * (hd + 0.17) - dz * 0 + 0, 0.06, 0.06, 0.06, [0.9, 0.75, 0.3]); // door knob
    const rr = rngFor(Math.round(b.x * 3 + b.z * 5), 2), shut = pick(rr, [[0.2, 0.4, 0.5], [0.45, 0.2, 0.18], [0.25, 0.4, 0.28]]);
    for (const k of vik ? [] : Object.keys(DIRV)) {
      const [wx, wz] = DIRV[k]; if (k === b.face) continue;
      for (const s of [-1, 1]) {
        const cx = b.x + wx * (hw + 0.05) + (wz ? s * b.w * 0.25 : 0), cz = b.z + wz * (hd + 0.05) + (wx ? s * b.d * 0.25 : 0), cy = y0 + b.h * 0.6;
        m.box(cx, cy, cz, wx ? 0.14 : 1.15, 1.1, wz ? 0.14 : 1.15, trim); // frame
        m.box(cx + wx * 0.05, cy, cz + wz * 0.05, wx ? 0.1 : 0.85, 0.85, wz ? 0.1 : 0.85, glow([0.28, 0.4, 0.55])); // glass
        m.box(cx + wx * 0.08, cy, cz + wz * 0.08, wx ? 0.1 : 0.06, 0.85, wz ? 0.1 : 0.06, trim); m.box(cx + wx * 0.08, cy, cz + wz * 0.08, wx ? 0.1 : 0.85, 0.06, wz ? 0.1 : 0.85, trim); // mullions
        for (const t of [-1, 1]) m.box(cx + wx * 0.1 + (wz ? t * 0.7 : 0), cy, cz + wz * 0.1 + (wx ? t * 0.7 : 0), wx ? 0.1 : 0.28, 1.1, wz ? 0.1 : 0.28, shut); // shutters
        if (rr() < 0.5) { m.box(cx + wx * 0.3, cy - 0.7, cz + wz * 0.3, wx ? 0.4 : 1, 0.25, wz ? 0.4 : 1, DARKWOOD); m.box(cx + wx * 0.3, cy - 0.5, cz + wz * 0.3, wx ? 0.3 : 0.9, 0.18, wz ? 0.3 : 0.9, pick(rr, FLOWERS)); } // flower box
      }
    }
  }
  const alongX = b.w >= b.d, ex = hw + 0.7, ez = hd + 0.7, rh = vik ? 1.9 + Math.min(hw, hd) * 0.9 : 1.3 + Math.min(hw, hd) * 0.55, ry = y1 + rh, rd = dim(roof, 0.82);
  if (alongX) {
    m.quadV([b.x - ex, y1 - 0.1, b.z - ez], [b.x + ex, y1 - 0.1, b.z - ez], [b.x + ex, ry, b.z], [b.x - ex, ry, b.z], roof, roof, rd, rd);
    m.quadV([b.x + ex, y1 - 0.1, b.z + ez], [b.x - ex, y1 - 0.1, b.z + ez], [b.x - ex, ry, b.z], [b.x + ex, ry, b.z], roof, roof, rd, rd);
    m.tri([b.x - hw, y1, b.z - hd], [b.x - hw, ry - 0.1, b.z], [b.x - hw, y1, b.z + hd], wall); m.tri([b.x + hw, y1, b.z + hd], [b.x + hw, ry - 0.1, b.z], [b.x + hw, y1, b.z - hd], wall);
    m.box(b.x, ry + 0.05, b.z, ex * 2 + 0.2, 0.18, 0.28, dim(roof, 0.7)); // ridge cap
  } else {
    m.quadV([b.x - ex, y1 - 0.1, b.z + ez], [b.x - ex, y1 - 0.1, b.z - ez], [b.x, ry, b.z - ez], [b.x, ry, b.z + ez], roof, roof, rd, rd);
    m.quadV([b.x + ex, y1 - 0.1, b.z - ez], [b.x + ex, y1 - 0.1, b.z + ez], [b.x, ry, b.z + ez], [b.x, ry, b.z - ez], roof, roof, rd, rd);
    m.tri([b.x + hw, y1, b.z - hd], [b.x, ry - 0.1, b.z - hd], [b.x - hw, y1, b.z - hd], wall); m.tri([b.x - hw, y1, b.z + hd], [b.x, ry - 0.1, b.z + hd], [b.x + hw, y1, b.z + hd], wall);
    m.box(b.x, ry + 0.05, b.z, 0.28, 0.18, ez * 2 + 0.2, dim(roof, 0.7));
  }
  if (b.kind === 'guard') { // a tall flag, to pick the station (and its jail) out from across town
    m.box(b.x, ry + 2, b.z, 0.2, 4.4, 0.2, DARKWOOD); m.box(b.x + 1.2, ry + 3.4, b.z, 2.2, 1.4, 0.1, [0.22, 0.42, 0.86]); m.box(b.x + 1.2, ry + 3.4, b.z, 2.2, 0.3, 0.14, [0.92, 0.75, 0.24]);
  }
  if (vik) vikingTrim(m, b, y0, y1, ry, alongX);
  else if (!b.door && (b.w > 5 || isl.hamlet)) { m.box(b.x + hw * 0.5, ry + 0.1, b.z + hd * 0.3, 0.9, 1.9, 0.9, [0.45, 0.4, 0.38], 0.1); m.box(b.x + hw * 0.5, ry + 1.1, b.z + hd * 0.3, 1.1, 0.2, 1.1, [0.3, 0.28, 0.27]); } // chimney with cap (every hamlet house has one: its smoke is drawn in main.js)
}

// the plaza: a well, market stalls, lamp posts, benches. Rings are kept clear so townsfolk can walk around them.
function plazaProps(m, isl, town) {
  const p = town.plaza, y = p.y, r = rngFor(isl.seed, 11);
  m.box(p.x, y + 0.5, p.z, 2.4, 1, 2.4, STONE, 0.2); m.box(p.x, y + 0.98, p.z, 1.7, 0.1, 1.7, [0.1, 0.18, 0.3]); // well
  for (const s of [-1, 1]) m.box(p.x, y + 1.5, p.z + s * 1.1, 0.14, 1.8, 0.14, DARKWOOD);
  m.box(p.x, y + 2.45, p.z, 0.3, 0.15, 2.7, DARKWOOD); m.quad([p.x - 0.8, y + 2.45, p.z - 1.45], [p.x - 0.8, y + 2.45, p.z + 1.45], [p.x, y + 3.1, p.z + 1.45], [p.x, y + 3.1, p.z - 1.45], ROOFS[0]); m.quad([p.x + 0.8, y + 2.45, p.z + 1.45], [p.x + 0.8, y + 2.45, p.z - 1.45], [p.x, y + 3.1, p.z - 1.45], [p.x, y + 3.1, p.z + 1.45], dim(ROOFS[0], 0.85));
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + Math.PI / 4, x = p.x + Math.cos(a) * 6.3, z = p.z + Math.sin(a) * 6.3; m.box(x, y + 1.7, z, 0.18, 3.4, 0.18, [0.2, 0.2, 0.22]); m.box(x, y + 3.55, z, 0.5, 0.5, 0.5, glow([1, 0.85, 0.45])); } // lamp posts
  const stalls = isl.tier === 'village' ? 1 : isl.tier === 'town' ? 2 : 4, cols = [[0.85, 0.3, 0.25], [0.25, 0.5, 0.8], [0.9, 0.75, 0.25], [0.3, 0.65, 0.4]];
  for (let k = 0; k < stalls; k++) {
    const a = (k / stalls) * TAU + 0.35, x = p.x + Math.cos(a) * 6.2, z = p.z + Math.sin(a) * 6.2, c = cols[k % 4];
    for (const [ox, oz] of [[-1.1, -0.8], [1.1, -0.8], [-1.1, 0.8], [1.1, 0.8]]) m.box(x + ox, y + 1.2, z + oz, 0.12, 2.4, 0.12, DARKWOOD);
    for (let s = -4; s <= 3; s++) m.quad([x - 1.4, y + 2.4, z + s * 0.2], [x - 1.4, y + 2.4, z + s * 0.2 + 0.2], [x + 1.4, y + 2.9, z + s * 0.2 + 0.2], [x + 1.4, y + 2.9, z + s * 0.2], s & 1 ? c : [0.95, 0.95, 0.9]);
    m.box(x, y + 0.5, z, 2, 1, 1.1, WOOD, 0.2);
    for (let g = -2; g <= 2; g++) m.box(x + g * 0.35, y + 1.15, z, 0.28, 0.3, 0.35, pick(r, [[0.85, 0.25, 0.2], [0.9, 0.75, 0.2], [0.35, 0.6, 0.25], [0.8, 0.5, 0.15]])); // goods
  }
  for (const s of [-1, 1]) { m.box(p.x + s * 3.4, y + 0.28, p.z + 4.6, 1.6, 0.1, 0.5, WOOD); for (const e of [-0.6, 0.6]) m.box(p.x + s * 3.4 + e, y + 0.14, p.z + 4.6, 0.1, 0.28, 0.4, DARKWOOD); } // benches
}

// ---------------------------------------------------------------- islands
// built in two pieces (bare ground, then everything standing on it) so a big city is never made in a single frame
export const islandMesh = (isl) => ({ ground: islandGround(isl), structs: islandStructs(isl) });
export function islandGround(isl) { const it = islandGroundSteps(isl); for (;;) { const r = it.next(); if (r.done) return r.value; } }
// the ground pauses between its heavy stages (heights, colours, rows of triangles) so the caller can spread it over several frames
export function* islandGroundSteps(isl) {
  const m = new Mesh(), town = islandTown(isl), ext = isl.r * 1.5, N = clamp(Math.round((ext * 2) / (isl.port || town.yard ? 4.5 : 6)), 24, 72), st = (ext * 2) / N, W = N + 1, H = new Float32Array(W * W);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { H[j * W + i] = Math.max(-2, islandHeight(isl, isl.x - ext + i * st, isl.z - ext + j * st)); if (i === N && j % 24 === 23) yield; }
  yield;
  const h = (i, j) => H[clamp(j, 0, N) * W + clamp(i, 0, N)];
  const P = (i, j) => [isl.x - ext + i * st, h(i, j), isl.z - ext + j * st];
  const NR = (i, j) => { const nx = h(i - 1, j) - h(i + 1, j), nz = h(i, j - 1) - h(i, j + 1), l = Math.hypot(nx, 2 * st, nz); return [nx / l, (2 * st) / l, nz / l]; };
  const pl = town.plaza;
  // colour of the ground at a point: biome by height and slope, grass tufts, shoreline foam, cobbled plaza, dirt path, contact shadow by buildings
  const colorAt = (x, y, z, nrm) => {
    let c = terrainColor(isl, y, 1 - nrm[1]);
    c = dim(c, 0.94 + 0.12 * fbm(isl.seed + 3, x * 0.03, z * 0.03, 1)); // gentle large-scale tint only: no fine noise that shimmers
    if (y < 0.35 && y > -1.3) c = lerp3(c, [0.95, 0.98, 1], clamp((1 - Math.abs(y + 0.45) / 0.85) * 0.6, 0, 0.6));
    if (isl.port || town.yard) {
      if (town.yard) { const d = Math.hypot(x - town.yard.x, z - town.yard.z); if (d < 5.5) c = lerp3(c, [0.6, 0.5, 0.36], sstep(5.5, 4.2, d)); } // a hamlet's trodden yard
      if (pl) { const d = Math.hypot(x - pl.x, z - pl.z); if (d < 10.2) c = lerp3(c, [0.62, 0.6, 0.56], sstep(10.2, 8.6, d)); }
      const pd = pathDist(isl, x, z); if (pd < 2 && y > 0.4) c = lerp3(c, [0.64, 0.54, 0.38], 1 - sstep(1.0, 2.0, pd));
      for (const b of town.buildings) { const d = Math.max(Math.abs(x - b.x) - b.w / 2, Math.abs(z - b.z) - b.d / 2); if (d < 3.2) c = dim(c, 0.74 + 0.26 * sstep(0, 3.2, Math.max(d, 0))); }
    }
    return c.map((v) => Math.min(1, v));
  };
  const VC = new Array(W * W), VN = new Array(W * W);
  for (let j = 0; j <= N; j++) { for (let i = 0; i <= N; i++) { const p = P(i, j), nrm = NR(i, j); VN[j * W + i] = nrm; VC[j * W + i] = colorAt(p[0], p[1], p[2], nrm); } if (j % 24 === 23) yield; }
  yield;
  const V = (i, j) => [P(i, j), VC[j * W + i], VN[j * W + i]];
  const tri = (a, b, c) => { const A = V(...a), B = V(...b), C = V(...c); m.triN(A[0], B[0], C[0], A[1], B[1], C[1], A[2], B[2], C[2]); };
  // finer cells wherever a building stands, so the ground meets the walls and floors exactly (no terrain poking through a shop floor)
  const vtx = (x, z, yy) => { const y = yy ?? Math.max(-2, islandHeight(isl, x, z)), e = 0.7, nx = islandHeight(isl, x - e, z) - islandHeight(isl, x + e, z), nz = islandHeight(isl, x, z - e) - islandHeight(isl, x, z + e), l = Math.hypot(nx, 2 * e, nz), nrm = [nx / l, (2 * e) / l, nz / l]; return [[x, y, z], colorAt(x, y, z, nrm), nrm]; };
  const nearBuilding = (x0, z0, x1, z1) => town.buildings.some((b) => x1 > b.x - b.w / 2 - 2.2 && x0 < b.x + b.w / 2 + 2.2 && z1 > b.z - b.d / 2 - 2.2 && z0 < b.z + b.d / 2 + 2.2);
  const fine = new Map(); // fine-grid points on an edge shared by two cells are worked out once
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (i === 0 && j % 12 === 11) yield;
    if (Math.max(h(i, j), h(i + 1, j), h(i + 1, j + 1), h(i, j + 1)) < -1.5) continue;
    const x0 = isl.x - ext + i * st, z0 = isl.z - ext + j * st;
    if ((isl.port || town.yard) && nearBuilding(x0, z0, x0 + st, z0 + st)) {
      const S = 3, make = (a, b) => vtx(x0 + (a * st) / S, z0 + (b * st) / S, a === 0 || b === 0 || a === S || b === S ? (h(i, j) * (S - a) + h(i + 1, j) * a) / S * (S - b) / S + (h(i, j + 1) * (S - a) + h(i + 1, j + 1) * a) / S * b / S : undefined), G = [];
      const q = (a, b) => { const key = (j * S + b) * (N * S + 1) + i * S + a; let v = fine.get(key); if (!v) fine.set(key, (v = make(a, b))); return v; };
      for (let b2 = 0; b2 <= S; b2++) for (let a2 = 0; a2 <= S; a2++) G.push(q(a2, b2));
      const g = (a2, b2) => G[b2 * (S + 1) + a2];
      for (let b2 = 0; b2 < S; b2++) for (let a2 = 0; a2 < S; a2++) {
        const A = g(a2, b2), B = g(a2 + 1, b2), C = g(a2 + 1, b2 + 1), D = g(a2, b2 + 1);
        m.triN(A[0], D[0], C[0], A[1], D[1], C[1], A[2], D[2], C[2]); m.triN(A[0], C[0], B[0], A[1], C[1], B[1], A[2], C[2], B[2]);
      }
    } else { tri([i, j], [i, j + 1], [i + 1, j + 1]); tri([i, j], [i + 1, j + 1], [i + 1, j]); }
  }
  return m;
}
// everything built on the ground: buildings and the dock (these get crease outlines, the ground does not)
export function islandStructs(isl) {
  const m = new Mesh(), town = islandTown(isl);
  for (const b of town.buildings) building(m, isl, b);
  for (const q of town.marks || []) { m.box(q.x, q.pad - 1.2, q.z, q.w, 2.4, q.d, [0.46, 0.43, 0.38]); landmark(m, q.k, q.x, q.pad, q.z, q.w, q.d, isl.seed); } // each stands on its own footing
  if (isl.port) { // dock: planks, pilings, lanterns, crates, barrels, rope
    const d = isl.port.dock, len = Math.hypot(d.x1 - d.x0, d.z1 - d.z0), n = Math.ceil(len / 2) + 1, ux = (d.x1 - d.x0) / len, uz = (d.z1 - d.z0) / len, rr = rngFor(isl.seed, 12);
    for (let k = 0; k < n; k++) {
      const x = d.x0 + ux * k * 2, z = d.z0 + uz * k * 2, c = k % 2 ? [0.45, 0.32, 0.2] : [0.52, 0.38, 0.23];
      const dy = DOCK_Y - 0.05; m.quadV([x - uz * 1.7 - ux, dy, z + ux * 1.7 - uz], [x + uz * 1.7 - ux, dy, z - ux * 1.7 - uz], [x + uz * 1.7 + ux, dy, z - ux * 1.7 + uz], [x - uz * 1.7 + ux, dy, z + ux * 1.7 + uz], c, c, dim(c, 1.1), dim(c, 1.1));
      if (k % 2 === 0) for (const s of [-1, 1]) m.box(x - uz * 1.8 * s, (DOCK_Y + 0.3 - 1.8) / 2, z + ux * 1.8 * s, 0.36, DOCK_Y + 2.1, 0.36, [0.28, 0.2, 0.13]);
    }
  }
  return m;
}

// ---------------------------------------------------------------- ice wall: a continuous cliff, same height all the way round, banded deep blue to white, with an overhanging snow lip, icicles and rubble at the foot.
// One stretch (the weak spot, `gateAngle`) is paler and cracked. Once the ram has broken it (`open`) the wall is gone there and the edges are ragged.
// With `rune` ({ ang, arc, realm }) it is a world's gate instead: only `arc` either side of `ang`, tapering at the ends: Asgard's black stone with a green veil of runes, or Atlantis's white coral with a curtain of falling water.
const GATE_PAL = {
  terra: [[[0.2, 0.44, 0.8], [0.36, 0.62, 0.92], [0.64, 0.84, 0.98], [0.94, 0.98, 1]], [[0.5, 0.82, 0.95], [0.66, 0.9, 0.98], [0.8, 0.95, 1], [0.97, 0.99, 1]]],
  asgard: [[[0.13, 0.13, 0.17], [0.2, 0.21, 0.26], [0.3, 0.31, 0.37], [0.9, 0.94, 0.98]], [[0.2, 0.62, 0.48], [0.3, 0.78, 0.6], [0.5, 0.9, 0.74], [0.74, 0.98, 0.88]]],
  atlantis: [[[0.7, 0.5, 0.46], [0.86, 0.68, 0.6], [0.94, 0.86, 0.78], [0.99, 0.97, 0.92]], [[0.36, 0.76, 0.82], [0.5, 0.86, 0.9], [0.7, 0.94, 0.96], [0.9, 0.99, 1]]],
};
export function wallMesh(seed, sx, sz, open = false, rune = null) {
  const x0 = sx * SECTOR - 40, x1 = (sx + 1) * SECTOR + 40, z0 = sz * SECTOR - 40, z1 = (sz + 1) * SECTOR + 40;
  const near = Math.hypot(clamp(0, x0, x1), clamp(0, z0, z1)), far = Math.max(Math.hypot(x0, z0), Math.hypot(x1, z0), Math.hypot(x0, z1), Math.hypot(x1, z1));
  if (near > WALL_R + 30 || far < WALL_R - 30) return null;
  const m = new Mesh(), da = 22 / WALL_R, g = rune ? rune.ang : gateAngle(seed), WI = WALL_R - 6, WO = WALL_R + 8, F = [0, 0.25, 0.5, 0.8, 1], RAD = [0, 0, 3, 8, 9];
  const gdOf = (a) => Math.abs(((a - g + Math.PI * 3) % TAU) - Math.PI) * WALL_R;
  const H = (a) => { const gd = gdOf(a); let h = 150 + 50 * fbm(seed, a * 260, 5, 3) + 12 * Math.sin(a * 900); if (open && gd < GATE_HALF + 36) h *= 0.12 + 0.88 * clamp((gd - GATE_HALF) / 36, 0, 1) ** 1.5 * (0.7 + 0.6 * fbm(seed, a * 1500, 3, 2)); return rune ? h * (1 - 0.6 * (gd / rune.arc) ** 3) : h; };
  const [BAND, WEAK] = GATE_PAL[rune ? (rune.realm === 'atlantis' ? 'atlantis' : 'asgard') : 'terra']; // base to top, flat colours: the cliffs, and the weak spot or veil
  const V = (rad, ang, y) => [Math.cos(ang) * rad, y, Math.sin(ang) * rad];
  for (let a = 0, k = 0; a < TAU; a += da, k++) {
    const px = Math.cos(a) * WALL_R, pz = Math.sin(a) * WALL_R;
    if (px < x0 || px > x1 || pz < z0 || pz > z1) continue;
    const b = a + da, gd = gdOf(a), weak = gd < GATE_HALF;
    if (rune && gd > rune.arc) continue;
    if (open && weak) { // the breach: only a ragged rubble heap at the waterline
      if (fbm(seed, a * 700, 3, 2) > 0.45) m.box(Math.cos(a + da / 2) * WALL_R, 1.2, Math.sin(a + da / 2) * WALL_R, 9, 5, 9, rune ? BAND[1] : [0.82, 0.93, 1]);
      continue;
    }
    const h0 = H(a), h1 = H(b), pal = weak ? WEAK : BAND, crack = weak && k % 3 === 0;
    for (let i = 0; i < 4; i++) {
      const jit = (k % 2 ? 0.82 : 0.94) + 0.12 * fbm(seed, a * 400 + i * 7, 2, 2), c = (crack && i < 3 ? pal[i].map((v) => v * 0.62) : pal[i].map((v) => Math.min(1, v * jit))), ci = pal[i].map((v) => Math.min(1, v * 0.97));
      const y = (h, f) => -3 + (h + 3) * f;
      m.quad(V(WI, a, y(h0, F[i])), V(WI, b, y(h1, F[i])), V(WI, b, y(h1, F[i + 1])), V(WI, a, y(h0, F[i + 1])), ci);
      m.quad(V(WO + RAD[i], b, y(h1, F[i])), V(WO + RAD[i], a, y(h0, F[i])), V(WO + RAD[i + 1], a, y(h0, F[i + 1])), V(WO + RAD[i + 1], b, y(h1, F[i + 1])), c);
    }
    m.quad(V(WI, a, h0), V(WI, b, h1), V(WO + 9, b, h1), V(WO + 9, a, h0), [0.97, 0.99, 1]); // snow lip
    const sp = fbm(seed, a * 130, 3, 2); if (sp > 0.6) { const hh = 26 + 70 * (sp - 0.6) * 2.5, cx = Math.cos(a + da / 2) * (WO + 2), cz = Math.sin(a + da / 2) * (WO + 2); m.box(cx, Math.max(h0, h1) + hh / 2 - 4, cz, 13, hh, 13, [0.9, 0.96, 1]); m.box(cx, Math.max(h0, h1) + hh - 2, cz, 7, 12, 7, [1, 1, 1]); } // tall spires break the skyline from far away
    const n = fbm(seed, a * 900, 3, 2); // icicles under the lip and ice rubble at the foot
    if (n > 0.5) m.tri(V(WO + 9, a, h0 - 3), V(WO + 9, b, h1 - 3), V(WO + 8, (a + b) / 2, Math.min(h0, h1) - 14 - 20 * n), [0.86, 0.95, 1]);
    if (n < 0.42) m.box(Math.cos(a + da / 2) * (WO + 5), 1.5, Math.sin(a + da / 2) * (WO + 5), 7 + 8 * n, 4 + 6 * n, 7, [0.78, 0.9, 1]);
  }
  return m.count ? m : null;
}

// ---------------------------------------------------------------- people: seeded variety (skin, hair, clothes, hats) + a prop per trade. Feet at y=0, facing +x.
const SKIN = [[0.96, 0.8, 0.69], [0.87, 0.68, 0.52], [0.68, 0.48, 0.34], [0.46, 0.32, 0.24]];
const HAIR = [[0.12, 0.09, 0.07], [0.35, 0.22, 0.1], [0.7, 0.55, 0.25], [0.55, 0.55, 0.58], [0.5, 0.2, 0.1]];
const CLOTH = { merchant: [[0.2, 0.5, 0.3], [0.25, 0.45, 0.35]], tavern: [[0.62, 0.22, 0.2], [0.7, 0.3, 0.2]], shipwright: [[0.2, 0.35, 0.65], [0.3, 0.4, 0.6]], sailor: [[0.45, 0.5, 0.6], [0.4, 0.45, 0.5]], warden: [[0.86, 0.9, 0.95], [0.78, 0.84, 0.9]], villager: [[0.7, 0.4, 0.3], [0.3, 0.5, 0.6], [0.6, 0.55, 0.3], [0.5, 0.35, 0.55], [0.35, 0.55, 0.4], [0.8, 0.7, 0.5]] };
export function npcMesh(kind, seed = 0) {
  const m = new Mesh(), r = rngFor(seed, kind.length * 31), skin = pick(r, SKIN), hair = pick(r, HAIR), cl = pick(r, CLOTH[kind] || CLOTH.villager), pants = pick(r, [[0.22, 0.2, 0.26], [0.3, 0.26, 0.2], [0.2, 0.26, 0.3]]), boot = [0.16, 0.11, 0.08], sk2 = dim(skin, 0.88);
  const tall = range(r, 0.95, 1.08), by = (y) => y * tall;
  for (const s of [-1, 1]) { m.box(0, by(0.46), s * 0.11, 0.2, by(0.86), 0.19, pants); m.box(0.05, 0.07, s * 0.11, 0.32, 0.14, 0.22, boot); }
  m.box(0, by(1.18), 0, 0.34, by(0.62), 0.5, cl, 0.12); m.box(0, by(0.9), 0, 0.37, 0.08, 0.53, [0.22, 0.14, 0.08]); m.box(0.19, by(0.9), 0, 0.04, 0.07, 0.08, [0.85, 0.7, 0.3]); // torso, belt, buckle
  for (const s of [-1, 1]) { m.box(0, by(1.2), s * 0.34, 0.16, by(0.58), 0.16, dim(cl, 0.92)); m.box(0, by(0.86), s * 0.34, 0.13, 0.14, 0.13, skin); }
  m.box(0, by(1.58), 0, 0.12, 0.1, 0.14, sk2); // neck
  m.box(0, by(1.76), 0, 0.3, 0.34, 0.3, skin);
  for (const s of [-1, 1]) { m.box(0.155, by(1.8), s * 0.075, 0.03, 0.05, 0.05, [0.05, 0.05, 0.08]); m.box(0.16, by(1.84), s * 0.075, 0.03, 0.025, 0.07, dim(hair, 0.8)); m.box(0, by(1.76), s * 0.155, 0.06, 0.1, 0.03, sk2); } // eyes, brows, ears
  m.box(0.17, by(1.73), 0, 0.05, 0.08, 0.05, sk2); m.box(0.155, by(1.66), 0, 0.03, 0.025, 0.12, dim(skin, 0.7)); // nose, mouth
  const style = (r() * 3) | 0;
  if (style === 0) { m.box(-0.01, by(1.96), 0, 0.33, 0.1, 0.33, hair); m.box(-0.14, by(1.8), 0, 0.06, 0.28, 0.32, hair); }
  else if (style === 1) { m.box(-0.01, by(1.96), 0, 0.33, 0.1, 0.33, hair); m.box(-0.14, by(1.7), 0, 0.08, 0.5, 0.34, hair); m.box(0, by(1.9), 0.17, 0.3, 0.3, 0.05, hair); m.box(0, by(1.9), -0.17, 0.3, 0.3, 0.05, hair); }
  else m.box(-0.01, by(1.95), 0, 0.32, 0.07, 0.32, hair);
  const brown = [0.42, 0.28, 0.16];
  switch (kind) {
    case 'merchant': m.box(0, by(2.0), 0, 0.64, 0.05, 0.64, [0.85, 0.74, 0.4]); m.box(0, by(2.07), 0, 0.32, 0.12, 0.32, [0.82, 0.7, 0.36]); m.box(-0.05, by(0.82), 0.42, 0.24, 0.26, 0.12, brown); m.box(0, by(1.1), 0.18, 0.04, 0.8, 0.04, brown); break; // straw hat, satchel + strap
    case 'tavern': m.box(0.2, by(0.95), 0, 0.04, 0.55, 0.4, [0.96, 0.96, 0.94]); m.box(0.08, by(0.86), 0.42, 0.1, 0.16, 0.1, [0.75, 0.58, 0.28]); m.box(0, by(2.0), 0, 0.34, 0.06, 0.34, [0.9, 0.9, 0.88]); break; // apron, mug, kerchief
    case 'shipwright': m.box(0, by(2.0), 0, 0.38, 0.12, 0.38, [0.95, 0.8, 0.1]); m.box(0.05, by(1.96), 0, 0.44, 0.04, 0.44, [0.9, 0.74, 0.08]); m.box(0.1, by(0.8), -0.42, 0.05, 0.42, 0.05, brown); m.box(0.1, by(1.03), -0.42, 0.16, 0.08, 0.1, [0.5, 0.5, 0.52]); m.box(0, by(0.78), 0.2, 0.2, 0.3, 0.05, [0.35, 0.25, 0.15]); break; // hard hat, hammer, tool pouch
    case 'sailor': m.box(0, by(2.0), 0, 0.42, 0.16, 0.42, [0.95, 0.8, 0.2]); m.box(-0.12, by(1.92), 0, 0.2, 0.06, 0.5, [0.95, 0.8, 0.2]); m.box(0.14, by(1.62), 0, 0.09, 0.22, 0.24, [0.86, 0.86, 0.86]); m.box(0.18, by(1.72), 0.14, 0.12, 0.04, 0.04, [0.3, 0.2, 0.1]); break; // sou'wester, beard, pipe
    case 'warden': m.box(-0.08, by(1.88), 0, 0.34, 0.42, 0.5, [0.95, 0.97, 1]); m.box(0, by(2.06), 0, 0.42, 0.1, 0.46, [0.95, 0.97, 1]); m.box(0.14, by(1.62), 0, 0.09, 0.2, 0.22, [0.9, 0.92, 0.95]); m.box(0.12, by(1.0), 0.5, 0.05, 2.1, 0.05, [0.4, 0.3, 0.2]); m.box(0.12, by(2.1), 0.5, 0.14, 0.14, 0.14, [0.5, 0.9, 1]); m.box(0, by(1.4), 0, 0.4, 0.14, 0.58, [0.95, 0.97, 1]); break; // fur hood, staff with a glowing crystal, collar
    default: { const k = (r() * 4) | 0; if (k === 0) { m.box(0, by(2.0), 0, 0.36, 0.1, 0.36, pick(r, [[0.3, 0.3, 0.35], [0.5, 0.25, 0.2]])); m.box(0.1, by(1.97), 0, 0.12, 0.04, 0.34, [0.25, 0.25, 0.3]); } else if (k === 1) m.box(-0.06, by(0.9), 0.38, 0.3, 0.34, 0.14, brown); }
  }
  return m;
}

// ---------------------------------------------------------------- ships (bow at +x). Every ship is built from parameters, so enemies look different but always the same.
const LOOKS = {
  player: { hull: [0.4, 0.26, 0.14], sail: [0.95, 0.93, 0.85], accent: [0.15, 0.4, 0.8] },
  trader: { hull: [0.45, 0.3, 0.18], sail: [0.88, 0.8, 0.62], accent: [0.8, 0.7, 0.2] },
  navy: { hull: [0.2, 0.2, 0.26], sail: [0.95, 0.95, 0.98], accent: [0.75, 0.12, 0.12] },
  raider: { hull: [0.13, 0.11, 0.11], sail: [0.17, 0.16, 0.18], accent: [0.1, 0.1, 0.1] },
  ghost: { hull: [0.5, 0.62, 0.7], sail: [0.75, 0.9, 0.95], accent: [0.4, 0.9, 1] },
};
// each enemy kind has its own silhouette: merchantmen are fat and round, navy cutters long and lean with a red belt, raiders low and black with triangular sails and a skull flag, ghost ships tall and tattered
const SHAPES = { trader: { L: [7, 9], B: [3.7, 4.4], masts: [1, 2], guns: 2 }, navy: { L: [11, 13], B: [2.3, 2.7], masts: [2, 3], guns: 7 }, raider: { L: [9, 11], B: [2, 2.4], masts: [1, 2], guns: 3 }, ghost: { L: [11, 14], B: [2.6, 3.2], masts: [2, 3], guns: 5 }, draugr: { L: [11, 13], B: [2.6, 3], masts: [1, 1], guns: 4 } };
const VK_LOOK = { trader: { hull: [0.46, 0.33, 0.2], sail: [0.86, 0.83, 0.72], accent: [0.6, 0.2, 0.16] }, raider: { hull: [0.13, 0.11, 0.11], sail: [0.6, 0.14, 0.12], accent: [0.1, 0.1, 0.1] }, navy: { hull: [0.32, 0.21, 0.14], sail: [0.88, 0.86, 0.8], accent: [0.7, 0.16, 0.14] }, ghost: { hull: [0.62, 0.68, 0.74], sail: [0.72, 0.78, 0.84], accent: [0.5, 0.6, 0.7] }, draugr: { hull: [0.24, 0.3, 0.27], sail: [0.55, 0.68, 0.58], accent: [0.4, 0.95, 0.55] } };
// cls 'v' = the ship of Asgard (any non-player kind): a longship
export function shipParams(seed, kind = 'trader', cls = '') {
  if (cls === 'v' && kind !== 'player') { const p = shipParams0(seed, kind, ''), v = VK_LOOK[kind] || VK_LOOK.trader; return { ...p, ...v, viking: true, masts: 1, lateen: false, tri: false, jib: false, crates: false, tatter: kind === 'ghost' || kind === 'draugr', B: p.B * 0.85 }; }
  return shipParams0(seed, kind, cls === 'v' ? '' : cls);
}
function shipParams0(seed, kind = 'trader', cls = '') {
  const r = rngFor(seed, 9), look = LOOKS[kind] || LOOKS.trader;
  if (kind === 'player') { const c = SHIPS[cls] || SHIPS.sailboat; return { L: c.L, B: c.B, masts: c.masts, guns: c.ports, high: cls === 'galleon', tri: cls === 'sailboat' || cls === 'cutter', jib: cls !== 'sailboat', stripe: look.accent, kind, seed, ...look }; }
  const sh = SHAPES[kind] || SHAPES.trader;
  return { L: range(r, sh.L[0], sh.L[1]), B: range(r, sh.B[0], sh.B[1]), masts: sh.masts[0] + ((r() * (sh.masts[1] - sh.masts[0] + 1)) | 0), guns: sh.guns, lateen: kind === 'raider', tatter: kind === 'ghost', crates: kind === 'trader', stripe: kind === 'navy' ? look.accent : kind === 'raider' ? [0.45, 0.07, 0.07] : null, kind, seed, ...look };
}
// sailOut: when given, each mast's sails go into their own mesh (pivoting at the mast) so the renderer can swing them with the trim
// the longship of Asgard: a low clinker hull with a high dragon prow and a curled stern, shields along the rail, oars, one big striped square sail
function longshipMesh(p, sailOut) {
  const m = new Mesh(), { L, B, hull } = p, XS = 14, up = (c, k) => c.map((v) => Math.min(1, v * k)), dark = dim(hull, 0.62), plank = up(hull, 1.2), deck = up(hull, 1.6), SH = [[0.7, 0.18, 0.15], [0.9, 0.75, 0.25], [0.2, 0.35, 0.6], [0.88, 0.86, 0.8], [0.15, 0.4, 0.25]];
  const sec = (u) => ({ x: u * L, w: B * 0.95 * Math.pow(Math.max(1 - Math.pow(Math.abs(u), 2.2), 0), 0.6), sheer: 0.9 + 3.4 * Math.abs(u) ** 3.4, keel: -0.9 + 0.7 * Math.abs(u) ** 2.2 });
  const ring = (s, side) => [[s.x, s.keel, 0], [s.x, s.keel * 0.4, side * s.w * 0.7], [s.x, 0.1, side * s.w], [s.x, s.sheer, side * s.w * 0.94]];
  for (const side of [-1, 1]) for (let i = 0; i < XS; i++) {
    const A = ring(sec(-1 + (2 * i) / XS), side), Bn = ring(sec(-1 + (2 * (i + 1)) / XS), side);
    for (let k = 0; k < 3; k++) { const col = k === 2 ? (i % 2 ? plank : dark) : k === 0 ? dark : dim(hull, 0.85); if (side > 0) m.quad(A[k], Bn[k], Bn[k + 1], A[k + 1], col); else m.quad(A[k], A[k + 1], Bn[k + 1], Bn[k], col); } // clinker strakes alternate dark and light
    const a = sec(-1 + (2 * i) / XS), b = sec(-1 + (2 * (i + 1)) / XS);
    m.box((a.x + b.x) / 2, (a.sheer + b.sheer) / 2 + 0.08, side * ((a.w + b.w) / 2) * 0.96, Math.abs(b.x - a.x) + 0.05, 0.14, 0.14, deck);
    if (i > 1 && i < XS - 2) m.box(a.x, a.sheer - 0.35, side * (a.w * 0.96 + 0.1), 0.85, 0.85, 0.1, SH[i % 5]); // round shields along the rail
  }
  for (let i = 0; i < XS; i++) { const a = sec(-1 + (2 * i) / XS), b = sec(-1 + (2 * (i + 1)) / XS); m.quad([a.x, a.sheer - 0.1, -a.w * 0.9], [b.x, b.sheer - 0.1, -b.w * 0.9], [b.x, b.sheer - 0.1, b.w * 0.9], [a.x, a.sheer - 0.1, a.w * 0.9], deck); }
  for (const e of [1, -1]) { const base = sec(e).sheer, hd = e > 0 ? 1 : 0.55; // dragon prow (bow) and a curled tail (stern)
    for (let k = 0; k < 6; k++) m.box(e * L * (1 + 0.03 * k * (e > 0 ? 1 : -0.5)), base + 0.3 + k * 0.45 * hd, 0, 0.32, 0.55, 0.34, hull);
    const hx = e * L * (1.02 + 0.02 * 6 * (e > 0 ? 1 : -0.5)), hy = base + 0.3 + 6 * 0.45 * hd;
    m.box(hx + e * 0.45, hy, 0, 1.0, 0.5, 0.42, hull); m.box(hx + e * 0.75, hy - 0.28, 0, 0.7, 0.18, 0.34, dim(hull, 0.7)); m.box(hx + e * 0.2, hy + 0.35, 0.16, 0.12, 0.45, 0.1, [0.9, 0.88, 0.8]); m.box(hx + e * 0.2, hy + 0.35, -0.16, 0.12, 0.45, 0.1, [0.9, 0.88, 0.8]); m.box(hx + e * 0.4, hy + 0.1, 0.22, 0.1, 0.1, 0.06, [0.95, 0.8, 0.3]); m.box(hx + e * 0.4, hy + 0.1, -0.22, 0.1, 0.1, 0.06, [0.95, 0.8, 0.3]); }
  for (let i = 1; i < 7; i++) { const u = -0.65 + i * 0.2, s = sec(u); for (const side of [-1, 1]) m.line([s.x, s.sheer - 0.3, side * s.w * 0.9], [s.x - 0.9, -0.3, side * (s.w + 3.6)], 0.12, [0.6, 0.45, 0.3]); } // oars
  const x = 0.05 * L, mh = L * 0.95, y0 = 2.4, y1 = mh * 0.92, w = B * 2.6, sm = sailOut ? new Mesh() : m; if (sailOut) sailOut.push({ mesh: sm, x });
  m.box(x, mh / 2 + 0.9, 0, 0.34, mh, 0.34, hull); sm.box(x, y1, 0, 0.22, 0.22, w * 1.1, hull);
  const N = 8, f = (i, j) => { const u = i / N, v = j / 3; return [x + 0.5 + 1.4 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI), mix(y1 - 0.2, y0 + 0.5, v), (u - 0.5) * w]; };
  for (let a = 0; a < N; a++) for (let b = 0; b < 3; b++) { if (p.tatter && (a + b) % 4 === 1) continue; const c = a % 2 ? p.accent : p.sail; sm.quad(f(a, b), f(a + 1, b), f(a + 1, b + 1), f(a, b + 1), dim(c, 0.82 + 0.18 * Math.sin(((b + 0.5) / 3) * Math.PI))); } // vertical stripes
  m.line([x, y1 + 0.2, 0], [L * 1.1, sec(1).sheer + 1.2, 0], 0.1, [0.62, 0.55, 0.4]); m.line([x, y1 + 0.2, 0], [-L * 1.0, sec(-1).sheer + 1.0, 0], 0.1, [0.62, 0.55, 0.4]); // stays
  return m;
}
export function shipMesh(p, sailOut) {
  if (p.viking) return longshipMesh(p, sailOut);
  const m = new Mesh(), { L, B, hull } = p, XS = 10, dark = dim(hull, 0.62), plank = dim(hull, 1.18).map((v) => Math.min(1, v)), deck = dim(hull, 1.55).map((v) => Math.min(1, v)), rope = [0.62, 0.55, 0.4];
  const sec = (u) => { const w = B * Math.pow(Math.max(1 - Math.pow(Math.abs(u), u > 0 ? 2.4 : 3.2), 0), 0.55), sheer = 1.1 + 0.9 * u * u + (u > 0 ? 0.5 * u : 0); return { x: u * L, w, sheer, keel: -1.1 + 0.8 * Math.abs(u) ** 2.5 }; };
  const ring = (s, side) => [[s.x, s.keel, 0], [s.x, s.keel * 0.45, side * s.w * 0.7], [s.x, 0, side * s.w], [s.x, s.sheer, side * s.w * 0.92]];
  for (const side of [-1, 1]) for (let i = 0; i < XS; i++) {
    const A = ring(sec(-1 + (2 * i) / XS), side), Bn = ring(sec(-1 + (2 * (i + 1)) / XS), side);
    for (let k = 0; k < 3; k++) { const col = k === 2 ? plank : k === 0 ? dark : dim(hull, 0.8); if (side > 0) m.quad(A[k], Bn[k], Bn[k + 1], A[k + 1], col); else m.quad(A[k], A[k + 1], Bn[k + 1], Bn[k], col); }
    const a = sec(-1 + (2 * i) / XS), b = sec(-1 + (2 * (i + 1)) / XS); // gunwale rail and posts
    m.box((a.x + b.x) / 2, (a.sheer + b.sheer) / 2 + 0.32, side * ((a.w + b.w) / 2) * 0.95, Math.abs(b.x - a.x) + 0.06, 0.1, 0.12, deck);
    if (i % 2 === 0) m.box(a.x, a.sheer + 0.16, side * a.w * 0.95, 0.1, 0.4, 0.1, deck);
    m.box((a.x + b.x) / 2, 0.35, side * ((a.w + b.w) / 2) * 0.99, Math.abs(b.x - a.x) + 0.05, 0.14, 0.09, p.stripe || deck); // wale (the thick belt plank)
  }
  for (let i = 0; i < XS; i++) { const a = sec(-1 + (2 * i) / XS), b = sec(-1 + (2 * (i + 1)) / XS), c = deck; m.quad([a.x, a.sheer, -a.w * 0.92], [b.x, b.sheer, -b.w * 0.92], [b.x, b.sheer, b.w * 0.92], [a.x, a.sheer, a.w * 0.92], c); } // planked deck
  const st = sec(-1), cx = -L * 0.78, ch = st.sheer + 0.9;
  m.box(cx, ch, 0, L * 0.28, p.high ? 2.6 : 1.4, B * 1.5, deck, 0.15); m.box(cx, ch + (p.high ? 1.5 : 0.85), 0, L * 0.3, 0.16, B * 1.62, dark); // stern cabin + roof
  for (const s of [-1, 0, 1]) m.box(cx - L * 0.14 - 0.02, ch + 0.1, s * B * 0.5, 0.06, 0.38, 0.5, glow([1, 0.85, 0.45])); // stern windows
  for (const s of [-1, 1]) m.box(cx, ch + 0.1, s * (B * 0.75 + 0.03), L * 0.18, 0.34, 0.06, glow([0.95, 0.8, 0.4])); // side windows
  m.box(cx - L * 0.14 - 0.1, ch + 1.1, 0, 0.5, 0.5, 0.5, glow([1, 0.8, 0.35])); // stern lantern
  m.box(L * 1.08, sec(1).sheer + 0.1, 0, L * 0.35, 0.22, 0.34, hull); // bowsprit
  const bowTip = [L * 1.25, sec(1).sheer + 0.15, 0];
  for (const s of [-1, 1]) m.box(L * 0.82, sec(0.82).sheer + 0.15, s * (sec(0.82).w + 0.1), 0.5, 0.5, 0.2, [0.3, 0.3, 0.32]); // anchors
  m.box(L * 0.55, sec(0.55).sheer + 0.4, B * 0.35, 0.8, 0.7, 0.7, WOOD, 0.2); m.box(L * 0.45, sec(0.45).sheer + 0.35, -B * 0.4, 0.7, 0.6, 0.7, dim(WOOD, 0.85), 0.2); m.box(L * 0.2, sec(0.2).sheer + 0.45, B * 0.1, 0.55, 0.8, 0.55, [0.5, 0.34, 0.2], 0.2); // crates and a barrel on deck
  if (p.crates) for (let i = 0; i < 6; i++) { const u = -0.45 + i * 0.16; m.box(u * L, sec(u).sheer + 0.45 + (i % 2) * 0.55, ((i % 3) - 1) * B * 0.3, 0.9, 0.8 + (i % 2) * 0.5, 0.9, WOOD, 0.2); } // deck cargo
  const masts = [];
  for (let k = 0; k < p.masts; k++) {
    const x = p.masts === 1 ? 0.1 * L : mix(-0.35, 0.5, k / (p.masts - 1)) * L, mh = L * (k === p.masts - 1 && p.masts > 1 ? 0.8 : 1) * 1.05, w = B * 1.9, y0 = 2.6, y1 = mh * 0.95;
    masts.push({ x, mh });
    const sm = sailOut ? new Mesh() : m; if (sailOut) sailOut.push({ mesh: sm, x });
    m.box(x, mh / 2 + 1, 0, 0.36, mh, 0.36, hull); m.box(x, mh + 1.6, 0, 0.2, 1.4, 0.2, hull); // mast, topmast
    if (!p.tri) { sm.box(x, y1, 0, 0.22, 0.22, w * 1.12, hull); sm.box(x, (y1 + y0) / 2 + 0.6 - 0.3, 0, 0.18, 0.18, w * 1.05, hull); } // yards
    if (p.tri) { // one big triangular (bermuda) sail: luff up the mast, boom out aft, billowed a little with a fan of triangles
      const top = [x + 0.15, y1 - 0.2, 0], tack = [x + 0.15, 2.3, 0], clew = [x - L * 0.8, 2.3, 0], mid = [x - L * 0.3, (y1 + 2.3) / 2 - 0.2, 0.5];
      for (const [q, r, sh] of [[top, tack, 1], [tack, clew, 0.84], [clew, top, 0.92]]) { sm.tri(q, r, mid, dim(p.sail, sh)); sm.tri(r, q, [mid[0], mid[1], -0.5 + 0.0], dim(p.sail, sh * 0.9)); }
      sm.line([x - 0.1, 2.3, 0], [x - L * 0.82, 2.3, 0], 0.16, hull); // boom
    }
    if (p.tri) { /* sail is built above */ }
    else if (p.lateen) { sm.tri([x + 0.2, y1 + 0.5, 0], [x - L * 0.85, y0 + 0.3, 0], [x + L * 0.35, y0 + 0.3, 0], p.sail); sm.tri([x + 0.2, y1 + 0.5, 0.05], [x + L * 0.35, y0 + 0.3, 0.05], [x - L * 0.85, y0 + 0.3, 0.05], dim(p.sail, 0.8)); sm.line([x - L * 0.85, y0 + 0.3, 0], [x + L * 0.35, y0 + 0.3, 0], 0.14, hull); } // raiders: triangular sails
    else for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { // mainsail: a bulging 3x3 patch with a darker belly
      if (p.tatter && (a * 3 + b + k) % 4 === 1) continue; // ghost sails are in rags
      const f = (i, j) => { const u = i / 3, v = j / 3; return [x + 0.5 + 1.3 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI), mix(y1 - 0.2, y0 + 0.4, v), (u - 0.5) * w]; };
      const sh = (v) => dim(p.sail, 0.8 + 0.2 * Math.sin(v * Math.PI)); sm.quadV(f(a, b), f(a + 1, b), f(a + 1, b + 1), f(a, b + 1), sh(b / 3), sh(b / 3), sh((b + 1) / 3), sh((b + 1) / 3));
    }
    const tw = w * 0.68, ty0 = y1 + 0.3, ty1 = y1 + mh * 0.3; // topsail
    if (!p.lateen && !p.tri) { for (let a = 0; a < 2; a++) { const f = (i, j) => { const u = i / 2, v = j; return [x + 0.4 + 0.7 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI), mix(ty1, ty0, v), (u - 0.5) * tw]; }; sm.quad(f(a, 0), f(a + 1, 0), f(a + 1, 1), f(a, 1), dim(p.sail, 0.95)); } sm.box(x, ty1, 0, 0.16, 0.16, tw * 1.08, hull); }
    if (k === 0) { m.quad([x, mh + 2.3, 0], [x - 2.4, mh + 2.1, 0], [x - 2.4, mh + 1.2, 0], [x, mh + 1.4, 0], p.accent); m.box(x - 0.05, mh + 2.4, 0, 0.12, 0.12, 0.12, [0.9, 0.8, 0.3]); if (p.kind === 'raider') m.box(x - 1.2, mh + 1.75, 0.05, 0.7, 0.7, 0.06, [0.92, 0.9, 0.85]); } // pennant
    m.line([x, y1 + 0.8, 0], [bowTip[0], bowTip[1], 0], 0.1, rope); m.line([x, y1 + 0.8, 0], [-L * 0.95, st.sheer + 1.4, 0], 0.1, rope); // forestay and backstay
  }
  const fm = masts[masts.length - 1]; // jib between the bowsprit and the foremast
  if (p.jib !== false) m.tri([bowTip[0] - 0.3, bowTip[1] + 0.3, 0], [fm.x + 0.5, fm.mh * 0.9, 0], [fm.x + 0.9, bowTip[1] + 1.6, 0], dim(p.sail, 0.95));
  for (let q = 0; q < (p.guns || 5); q++) for (const s of [-1, 1]) { const i = ((q + 0.5) / (p.guns || 5) - 0.5) * 5.4; m.box(i * L * 0.18, 1.15, s * (B * 0.84), 0.38, 0.22, 0.38, [0.16, 0.15, 0.15]); m.box(i * L * 0.18, 1.15, s * (B * 0.84 + 0.04), 0.46, 0.34, 0.06, dim(hull, 0.5)); } // gun ports + muzzles
  return m;
}
export function wakeMesh(ph) {
  const m = new Mesh(), W = [1, 1, 1];
  const dash = (f, s, u0, u1, w) => { const a = f(u0), b = f(u1); m.quad([a[0], 0, a[1] - w * s * 1.7], [b[0], 0, b[1] - w * s * 1.7], [b[0], 0, b[1] + w * s * 1.7], [a[0], 0, a[1] + w * s * 1.7], W); };
  for (const s of [-1, 1]) { // the bow wave: two arms sweeping back and out, dashes marching along them
    const arm = (u) => [1.0 - u * 1.25, s * (0.1 + u * 0.55)];
    for (let k = 0; k < 5; k++) { const u0 = ((k + ph) / 5) * 0.92; dash(arm, 1, u0, u0 + 0.09, 0.075 * (1 - u0 * 0.35)); }
    const arm2 = (u) => [0.9 - u * 1.05, s * (0.06 + u * 0.3)]; // a tighter inner pair
    for (let k = 0; k < 4; k++) { const u0 = ((k + ph) / 4) * 0.85; dash(arm2, 1, u0, u0 + 0.12, 0.055); }
  }
  for (const s of [-1, 1]) for (let k = 0; k < 7; k++) { const u0 = (k + ph) / 7.4, j = Math.sin(k * 5.1 + s * 2) * 0.03; dash((u) => [-1 - u, s * (0.05 + u * 0.2) + j], 1, u0, u0 + 0.06 + (0.05 * ((k * 7) % 3)) / 2, 0.03 + u0 * 0.06); } // the churned water astern: two ragged lanes spreading out
  for (let k = 0; k < 4; k++) { const u0 = (k + ph) / 4.4; dash((u) => [-1.05 - u * 0.9, 0], 1, u0, u0 + 0.1, 0.05 + u0 * 0.1); }
  m.box(1.02, 0.12, 0, 0.22, 0.3, 0.34, W); // the splash at the stem
  return m;
}
export function ballMesh() { const m = new Mesh(); m.blob(0, 0, 0, 0.45, [0.1, 0.1, 0.11], 1); return m; }

// flat grid of (x,0,z) in [-1,1]; the shader scales/moves it and adds waves
export function waterMesh(N = 140) {
  const m = new Mesh();
  const warp = (u) => Math.sign(u) * (0.12 * Math.abs(u) + 0.88 * Math.abs(u) ** 2.4); // fine cells near the middle (under the ship), coarse far out where haze hides them
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const f = (a, b) => [warp((a / N) * 2 - 1), 0, warp((b / N) * 2 - 1)]; m.quad(f(i, j), f(i, j + 1), f(i + 1, j + 1), f(i + 1, j), [1, 1, 1]); }
  return m;
}
const WOODC = WOOD; void WOODC; void townsfolk;

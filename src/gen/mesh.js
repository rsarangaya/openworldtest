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
function terrainColor(isl, y, steep) {
  const p = PAL[isl.biome];
  if (y < 1.2) return lerp3(isl.biome === 'frozen' ? [0.7, 0.78, 0.84] : [0.58, 0.52, 0.38], p.low, clamp((y + 2) / 3, 0, 1));
  const t = clamp((y - 1.2) / (isl.h * 0.8), 0, 1);
  const c = t < 0.55 ? lerp3(p.low, p.mid, clamp(t * 4, 0, 1)) : lerp3(p.mid, p.high, (t - 0.55) / 0.45);
  return steep > 0.4 ? lerp3(c, [0.4, 0.37, 0.34], Math.min(0.75, (steep - 0.4) * 3)) : c;
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

// furniture and goods inside a shop, in door-relative coordinates: u runs from the middle toward the door, v along the wall
function shopProps(m, b, y0) {
  const [dx, dz] = DIRV[b.door], P = (u, v, y) => [b.x + dx * u - dz * v, y, b.z + dz * u + dx * v], sx = dx ? 1 : 0;
  const bx = (u, v, y, w, h, d, col, ao) => { const p = P(u, v, y); m.box(p[0], p[1], p[2], sx ? w : d, h, sx ? d : w, col, ao); }; // w along u, d along v
  const hw = (dx ? b.w : b.d) / 2 - 0.7, hv = (dx ? b.d : b.w) / 2 - 0.7;
  const goods = [[0.8, 0.3, 0.2], [0.3, 0.55, 0.3], [0.85, 0.75, 0.3], [0.35, 0.4, 0.7], [0.7, 0.45, 0.2]];
  const rr = rngFor(Math.round(b.x * 7 + b.z * 13), 1);
  switch (b.kind) {
    case 'merchant': // shelves of goods along the back wall, barrels and sacks
      for (const lv of [0.5, 1.2, 1.9]) { bx(-hw + 0.25, 0, y0 + lv, 0.5, 0.1, hv * 1.7, DARKWOOD); for (let k = -2; k <= 2; k++) bx(-hw + 0.25, k * hv * 0.34, y0 + lv + 0.2, 0.3, 0.28, 0.4, pick(rr, goods)); }
      bx(-hw + 0.6, -hv + 0.3, y0 + 0.4, 0.7, 0.8, 0.7, WOOD, 0.2); bx(-hw + 0.6, hv - 0.3, y0 + 0.4, 0.7, 0.8, 0.7, WOOD, 0.2); bx(0.5, hv, y0 + 0.25, 0.7, 0.5, 0.55, [0.75, 0.68, 0.5], 0.2); break;
    case 'tavern': // two tables with stools, a barrel, a hearth glow
      for (const v of [-hv * 0.55, hv * 0.55]) { bx(-0.2, v, y0 + 0.8, 1.5, 0.1, 1.2, WOOD); bx(-0.2, v, y0 + 0.4, 0.2, 0.8, 0.2, DARKWOOD); for (const s of [-1, 1]) bx(-0.2 + s * 1.1, v, y0 + 0.3, 0.45, 0.5, 0.45, DARKWOOD); bx(-0.2, v + 0.2, y0 + 0.95, 0.15, 0.18, 0.15, [0.75, 0.6, 0.3]); }
      bx(-hw + 0.5, 0, y0 + 0.55, 0.9, 1.1, 0.9, WOOD, 0.2); bx(-hw + 0.1, hv - 0.2, y0 + 1.3, 0.2, 1.5, 1.2, STONE); bx(-hw + 0.25, hv - 0.2, y0 + 0.5, 0.1, 0.6, 0.9, [1, 0.55, 0.15]); break;
    case 'shipwright': // a half-built model ship on a stand, planks and tools
      bx(-0.4, 0, y0 + 0.6, 2.6, 0.12, 1.2, DARKWOOD); bx(-0.4, 0, y0 + 0.85, 2.2, 0.4, 0.8, [0.5, 0.35, 0.2]); bx(-0.4, 0, y0 + 1.5, 0.08, 1.1, 0.08, DARKWOOD); bx(-0.4, 0, y0 + 1.5, 0.05, 0.8, 0.7, [0.92, 0.9, 0.82]);
      for (let k = 0; k < 4; k++) bx(-hw + 0.5, hv - 0.4, y0 + 0.12 + k * 0.2, 2, 0.14, 0.5, k % 2 ? WOOD : DARKWOOD); bx(-hw + 0.4, -hv + 0.4, y0 + 0.45, 0.6, 0.9, 0.6, [0.4, 0.4, 0.42]); break;
    case 'sailor': // a bunk, a chart table, a seat
      bx(-hw + 0.7, hv - 0.5, y0 + 0.35, 2.2, 0.3, 1, WOOD); bx(-hw + 0.7, hv - 0.5, y0 + 0.6, 1.8, 0.2, 0.8, [0.7, 0.3, 0.3]);
      bx(-0.2, -hv * 0.4, y0 + 0.8, 1.6, 0.08, 1.2, WOOD); bx(-0.2, -hv * 0.4, y0 + 0.86, 1.3, 0.02, 0.9, [0.93, 0.88, 0.7]); bx(-0.2, -hv * 0.4, y0 + 0.4, 0.2, 0.8, 0.2, DARKWOOD); bx(0.9, -hv * 0.4, y0 + 0.3, 0.5, 0.5, 0.5, DARKWOOD); break;
    default: // warden: hearth with a fire, a fur rug, a rack of tools
      bx(-hw + 0.3, 0, y0 + 0.9, 0.6, 1.8, 2, STONE); bx(-hw + 0.5, 0, y0 + 0.35, 0.2, 0.6, 1.1, [1, 0.5, 0.12]); bx(0.1, 0, y0 + 0.07, 2.4, 0.04, 1.8, [0.92, 0.94, 0.98]);
      bx(-hw + 0.3, hv - 0.4, y0 + 1.4, 0.1, 1.8, 0.1, DARKWOOD); bx(-hw + 0.3, hv - 0.4, y0 + 2.2, 0.1, 0.1, 1.2, DARKWOOD);
  }
}

function building(m, isl, b) {
  const wall = isl.biome === 'frozen' ? [0.82, 0.84, 0.9] : WALLS[b.roof % 4], roof = ROOFS[b.roof], y0 = b.pad, y1 = y0 + b.h, hw = b.w / 2, hd = b.d / 2, trim = dim(wall, 1.12).map((v) => Math.min(1, v));
  m.box(b.x, y0 - 1.4, b.z, b.w + 0.4, 2.8, b.d + 0.4, [0.44, 0.42, 0.4]); // foundation reaches below the terrain on any slope
  if (!b.door) m.box(b.x, y0 + 0.3, b.z, b.w + 0.25, 0.6, b.d + 0.25, STONE, 0.15); // stone plinth (houses only: shops are hollow)
  if (b.door) {
    for (const [x0, x1, z0, z1] of b.solids) m.box((x0 + x1) / 2, y0 + b.h / 2, (z0 + z1) / 2, x1 - x0, b.h, z1 - z0, wall, 0.18);
    m.box(b.x, y0 + 0.05, b.z, b.w - 0.8, 0.14, b.d - 0.8, WOOD); // floor
    m.box(b.x, y1 - 0.6, b.z, 0.35, 0.35, 0.35, [1, 0.85, 0.45]); // lamp
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
    for (const k of Object.keys(DIRV)) {
      const [wx, wz] = DIRV[k]; if (k === b.face) continue;
      for (const s of [-1, 1]) {
        const cx = b.x + wx * (hw + 0.05) + (wz ? s * b.w * 0.25 : 0), cz = b.z + wz * (hd + 0.05) + (wx ? s * b.d * 0.25 : 0), cy = y0 + b.h * 0.6;
        m.box(cx, cy, cz, wx ? 0.14 : 1.15, 1.1, wz ? 0.14 : 1.15, trim); // frame
        m.box(cx + wx * 0.05, cy, cz + wz * 0.05, wx ? 0.1 : 0.85, 0.85, wz ? 0.1 : 0.85, [0.28, 0.4, 0.55]); // glass
        m.box(cx + wx * 0.08, cy, cz + wz * 0.08, wx ? 0.1 : 0.06, 0.85, wz ? 0.1 : 0.06, trim); m.box(cx + wx * 0.08, cy, cz + wz * 0.08, wx ? 0.1 : 0.85, 0.06, wz ? 0.1 : 0.85, trim); // mullions
        for (const t of [-1, 1]) m.box(cx + wx * 0.1 + (wz ? t * 0.7 : 0), cy, cz + wz * 0.1 + (wx ? t * 0.7 : 0), wx ? 0.1 : 0.28, 1.1, wz ? 0.1 : 0.28, shut); // shutters
        if (rr() < 0.5) { m.box(cx + wx * 0.3, cy - 0.7, cz + wz * 0.3, wx ? 0.4 : 1, 0.25, wz ? 0.4 : 1, DARKWOOD); m.box(cx + wx * 0.3, cy - 0.5, cz + wz * 0.3, wx ? 0.3 : 0.9, 0.18, wz ? 0.3 : 0.9, pick(rr, FLOWERS)); } // flower box
      }
    }
  }
  const alongX = b.w >= b.d, ex = hw + 0.7, ez = hd + 0.7, rh = 1.3 + Math.min(hw, hd) * 0.55, ry = y1 + rh, rd = dim(roof, 0.82);
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
  if (!b.door && b.w > 5) { m.box(b.x + hw * 0.5, ry + 0.1, b.z + hd * 0.3, 0.9, 1.9, 0.9, [0.45, 0.4, 0.38], 0.1); m.box(b.x + hw * 0.5, ry + 1.1, b.z + hd * 0.3, 1.1, 0.2, 1.1, [0.3, 0.28, 0.27]); } // chimney with cap
}

// the plaza: a well, market stalls, lamp posts, benches. Rings are kept clear so townsfolk can walk around them.
function plazaProps(m, isl, town) {
  const p = town.plaza, y = p.y, r = rngFor(isl.seed, 11);
  m.box(p.x, y + 0.5, p.z, 2.4, 1, 2.4, STONE, 0.2); m.box(p.x, y + 0.98, p.z, 1.7, 0.1, 1.7, [0.1, 0.18, 0.3]); // well
  for (const s of [-1, 1]) m.box(p.x, y + 1.5, p.z + s * 1.1, 0.14, 1.8, 0.14, DARKWOOD);
  m.box(p.x, y + 2.45, p.z, 0.3, 0.15, 2.7, DARKWOOD); m.quad([p.x - 0.8, y + 2.45, p.z - 1.45], [p.x - 0.8, y + 2.45, p.z + 1.45], [p.x, y + 3.1, p.z + 1.45], [p.x, y + 3.1, p.z - 1.45], ROOFS[0]); m.quad([p.x + 0.8, y + 2.45, p.z + 1.45], [p.x + 0.8, y + 2.45, p.z - 1.45], [p.x, y + 3.1, p.z - 1.45], [p.x, y + 3.1, p.z + 1.45], dim(ROOFS[0], 0.85));
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + Math.PI / 4, x = p.x + Math.cos(a) * 6.3, z = p.z + Math.sin(a) * 6.3; m.box(x, y + 1.7, z, 0.18, 3.4, 0.18, [0.2, 0.2, 0.22]); m.box(x, y + 3.55, z, 0.5, 0.5, 0.5, [1, 0.85, 0.45]); } // lamp posts
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
export function islandMesh(isl) {
  const m = new Mesh(), town = islandTown(isl), ext = isl.r * 1.5, N = clamp(Math.round((ext * 2) / (isl.port ? 4.5 : 6)), 24, 72), st = (ext * 2) / N, W = N + 1, H = new Float32Array(W * W);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) H[j * W + i] = Math.max(-2, islandHeight(isl, isl.x - ext + i * st, isl.z - ext + j * st));
  const h = (i, j) => H[clamp(j, 0, N) * W + clamp(i, 0, N)];
  const P = (i, j) => [isl.x - ext + i * st, h(i, j), isl.z - ext + j * st];
  const NR = (i, j) => { const nx = h(i - 1, j) - h(i + 1, j), nz = h(i, j - 1) - h(i, j + 1), l = Math.hypot(nx, 2 * st, nz); return [nx / l, (2 * st) / l, nz / l]; };
  const pl = town.plaza;
  // colour of the ground at a point: biome by height and slope, grass tufts, shoreline foam, cobbled plaza, dirt path, contact shadow by buildings
  const colorAt = (x, y, z, nrm) => {
    let c = terrainColor(isl, y, 1 - nrm[1]);
    c = dim(c, 0.94 + 0.12 * fbm(isl.seed + 3, x * 0.03, z * 0.03, 1)); // gentle large-scale tint only: no fine noise that shimmers
    if (y < 0.35 && y > -1.3) c = lerp3(c, [0.95, 0.98, 1], clamp((1 - Math.abs(y + 0.45) / 0.85) * 0.6, 0, 0.6));
    if (isl.port) {
      if (pl) { const d = Math.hypot(x - pl.x, z - pl.z); if (d < 10.2) c = lerp3(c, [0.62, 0.6, 0.56], sstep(10.2, 8.6, d)); }
      const pd = pathDist(isl, x, z); if (pd < 2 && y > 0.4) c = lerp3(c, [0.64, 0.54, 0.38], 1 - sstep(1.0, 2.0, pd));
      for (const b of town.buildings) { const d = Math.max(Math.abs(x - b.x) - b.w / 2, Math.abs(z - b.z) - b.d / 2); if (d < 3.2) c = dim(c, 0.74 + 0.26 * sstep(0, 3.2, Math.max(d, 0))); }
    }
    return c.map((v) => Math.min(1, v));
  };
  const VC = new Array(W * W), VN = new Array(W * W);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const p = P(i, j), nrm = NR(i, j); VN[j * W + i] = nrm; VC[j * W + i] = colorAt(p[0], p[1], p[2], nrm); }
  const V = (i, j) => [P(i, j), VC[j * W + i], VN[j * W + i]];
  const tri = (a, b, c) => { const A = V(...a), B = V(...b), C = V(...c); m.triN(A[0], B[0], C[0], A[1], B[1], C[1], A[2], B[2], C[2]); };
  // finer cells wherever a building stands, so the ground meets the walls and floors exactly (no terrain poking through a shop floor)
  const vtx = (x, z, yy) => { const y = yy ?? Math.max(-2, islandHeight(isl, x, z)), e = 0.7, nx = islandHeight(isl, x - e, z) - islandHeight(isl, x + e, z), nz = islandHeight(isl, x, z - e) - islandHeight(isl, x, z + e), l = Math.hypot(nx, 2 * e, nz), nrm = [nx / l, (2 * e) / l, nz / l]; return [[x, y, z], colorAt(x, y, z, nrm), nrm]; };
  const nearBuilding = (x0, z0, x1, z1) => town.buildings.some((b) => x1 > b.x - b.w / 2 - 2.2 && x0 < b.x + b.w / 2 + 2.2 && z1 > b.z - b.d / 2 - 2.2 && z0 < b.z + b.d / 2 + 2.2);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (Math.max(h(i, j), h(i + 1, j), h(i + 1, j + 1), h(i, j + 1)) < -1.5) continue;
    const x0 = isl.x - ext + i * st, z0 = isl.z - ext + j * st;
    if (isl.port && nearBuilding(x0, z0, x0 + st, z0 + st)) {
      const S = 3, q = (a, b) => vtx(x0 + (a * st) / S, z0 + (b * st) / S, a === 0 || b === 0 || a === S || b === S ? (h(i, j) * (S - a) + h(i + 1, j) * a) / S * (S - b) / S + (h(i, j + 1) * (S - a) + h(i + 1, j + 1) * a) / S * b / S : undefined), G = [];
      for (let b2 = 0; b2 <= S; b2++) for (let a2 = 0; a2 <= S; a2++) G.push(q(a2, b2));
      const g = (a2, b2) => G[b2 * (S + 1) + a2];
      for (let b2 = 0; b2 < S; b2++) for (let a2 = 0; a2 < S; a2++) {
        const A = g(a2, b2), B = g(a2 + 1, b2), C = g(a2 + 1, b2 + 1), D = g(a2, b2 + 1);
        m.triN(A[0], D[0], C[0], A[1], D[1], C[1], A[2], D[2], C[2]); m.triN(A[0], C[0], B[0], A[1], C[1], B[1], A[2], C[2], B[2]);
      }
    } else { tri([i, j], [i, j + 1], [i + 1, j + 1]); tri([i, j], [i + 1, j + 1], [i + 1, j]); }
  }
  const split = m.v.length; // everything before this is bare ground; everything after is structures (they get crease outlines, the ground does not)
  for (const b of town.buildings) building(m, isl, b);
  if (isl.port) { // dock: planks, pilings, lanterns, crates, barrels, rope
    const d = isl.port.dock, len = Math.hypot(d.x1 - d.x0, d.z1 - d.z0), n = Math.ceil(len / 2) + 1, ux = (d.x1 - d.x0) / len, uz = (d.z1 - d.z0) / len, rr = rngFor(isl.seed, 12);
    for (let k = 0; k < n; k++) {
      const x = d.x0 + ux * k * 2, z = d.z0 + uz * k * 2, c = k % 2 ? [0.45, 0.32, 0.2] : [0.52, 0.38, 0.23];
      const dy = DOCK_Y - 0.05; m.quadV([x - uz * 1.7 - ux, dy, z + ux * 1.7 - uz], [x + uz * 1.7 - ux, dy, z - ux * 1.7 - uz], [x + uz * 1.7 + ux, dy, z - ux * 1.7 + uz], [x - uz * 1.7 + ux, dy, z + ux * 1.7 + uz], c, c, dim(c, 1.1), dim(c, 1.1));
      if (k % 2 === 0) for (const s of [-1, 1]) m.box(x - uz * 1.8 * s, (DOCK_Y + 0.3 - 1.8) / 2, z + ux * 1.8 * s, 0.36, DOCK_Y + 2.1, 0.36, [0.28, 0.2, 0.13]);
    }
  }
  const ground = new Mesh(); ground.v = m.v.slice(0, split); m.v = m.v.slice(split);
  return { ground, structs: m };
}

// ---------------------------------------------------------------- ice wall (only for the sectors the ring passes through)
export function wallMesh(seed, sx, sz) {
  const x0 = sx * SECTOR - 40, x1 = (sx + 1) * SECTOR + 40, z0 = sz * SECTOR - 40, z1 = (sz + 1) * SECTOR + 40;
  const near = Math.hypot(clamp(0, x0, x1), clamp(0, z0, z1)), far = Math.max(Math.hypot(x0, z0), Math.hypot(x1, z0), Math.hypot(x0, z1), Math.hypot(x1, z1));
  if (near > WALL_R + 30 || far < WALL_R - 30) return null;
  const m = new Mesh(), da = 22 / WALL_R, g = gateAngle(seed), WI = WALL_R - 6, WO = WALL_R + 8;
  const ht = (a) => { const gd = Math.abs(((a - g + Math.PI * 3) % TAU) - Math.PI) * WALL_R; return gd < GATE_HALF ? 10 + 6 * fbm(seed, a * 900, 3, 2) : 60 + 40 * fbm(seed, a * 260, 5, 3) + 14 * Math.sin(a * 900); };
  const col = (y, gate) => (gate ? lerp3([0.55, 0.85, 1], [0.85, 0.97, 1], clamp(y / 16, 0, 1)) : lerp3([0.45, 0.68, 0.85], [0.92, 0.97, 1], clamp(y / 90, 0, 1)));
  for (let a = 0; a < TAU; a += da) {
    const px = Math.cos(a) * WALL_R, pz = Math.sin(a) * WALL_R;
    if (px < x0 || px > x1 || pz < z0 || pz > z1) continue;
    const b = a + da, h0 = ht(a), h1 = ht(b), gate = Math.abs(((a - g + Math.PI * 3) % TAU) - Math.PI) * WALL_R < GATE_HALF;
    const V = (rad, ang, y) => [Math.cos(ang) * rad, y, Math.sin(ang) * rad];
    m.quadV(V(WI, a, -3), V(WI, b, -3), V(WI, b, h1), V(WI, a, h0), dim(col(0, gate), 0.8), dim(col(0, gate), 0.8), col(h1 * 0.6, gate), col(h0 * 0.6, gate));
    m.quadV(V(WO, b, -3), V(WO, a, -3), V(WO, a, h0), V(WO, b, h1), dim(col(0, gate), 0.8), dim(col(0, gate), 0.8), col(h0 * 0.8, gate), col(h1 * 0.8, gate));
    m.quad(V(WI, a, h0), V(WI, b, h1), V(WO, b, h1), V(WO, a, h0), col(h0, gate));
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
const SHAPES = { trader: { L: [7, 9], B: [3.7, 4.4], masts: [1, 2], guns: 2 }, navy: { L: [11, 13], B: [2.3, 2.7], masts: [2, 3], guns: 7 }, raider: { L: [9, 11], B: [2, 2.4], masts: [1, 2], guns: 3 }, ghost: { L: [11, 14], B: [2.6, 3.2], masts: [2, 3], guns: 5 } };
export function shipParams(seed, kind = 'trader', cls = '') {
  const r = rngFor(seed, 9), look = LOOKS[kind] || LOOKS.trader;
  if (kind === 'player') { const c = SHIPS[cls] || SHIPS.sailboat; return { L: c.L, B: c.B, masts: c.masts, guns: c.ports, high: cls === 'galleon', tri: cls === 'sailboat' || cls === 'cutter', jib: cls !== 'sailboat', stripe: look.accent, kind, seed, ...look }; }
  const sh = SHAPES[kind] || SHAPES.trader;
  return { L: range(r, sh.L[0], sh.L[1]), B: range(r, sh.B[0], sh.B[1]), masts: sh.masts[0] + ((r() * (sh.masts[1] - sh.masts[0] + 1)) | 0), guns: sh.guns, lateen: kind === 'raider', tatter: kind === 'ghost', crates: kind === 'trader', stripe: kind === 'navy' ? look.accent : kind === 'raider' ? [0.45, 0.07, 0.07] : null, kind, seed, ...look };
}
// sailOut: when given, each mast's sails go into their own mesh (pivoting at the mast) so the renderer can swing them with the trim
export function shipMesh(p, sailOut) {
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
  for (const s of [-1, 0, 1]) m.box(cx - L * 0.14 - 0.02, ch + 0.1, s * B * 0.5, 0.06, 0.38, 0.5, [1, 0.85, 0.45]); // stern windows
  for (const s of [-1, 1]) m.box(cx, ch + 0.1, s * (B * 0.75 + 0.03), L * 0.18, 0.34, 0.06, [0.95, 0.8, 0.4]); // side windows
  m.box(cx - L * 0.14 - 0.1, ch + 1.1, 0, 0.5, 0.5, 0.5, [1, 0.8, 0.35]); // stern lantern
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
  const dash = (f, s, u0, u1, w) => { const a = f(u0), b = f(u1); m.quad([a[0], 0, a[1] - w * s], [b[0], 0, b[1] - w * s], [b[0], 0, b[1] + w * s], [a[0], 0, a[1] + w * s], W); };
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
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const f = (a, b) => [(a / N) * 2 - 1, 0, (b / N) * 2 - 1]; m.quad(f(i, j), f(i, j + 1), f(i + 1, j + 1), f(i + 1, j), [1, 1, 1]); }
  return m;
}
const WOODC = WOOD; void WOODC; void townsfolk;

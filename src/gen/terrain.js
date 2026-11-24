// Island coastlines as vector contours. The island's height function is sampled once on a grid, and marching squares turns it into
// smooth closed loops at a few height levels (shallows, beach, grass, upland, peak). The renderer fills those loops with flat cel colours.
// Built once per island and cached, so a frame never touches the height function.
import { islandHeight } from './world.js';

export const levelsOf = (isl) => {
  const L = [{ kind: 'shelf', t: -1.5 }, { kind: 'land', t: -0.1 }, { kind: 'grass', t: 1.3 }];
  if (isl.h > 8) L.push({ kind: 'high', t: isl.h * 0.45 });
  if (isl.h > 14) L.push({ kind: 'peak', t: isl.h * 0.72 });
  return L;
};

// segments per cell for each corner mask (bit0 tl, bit1 tr, bit2 br, bit3 bl); edges: 0 top, 1 right, 2 bottom, 3 left
const TABLE = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]], [[3, 2]], [[0, 2]], [[0, 1], [2, 3]], [[1, 2]], [[3, 1]], [[0, 1]], [[3, 0]], []];

function march(F, N, level, cell, ox, oz) {
  const W = N + 1, key = (e, i, j) => (e === 0 ? (j * W + i) * 2 : e === 1 ? (j * W + i + 1) * 2 + 1 : e === 2 ? ((j + 1) * W + i) * 2 : (j * W + i) * 2 + 1);
  const pos = new Map(), adj = new Map(), segs = [];
  const point = (e, i, j) => {
    const a = F[j * W + i], b = F[j * W + i + 1], c = F[(j + 1) * W + i + 1], d = F[(j + 1) * W + i];
    if (e === 0) return [i + (level - a) / (b - a), j]; if (e === 1) return [i + 1, j + (level - b) / (c - b)];
    if (e === 2) return [i + (level - d) / (c - d), j + 1]; return [i, j + (level - a) / (d - a)];
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = F[j * W + i], b = F[j * W + i + 1], c = F[(j + 1) * W + i + 1], d = F[(j + 1) * W + i];
    const mask = (a >= level ? 1 : 0) | (b >= level ? 2 : 0) | (c >= level ? 4 : 0) | (d >= level ? 8 : 0);
    for (const [e0, e1] of TABLE[mask]) {
      const k0 = key(e0, i, j), k1 = key(e1, i, j);
      if (!pos.has(k0)) pos.set(k0, point(e0, i, j)); if (!pos.has(k1)) pos.set(k1, point(e1, i, j));
      const s = segs.length; segs.push([k0, k1]);
      (adj.get(k0) || adj.set(k0, []).get(k0)).push(s); (adj.get(k1) || adj.set(k1, []).get(k1)).push(s);
    }
  }
  const used = new Uint8Array(segs.length), loops = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    const pts = []; let s = s0, cur = segs[s0][0];
    for (let guard = 0; guard < segs.length + 2; guard++) {
      used[s] = 1; const [k0, k1] = segs[s], nxt = k0 === cur ? k1 : k0;
      const p = pos.get(cur); pts.push(ox + p[0] * cell, oz + p[1] * cell);
      cur = nxt; const ns = adj.get(cur).find((q) => !used[q]);
      if (ns === undefined) break; s = ns;
    }
    if (pts.length >= 8) loops.push(pts);
  }
  return loops;
}
// Chaikin corner cutting on a closed polygon: rounds the marching-squares polyline into a soft coast
function smooth(pts, times = 2) {
  for (let t = 0; t < times; t++) {
    const n = pts.length / 2, out = new Array(n * 4);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, x0 = pts[i * 2], z0 = pts[i * 2 + 1], x1 = pts[j * 2], z1 = pts[j * 2 + 1];
      out[i * 4] = 0.75 * x0 + 0.25 * x1; out[i * 4 + 1] = 0.75 * z0 + 0.25 * z1; out[i * 4 + 2] = 0.25 * x0 + 0.75 * x1; out[i * 4 + 3] = 0.25 * z0 + 0.75 * z1;
    }
    pts = out;
  }
  return Float32Array.from(pts);
}

// returns { levels: [{ kind, t, loops: [Float32Array of x,z pairs in world units] }] }
export function buildContours(isl) {
  const ext = isl.r * 1.5, cell = Math.min(2.4, Math.max(0.9, isl.r / 40)), N = Math.ceil((ext * 2) / cell), W = N + 1, ox = isl.x - ext, oz = isl.z - ext, F = new Float32Array(W * W);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) F[j * W + i] = islandHeight(isl, ox + i * cell, oz + j * cell);
  for (let i = 0; i <= N; i++) { F[i] = F[N * W + i] = F[i * W] = F[i * W + N] = -4; } // the border is always open sea, so every loop closes
  return { levels: levelsOf(isl).map((L) => ({ kind: L.kind, t: L.t, loops: march(F, N, L.t, cell, ox, oz).map((p) => smooth(p)) })) };
}

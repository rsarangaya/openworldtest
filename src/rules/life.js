// Ambient sea life and birds (not interactable). Pure and stateless: every animal is a function of (realm, seed, cell, time), so nothing is stored or saved and the cost is a
// handful of trig calls per frame. The sea is cut into cells; each cell may hold one group that swims a slow loop that stays clear of land. Birds circle islands and the open sea.
// Each realm has its own table: Terra is warm and sunny; Asgard has cold-water animals and its own birds (more worlds add a table).
import { sectorIslands, SECTOR, WALL_R } from '../gen/world.js';
import { hash } from '../gen/rng.js';

export const CELL = 170, RANGE = 2, MAX_SHOWN = 70, SHOW_R = 320;
// [kind, weight]; `outer` is used past the Wall in Terra (open ocean: bigger animals, no turtles or gulls)
export const TABLES = {
  terra: { sea: [['dolphin', 4], ['flyfish', 3], ['whale', 2], ['turtle', 2], ['fin', 1], ['school', 3]], outer: [['whale', 4], ['dolphin', 3], ['flyfish', 3], ['fin', 1], ['school', 2]], coast: 'gull', open: 'albatross', openP: 0.1 },
  asgard: { sea: [['narwhal', 3], ['seal', 3], ['orca', 2], ['icewhale', 2], ['school', 2]], outer: [['icewhale', 3], ['orca', 2], ['narwhal', 2], ['school', 1]], coast: 'raven', open: 'eagle', openP: 0.12 },
};
export const tableOf = (realm) => TABLES[realm] || TABLES.terra;
const WEIGHT = (list) => list.reduce((n, [, w]) => n + w, 0);
const pickW = (list, u) => { let r = u * WEIGHT(list); for (const [k, w] of list) { if ((r -= w) < 0) return k; } return list[0][0]; };
const u01 = (a, b, c, d) => (hash(a >>> 0, b | 0, (c | 0) + 1000003 * (d | 0)) % 100000) / 100000;

const nearLand = (seed, x, z, pad) => { const sx = Math.floor(x / SECTOR), sz = Math.floor(z / SECTOR); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const isl of sectorIslands(seed, sx + i, sz + j)) if (Math.hypot(isl.x - x, isl.z - z) < isl.r * 1.7 + pad) return true; return false; };
const groups = new Map(), flocks = new Map();
export const clearLife = () => { groups.clear(); flocks.clear(); };
// the group of a cell (or null): where its loop is, how fast, what it is
function group(realm, seed, ix, iz) {
  const key = seed + ':' + ix + ',' + iz; if (groups.has(key)) return groups.get(key);
  let g = null; const tb = tableOf(realm), cx0 = (ix + 0.25 + 0.5 * u01(seed, ix, iz, 1)) * CELL, cz0 = (iz + 0.25 + 0.5 * u01(seed, ix, iz, 2)) * CELL, d = Math.hypot(cx0, cz0), outer = realm === 'terra' && d > WALL_R + 60;
  const ok = outer ? d < WALL_R + 3700 : d < WALL_R - 120 && !(realm === 'terra' && d > WALL_R - 90);
  if (ok && u01(seed, ix, iz, 3) < (outer ? 0.7 : 0.6)) {
    const kind = pickW(outer ? tb.outer : tb.sea, u01(seed, ix, iz, 4)), R = 40 + 55 * u01(seed, ix, iz, 5), solo = kind === 'whale' || kind === 'icewhale' || kind === 'fin' || kind === 'orca' || kind === 'school';
    g = { kind, n: solo ? 1 + (u01(seed, ix, iz, 6) < 0.25 ? 1 : 0) : 2 + Math.floor(u01(seed, ix, iz, 6) * 3), cx: cx0, cz: cz0, R, w: (0.05 + 0.04 * u01(seed, ix, iz, 7)) * (u01(seed, ix, iz, 8) < 0.5 ? -1 : 1), ph: u01(seed, ix, iz, 9) * 6.283, P: 4 + 5 * u01(seed, ix, iz, 10), seed: hash(seed >>> 0, ix | 0, iz | 0) };
    for (let k = 0; k < 10 && g; k++) { const a = (k / 10) * 6.283; if (nearLand(seed, g.cx + Math.cos(a) * (R + 14), g.cz + Math.sin(a) * (R + 14), 20)) g = null; } // the whole loop must be open water
    if (g && realm === 'terra' && !outer && Math.hypot(g.cx, g.cz) + R + 20 > WALL_R - 90) g = null;
  }
  groups.set(key, g); if (groups.size > 900) groups.delete(groups.keys().next().value); return g;
}
// a flock circling an island (gulls, ravens); cached per island
function flock(realm, isl) {
  const key = isl.seed + ':' + realm; let f = flocks.get(key); if (f !== undefined) return f;
  f = isl.port || isl.r > 90 ? { kind: tableOf(realm).coast, n: 3 + (hash(isl.seed >>> 0, 7) % 3), x: isl.x, z: isl.z, R: isl.r * 1.25 + 18, h: 13 + (hash(isl.seed >>> 0, 8) % 9), w: (0.16 + (hash(isl.seed >>> 0, 9) % 10) / 100) * (hash(isl.seed >>> 0, 10) % 2 ? 1 : -1), ph: (hash(isl.seed >>> 0, 11) % 628) / 100 } : null;
  flocks.set(key, f); if (flocks.size > 300) flocks.delete(flocks.keys().next().value); return f;
}
const smooth = (x) => x * x * (3 - 2 * x);
// every visible animal near (cx, cz) at time t: { kind, x, y (above the sea; sea animals sit on the swell), z, dx, dz (heading), fr (sprite frame), air }
export function lifeAt(realm, seed, t, cx, cz, out = [], ship = null) {
  out.length = 0; const sail = ship && ship.speed > 3; const ix0 = Math.floor(cx / CELL), iz0 = Math.floor(cz / CELL);
  for (let i = -RANGE; i <= RANGE; i++) for (let j = -RANGE; j <= RANGE; j++) {
    const g = group(realm, seed, ix0 + i, iz0 + j); if (!g) continue;
    for (let m = 0; m < g.n; m++) {
      const a = g.ph + g.w * t + m * 0.55, x = g.cx + Math.cos(a) * g.R, z = g.cz + Math.sin(a) * g.R; if (Math.abs(x - cx) > SHOW_R || Math.abs(z - cz) > SHOW_R) continue;
      const s = Math.sign(g.w), dx = -Math.sin(a) * s, dz = Math.cos(a) * s, cyc = (t / g.P + m * 0.31 + (g.seed % 97) / 97) % 1, k = g.kind; let y = 0, fr = 0, show = true;
      if (k === 'whale' || k === 'icewhale') { const c = (t / (g.P * 4) + m * 0.4 + (g.seed % 89) / 89) % 1; show = c < 0.6; const u = c / 0.6; y = u < 0.15 ? -2.2 * (1 - smooth(u / 0.15)) : u > 0.85 ? -2.2 * smooth((u - 0.85) / 0.15) : 0; fr = u < 0.25 ? 0 : u < 0.6 ? 2 : u < 0.85 ? 0 : 1; }
      else if (k === 'dolphin' || k === 'orca' || k === 'narwhal') { const long = k !== 'dolphin', c = long ? (cyc * 0.7) % 1 : cyc, span = long ? 0.4 : 0.38; show = c < span; const u = c / span; y = (long ? 2.4 : 3.4) * Math.sin(Math.PI * u) - 0.4; fr = u < 0.4 ? 0 : u < 0.62 ? 1 : 2; }
      else if (k === 'flyfish') { show = cyc < 0.13; const u = cyc / 0.13; y = 1.7 * Math.sin(Math.PI * u) + 0.3; fr = ((t * 16) | 0) & 1; }
      else if (k === 'turtle' || k === 'seal') { y = -0.15; fr = ((t * 0.7 + m) | 0) & 1; }
      else if (k === 'school') { y = 0.05; fr = ((t * 3 + m) | 0) & 1; }
      let ox = x, oz = z, odx = dx, odz = dz;
      if (ship) {
        const dd = Math.hypot(x - ship.x, z - ship.z);
        if (k === 'dolphin' && sail && Math.hypot(g.cx - ship.x, g.cz - ship.z) < 300) { // dolphins race your bow, leaping beside her
          const cy = Math.cos(ship.yaw), sy = Math.sin(ship.yaw), side = m % 2 ? 1 : -1, f = 6 + 3.5 * m, u = (t * 0.85 + m * 0.37) % 1; ox = ship.x + cy * f - sy * side * (4.5 + 1.4 * m); oz = ship.z + sy * f + cy * side * (4.5 + 1.4 * m); odx = cy; odz = sy; show = true; y = 2.3 * Math.sin(Math.PI * u) - 0.3; fr = u < 0.4 ? 0 : u < 0.62 ? 1 : 2;
        } else if (k !== 'flyfish' && k !== 'school' && dd < 42 && sail) show = false; // the big ones dive out of the way of a ship under way
      }
      if (show) out.push({ kind: k, x: ox, y, z: oz, dx: odx, dz: odz, fr, air: false });
    }
  }
  // birds: flocks over the islands near you, and the odd soaring bird over open water
  const sx = Math.floor(cx / SECTOR), sz = Math.floor(cz / SECTOR);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const isl of sectorIslands(seed, sx + i, sz + j)) {
    const f = flock(realm, isl); if (!f || Math.abs(f.x - cx) > SHOW_R + f.R || Math.abs(f.z - cz) > SHOW_R + f.R) continue;
    for (let m = 0; m < f.n; m++) { const a = f.ph + f.w * t + m * 1.3, x = f.x + Math.cos(a) * f.R, z = f.z + Math.sin(a) * f.R, s = Math.sign(f.w); if (Math.abs(x - cx) > SHOW_R || Math.abs(z - cz) > SHOW_R) continue; out.push({ kind: f.kind, x, y: f.h + 2.5 * Math.sin(t * 0.9 + m * 2), z, dx: -Math.sin(a) * s, dz: Math.cos(a) * s, fr: ((t * 4.5 + m * 3) | 0) & 1, air: true }); }
  }
  const tb = tableOf(realm);
  for (let i = -RANGE; i <= RANGE; i++) for (let j = -RANGE; j <= RANGE; j++) {
    const ix = ix0 + i, iz = iz0 + j; if (u01(seed, ix, iz, 21) > tb.openP) continue;
    const bx = (ix + 0.5) * CELL, bz = (iz + 0.5) * CELL, d = Math.hypot(bx, bz); if (d > WALL_R + 3700 || (realm === 'terra' && d > WALL_R - 100 && d < WALL_R + 60)) continue;
    const R = 120 + 90 * u01(seed, ix, iz, 22), w = (0.07 + 0.05 * u01(seed, ix, iz, 23)) * (u01(seed, ix, iz, 24) < 0.5 ? -1 : 1), a = u01(seed, ix, iz, 25) * 6.283 + w * t, x = bx + Math.cos(a) * R, z = bz + Math.sin(a) * R, s = Math.sign(w);
    if (Math.abs(x - cx) > SHOW_R || Math.abs(z - cz) > SHOW_R) continue; out.push({ kind: tb.open, x, y: 26 + 8 * Math.sin(t * 0.3 + ix), z, dx: -Math.sin(a) * s, dz: Math.cos(a) * s, fr: ((t * 1.1 + ix) | 0) & 1, air: true });
  }
  if (out.length > MAX_SHOWN) out.length = MAX_SHOWN; return out;
}

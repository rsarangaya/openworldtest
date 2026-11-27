// Everything that stands on an island besides the buildings: trees, bushes, rocks, flowers, grass tufts, the plaza's well/stalls/lamps/benches,
// and the dock's crates, barrels and lamps. Pure data from the seed (no drawing), so it is cheap, cacheable and testable.
import { rngFor, range } from './rng.js';
import { islandHeight, islandTown, dockDist, pathDist, bindProps, TAU } from './world.js';

// cached per island (the F prompt and collision ask every frame); the newest 80 islands are kept
const cache = new Map();
export function islandProps(isl) {
  let c = cache.get(isl.seed); if (c) return c;
  c = build(isl); cache.set(isl.seed, c); if (cache.size > 80) cache.delete(cache.keys().next().value); return c;
}
function build(isl) {
  const out = [], town = islandTown(isl), pl = town.plaza, r = rngFor(isl.seed, 3), placed = [];
  const FRONT = { temple: 4, mine: 4, cave: 4 }; // the ground in front of a temple's steps or a mine or cave mouth stays clear of bushes and flowers
  const free = (x, z, pad) => !(town.marks || []).some((b) => Math.abs(b.x - x) < b.w / 2 + pad && z - b.z < b.d / 2 + pad + (FRONT[b.k] || 0) && b.z - z < b.d / 2 + pad) && !town.buildings.some((b) => Math.abs(b.x - x) < b.w / 2 + pad && Math.abs(b.z - z) < b.d / 2 + pad + 1.5)
    && !(pl && Math.hypot(pl.x - x, pl.z - z) < 9 + pad) && dockDist(isl, x, z) > 4 && pathDist(isl, x, z) > 2.2;
  const scatter = (n, lo, hi, k, pad, ymax = 0.75) => {
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = range(r, lo, hi) * isl.r, x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d, y = islandHeight(isl, x, z), v = (r() * 8) | 0;
      if (y < 1.1 || y > isl.h * ymax || !free(x, z, pad)) continue;
      const sp = k === 'tree' ? 2.4 : k === 'rock' ? 1.8 : k === 'bush' ? 1.5 : 0; // solid things keep their distance from each other
      if (sp && placed.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < sp * sp)) continue;
      if (sp) placed.push({ x, z });
      out.push({ k, x, z, v });
    }
  };
  if (isl.theme === 'asgard' || isl.theme === 'atlantis') { // one landmark per island (Asgard: a carved rune stone; Atlantis: a crystal pillar), on fairly level open ground (its own random stream: the rest of the island is unchanged)
    const q = rngFor(isl.seed, 41);
    for (let k = 0; k < 60; k++) { // small steep islands: later tries accept lower, steeper ground (still walkable)
      const a = q() * TAU, d = range(q, k < 20 ? 0.25 : 0.12, k < 30 ? 0.7 : 0.88) * isl.r, x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d, y = islandHeight(isl, x, z);
      const sand = isl.biome === 'sandbar'; // a sandbar is low all over: take any dry ground on it
      if (y < (sand ? 0.8 : k < 30 ? 1.3 : 0.9) || y > isl.h * (sand ? 2.5 : 0.7) || !free(x, z, 3)) continue;
      if (Math.max(...[[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].map(([u, w]) => Math.abs(islandHeight(isl, x + u, z + w) - y))) > (k < 30 ? 1.1 : 1.7)) continue;
      out.push({ k: isl.theme === 'asgard' ? 'rune' : 'pillar', x, z, v: 0 }); placed.push({ x, z }); break;
    }
  }
  const green = isl.biome === 'tropical' || isl.biome === 'temperate' || isl.biome === 'frozen';
  if (green) scatter(8 + Math.round(isl.r * 0.45), 0.3, 0.85, 'tree', 3, 0.6);
  if (green) scatter(Math.round(isl.r * 0.4), 0.25, 0.85, 'bush', 2.5);
  if (isl.biome === 'tropical' || isl.biome === 'temperate') scatter(Math.round(isl.r * 0.6), 0.25, 0.8, 'flower', 2);
  if (green) scatter(Math.round(isl.r * isl.r * 0.012), 0.2, 0.9, 'tuft', 1.5);
  scatter(Math.round(isl.r * (isl.biome === 'rocky' || isl.biome === 'volcanic' ? 0.8 : 0.25)), 0.2, 0.95, 'rock', 2);
  for (const b of town.buildings) if (b.door && b.kind !== 'guard') { // inside each shop: a counter in front of the shopkeeper, a shelf on the back wall, and a barrel or crate
    out.push({ k: 'counter', x: b.x, z: b.z, v: 0, kind: b.kind }); out.push({ k: 'shelf', x: b.x, z: b.z - b.d / 2 + 0.8, v: 0, kind: b.kind });
    out.push({ k: b.kind === 'tavern' ? 'barrel' : 'crate', x: b.x + b.w / 2 - 1.1, z: b.z - b.d / 2 + 1.6, v: 1 });
    if (b.hall) out.push({ k: 'hearth', x: b.x - 4, z: b.z + 0.4, v: 0 }, { k: 'feast', x: b.x + 3.9, z: b.z - 0.6, v: 0 }, { k: 'feast', x: b.x + 3.9, z: b.z + 1.9, v: 1 }, { k: 'barrel', x: b.x - b.w / 2 + 1.1, z: b.z - b.d / 2 + 1.2, v: 1 }); // the mead hall: a long hearth on one side, feast tables on the other
  }
  for (const b of town.buildings) { // armoury and guard station furniture, as flat sprites (the guard station's cell bars also block walking: b.bars)
    if (b.kind === 'smith') { const bz = b.z - b.d / 2 + 0.75; out.push({ k: 'rack', x: b.x - 1.9, z: bz, v: 0 }, { k: 'rack', x: b.x + 1.9, z: bz, v: 1 }, { k: 'forge', x: b.x - b.w / 2 + 1.5, z: bz, v: 0 }, { k: 'anvil', x: b.x + 1.2, z: b.z - 0.4, v: 0 }, { k: 'barrel', x: b.x + b.w / 2 - 1.2, z: b.z - 0.2, v: 1 }); }
    if (b.kind === 'guard' && b.jail) {
      const cx = b.x + 0.7, bz = b.z - 0.8, back = b.z - b.d / 2 + 0.75, right = b.x + b.w / 2;
      for (let x = cx + 0.1; x < right - 0.1; x += 0.4) if (x < b.x + 1.5 || x > b.x + 3.85) out.push({ k: 'bar', x, z: bz, v: 0 }); // the cell front, with the gate gap
      for (let z = back; z < bz; z += 0.4) out.push({ k: 'bar', x: cx + 0.1, z, v: 0 });                                              // the cell's left side
      out.push({ k: 'cellrail', x: (cx + right) / 2, z: bz, v: Math.round((right - cx) * 10) }, { k: 'bunk', x: right - 1.3, z: b.z - 2.5, v: 0 }, { k: 'desk', x: b.x - 2.4, z: b.z + 0.7, v: 0 }, { k: 'keys', x: b.x - 0.8, z: back, v: 0 }, { k: 'notices', x: b.x - 3.0, z: back, v: 0 });
    }
  }
  for (const b of town.buildings) if (b.door) out.push({ k: 'sign', x: b.x + 3.9, z: b.z + b.d / 2 + 1.2, v: 0, kind: b.kind });
  if (pl) {
    out.push({ k: 'well', x: pl.x, z: pl.z, v: 0 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; out.push({ k: 'lamp', x: pl.x + Math.cos(a) * 6.3, z: pl.z + Math.sin(a) * 6.3, v: 0 }); }
    const stalls = isl.tier === 'village' ? 1 : isl.tier === 'town' ? 2 : 4;
    // each stall goes where the ground is level under its whole width and depth (never over a slope), clear of the lamps and the other stalls
    const lamps = out.filter((p) => p.k === 'lamp'), taken = [], rough = (x, z) => { let lo = 1e9, hi = -1e9; for (const dx of [-2.1, 0, 2.1]) for (const dz of [-1.4, 0, 1.4]) { const y = islandHeight(isl, x + dx, z + dz); lo = Math.min(lo, y); hi = Math.max(hi, y); } return hi - lo; };
    for (let i = 0; i < stalls; i++) {
      let best = null;
      for (const rad of [6.2, 6.8, 5.8, 7.4]) for (const off of [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6, 0.75, -0.75, 0.9, -0.9, 1.05, -1.05, 1.2, -1.2]) {
        const a = (i / stalls) * TAU + 0.35 + off, x = pl.x + Math.cos(a) * rad, z = pl.z + Math.sin(a) * rad;
        if (lamps.some((l) => Math.hypot(l.x - x, l.z - z) < 3) || taken.some((q) => Math.hypot(q.x - x, q.z - z) < 4.8)) continue;
        const rg = rough(x, z) + Math.abs(rad - 6.2) * 0.05; if (!best || rg < best.rg) best = { x, z, rg };
      }
      if (best && best.rg < 0.35) { taken.push(best); out.push({ k: 'stall', x: best.x, z: best.z, v: i }); }
    }
    for (const s of [-1, 1]) out.push({ k: 'bench', x: pl.x + s * 2.6, z: pl.z + 3.8, v: 0 });
    { // the notice board: the nearest free spot round the well, clear of lamps, stalls and benches, on level ground
      const others = out.filter((p) => p.k === 'lamp' || p.k === 'stall' || p.k === 'bench'); let best = null;
      for (const tight of [1, 0.7]) for (const rad of [4.4, 5, 3.8, 5.6, 6.2, 7, 7.8]) for (let k = 0; k < 36; k++) { // a second, closer-packed pass when four stalls leave no room
        if (tight < 1 && best && best.rg < 1.0) break;
        const a = (k / 36) * TAU + 0.9, x = pl.x + Math.cos(a) * rad, z = pl.z + Math.sin(a) * rad;
        if (others.some((q) => Math.hypot(q.x - x, q.z - z) < (q.k === 'stall' ? 4.3 : q.k === 'bench' ? 3.6 : 3) * tight) || Math.hypot(x - pl.x, z - pl.z) < 3.4) continue;
        let lo = 1e9, hi = -1e9; for (const dx of [-1.8, 0, 1.8]) for (const dz of [-0.6, 0.6]) { const y = islandHeight(isl, x + dx, z + dz); lo = Math.min(lo, y); hi = Math.max(hi, y); }
        const rg = hi - lo + rad * 0.02; if (!best || rg < best.rg) best = { x, z, rg };
      }
      if (best && best.rg < 1.0) out.push({ k: 'board', x: best.x, z: best.z, v: 0 });
    }
  }
  if (isl.port) { // dock furniture
    const d = isl.port.dock, len = Math.hypot(d.x1 - d.x0, d.z1 - d.z0), ux = (d.x1 - d.x0) / len, uz = (d.z1 - d.z0) / len, rr = rngFor(isl.seed, 12);
    for (let k = 1; k < Math.floor(len / 2); k++) {
      const x = d.x0 + ux * k * 2, z = d.z0 + uz * k * 2, s = rr() < 0.5 ? -1 : 1;
      if (k % 3 === 0) { out.push({ k: 'lamp', x: x - uz * 1.65, z: z + ux * 1.65, v: 1 }); out.push({ k: 'lamp', x: x + uz * 1.65, z: z - ux * 1.65, v: 1 }); }
      else if (k > 1 && rr() < 0.35) out.push({ k: rr() < 0.5 ? 'crate' : 'barrel', x: x - uz * 1.5 * s, z: z + ux * 1.5 * s, v: (rr() * 4) | 0 });
    }
  }
  if (isl.treasure) out.push({ k: 'xmark', x: isl.treasure.x, z: isl.treasure.z, v: 0 });
  return out.sort((a, b) => a.z - b.z);
}
bindProps(islandProps);

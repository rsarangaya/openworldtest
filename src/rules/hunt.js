// Bounty missions (the law's side of the game). Wanted people are a pure function of (world seed, index): the same list in every game with this seed.
// Foot targets hide on a real island (a port's streets, or a beach landing); ship targets are raider captains from the generated sea.
// The board always shows the first BOARD_N targets nobody has resolved yet. State per target lives in s.hunts[id] = { st, hp, x, z, ... }.
import { rngFor, pick } from '../gen/rng.js';
import { captainName } from '../gen/names.js';
import { SECTOR, sectorIslands, sectorEnemies, themeOf } from '../gen/world.js';

export const BOARD_N = 4, HUNT_RADIUS = 3;
export const CRIMES = ['theft', 'desertion', 'smuggling', 'arson', 'assault', 'forgery', 'mutiny'];
export const RANKS = [[0, 'Civilian'], [1, 'Deputy'], [3, 'Constable'], [6, 'Marshal'], [10, 'High Marshal']];
export const rankOf = (n) => { let r = RANKS[0]; for (const q of RANKS) if (n >= q[0]) r = q; return r[1]; };
export const rankIndex = (n) => { let i = 0; RANKS.forEach((q, k) => { if (n >= q[0]) i = k; }); return i; };
export const payBonus = (n) => 1 + 0.1 * rankIndex(n); // lawmen of rank earn more per head
export const SUBDUED_AT = 0.25, FOOT_HP = 40;

const seedCache = new Map();
const hideouts = (seed) => {
  let c = seedCache.get(seed); if (c) return c; const out = [], ships = [];
  for (let i = -HUNT_RADIUS; i <= HUNT_RADIUS; i++) for (let j = -HUNT_RADIUS; j <= HUNT_RADIUS; j++) {
    for (const isl of sectorIslands(seed, i, j)) if (!isl.port?.home && (isl.port || isl.landing)) out.push(isl);
    for (const e of sectorEnemies(seed, i, j)) if (e.kind === 'raider') ships.push(e);
  }
  c = { out, ships }; seedCache.set(seed, c); return c;
};
const wcache = new Map();
// the i-th wanted person of this world
export function wanted(seed, i) {
  const k = seed + ':' + i; let w = wcache.get(k); if (w) return w;
  const r = rngFor(seed, 8200 + i), { out, ships } = hideouts(seed), onShip = i % 4 === 3 && ships.length > 0;
  const reward = Math.round((100 + r() * 200 + i * 6) / 10) * 10; // later names pay more
  if (onShip) { const e = pick(r, ships); w = { id: 'w' + i, i, kind: 'ship', name: e.captain, crime: 'piracy', reward, dead: reward, aliveOnly: false, enemyId: e.id, ship: e.name, where: 'at sea', x: e.x, z: e.z, hp: 0 }; }
  else { const isl = pick(r, out), seed2 = (r() * 4294967296) >>> 0; w = { id: 'w' + i, i, kind: 'foot', name: captainName(rngFor(seed, 8300 + i), themeOf(seed)), crime: pick(r, CRIMES), reward, dead: Math.round((reward * 0.55) / 5) * 5, aliveOnly: r() < 0.3, island: isl, where: isl.port?.name || isl.name, x: isl.x, z: isl.z, seed: seed2, hp: FOOT_HP }; }
  wcache.set(k, w); if (wcache.size > 400) wcache.delete(wcache.keys().next().value);
  return w;
}
export const clearHuntCaches = () => { seedCache.clear(); wcache.clear(); };
export const RESOLVED = new Set(['killed', 'jailed']);
export const resolved = (s, id) => RESOLVED.has(s.hunts?.[id]?.st);
// the notice-board listing: the first BOARD_N targets not yet killed or jailed
export function board(s) {
  const out = []; for (let i = 0; i < 400 && out.length < BOARD_N; i++) { const w = wanted(s.seed, i); if (!resolved(s, w.id)) out.push(w); }
  return out;
}
export const byId = (s, id) => { const m = /^w(\d+)$/.exec(id || ''); return m ? wanted(s.seed, +m[1]) : null; };
// distance and a rough heading from a point (x, z) to a target's last-known position
export function lead(w, x, z) { const dx = w.x - x, dz = w.z - z, d = Math.hypot(dx, dz); return { dist: d, bearing: Math.atan2(dz, dx), sectors: Math.round(d / SECTOR) }; }

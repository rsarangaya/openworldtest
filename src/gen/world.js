// The world as a function of (seed, sector). Nothing is stored: the same seed always gives the same sea.
// Realm "Terra": a round world of radius WALL_R, centred on (0,0), ringed by an ice wall with one gate.
// Sectors are SECTOR units square; islands stay in the middle of their sector so neighbours never overlap.
import { rngFor, hash, fbm, clamp, mix, sstep, pick, range } from './rng.js';
import { islandName, portName, shipName, captainName } from './names.js';
import { styleOf, LANDMARKS, markSolids } from './style.js';

export const SECTOR = 600, WALL_R = 6000, GATE_HALF = 70, TAU = Math.PI * 2;
export const GOODS = ['rum', 'sugar', 'timber', 'cannon', 'spice', 'silk'];
export const BASE_PRICE = { rum: 40, sugar: 28, timber: 18, cannon: 90, spice: 70, silk: 110 };
export const sectorOf = (x) => Math.floor(x / SECTOR);
export const zoneAt = (x, z) => Math.hypot(x, z) / WALL_R; // 0 centre .. 1 wall
export const gateAngle = (seed) => rngFor(seed, 77)() * TAU;
export const gatePos = (seed) => { const a = gateAngle(seed); return { x: Math.cos(a) * WALL_R, z: Math.sin(a) * WALL_R, angle: a }; };
const frostSpot = (seed) => { const g = gatePos(seed); return { x: Math.cos(g.angle) * (WALL_R - 300), z: Math.sin(g.angle) * (WALL_R - 300) }; };

// ---------------------------------------------------------------- islands
const BIOMES = { warm: ['tropical', 'tropical', 'tropical', 'sandbar', 'volcanic'], mild: ['temperate', 'temperate', 'rocky', 'rocky', 'sandbar'], cold: ['frozen', 'frozen', 'rocky', 'frozen'], north: ['frozen', 'frozen', 'frozen', 'frozen', 'rocky'] };
const cache = new Map(), tags = new Map();
// which look a seed has: the seed of a realm is registered when you enter it (see rules/realm.js), Terra is the default
const THEMES = new Map();
export const setSeedTheme = (seed, th) => THEMES.set(seed, th);
export const themeOf = (seed) => THEMES.get(seed) || 'terra';
export const clearWorldCaches = () => { folkCache.clear(); townCache.clear(); }; // town layouts and folk are rebuilt lazily; island lists stay (cheap, keyed by seed)

function gen(seed, sx, sz) {
  const r = rngFor(seed, sx, sz, 1), out = [];
  if (Math.hypot((sx + 0.5) * SECTOR, (sz + 0.5) * SECTOR) > WALL_R + SECTOR) return out;
  const fw = frostSpot(seed), frostHere = sectorOf(fw.x) === sx && sectorOf(fw.z) === sz, homeHere = sx === 0 && sz === 0;
  const want = homeHere ? 3 : (r() < 0.18 ? 0 : 1 + ((r() * 3) | 0));
  for (let tries = 0; (out.length < want || (frostHere && !out.some((o) => o.special))) && tries < 60; tries++) {
    const home = homeHere && out.length === 0, frost = frostHere && !out.some((o) => o.special) && (tries > 20 || out.length >= want);
    let x, z, rad;
    if (home) { x = 0.5 * SECTOR; z = 0.5 * SECTOR; rad = 62; }
    else if (frost) { x = fw.x; z = fw.z; rad = 46; }
    else { x = (sx + range(r, 0.25, 0.75)) * SECTOR; z = (sz + range(r, 0.25, 0.75)) * SECTOR; rad = 14 + 86 * Math.pow(r(), 2.2); }
    if (!home && !frost && Math.hypot(x, z) > WALL_R - 320) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + rad + 40)) continue;
    if (!frost && Math.hypot(x - fw.x, z - fw.z) < rad + 120) continue;
    const d = Math.hypot(x, z) / WALL_R;
    const th = themeOf(seed), biome = th === 'asgard' ? pick(r, BIOMES.north) : home ? 'tropical' : frost ? 'frozen' : pick(r, d < 0.35 ? BIOMES.warm : d < 0.72 ? BIOMES.mild : BIOMES.cold);
    const base = biome === 'sandbar' ? 3 : biome === 'volcanic' ? range(r, 22, 34) : biome === 'rocky' ? range(r, 14, 24) : range(r, 9, 16);
    const hgt = biome === 'sandbar' ? 3 : base * clamp(0.7 + rad / 100, 0.7, 1.5);
    const id = `${sx},${sz},${out.length}`, seedI = hash(seed, sx, sz, out.length + 11), nr = rngFor(seedI, 5);
    const isl = { id, seed: seedI, sx, sz, x, z, r: rad, h: hgt, biome, flat: home || (rad >= 30 && biome !== 'volcanic' && hash(seed, sx, sz, 700 + out.length) % 100 < 40), size: rad < 26 ? 'islet' : rad < 52 ? 'island' : 'large', tier: null, port: null, treasure: null, special: frost ? 'frost' : null, quest: null };
    isl.theme = themeOf(seed); isl.name = frost ? 'Frostwatch Rock' : islandName(nr, isl.theme);
    if (home || frost || (rad >= 26 && biome !== 'volcanic' && biome !== 'sandbar' && r() < 0.65)) {
      isl.tier = rad < 36 ? 'village' : rad < 56 ? 'town' : 'city';
      if (home) isl.tier = 'city';
      const ang = home ? 1.2 : frost ? gatePos(seed).angle + Math.PI : r() * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
      let shore = 0.5 * rad; // distance from the centre to the beach along the port direction
      for (let dd = rad * 1.5; dd > 0; dd -= 0.5) if (baseHeight(isl, x + ca * dd, z + sa * dd) > 0.6) { shore = dd; break; }
      // hilly islands get level ground where the town stands (small ones almost all over, big ones keep hills beyond it), so every building finds room
      if (!isl.flat) { const back = shore - Math.max(10, rad * 0.3); isl.shelf = { x: x + ca * back, z: z + sa * back, r: { village: 30, town: 40, city: 56 }[isl.tier] }; }
      // a 22-unit dock runs out from the beach; the boat is moored ALONGSIDE it (berth), never on top of it
      const mx = x + ca * (shore + 13), mz = z + sa * (shore + 13), wet = (px, pz) => baseHeight(isl, px, pz);
      const side = wet(mx - sa * 6.5, mz + ca * 6.5) < wet(mx + sa * 6.5, mz - ca * 6.5) ? 1 : -1;
      let off = 6.5; for (let k = 0; k < 10 && wet(mx - sa * off * side, mz + ca * off * side) > 0.2; k++) off += 1;
      isl.port = { iid: id, name: home && isl.theme === 'terra' ? 'Port Haven' : frost ? 'Frostwatch' : portName(nr, isl.theme), x: x + ca * (shore + 22), z: z + sa * (shore + 22), angle: ang, shore, home,
        dock: { x0: x + ca * (shore + 22), z0: z + sa * (shore + 22), x1: x + ca * (shore - 1), z1: z + sa * (shore - 1) },
        berth: { x: mx - sa * off * side, z: mz + ca * off * side, yaw: ang } };
      isl.port.cheap = pick(nr, GOODS); isl.port.dear = pick(nr, GOODS.filter((g) => g !== isl.port.cheap));
      isl.style = isl.port.style = home ? 'plain' : frost ? 'fortress' : styleOf(isl.tier, (hash(seed, sx, sz, 900 + out.length) >>> 0) % 1000 / 1000);
    } else if (rad >= 14 && r() < 0.6) {
      const ang = r() * TAU;
      isl.treasure = { x: x + Math.cos(ang) * rad * 0.62, z: z + Math.sin(ang) * rad * 0.62, gold: 150 + ((r() * 350) | 0) };
      // islands without a town have a beach landing where the treasure side meets the sea (the only place to go ashore)
      let sh = rad * 0.5; for (let dd = rad * 1.5; dd > 0; dd -= 0.5) if (baseHeight(isl, x + Math.cos(ang) * dd, z + Math.sin(ang) * dd) > 0.6) { sh = dd; break; }
      isl.landing = { x: x + Math.cos(ang) * sh, z: z + Math.sin(ang) * sh };
    }
    out.push(isl);
  }
  return out;
}

// which islands carry the story: the informant's port and the outpost at the rim
export function questTags(seed) {
  let t = tags.get(seed);
  if (t) return t;
  t = { sailor: null, frost: null };
  const fw = frostSpot(seed); t.frost = gen(seed, sectorOf(fw.x), sectorOf(fw.z)).find((i) => i.special)?.id || null;
  loop: for (let ring = 1; ring <= 7; ring++) for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) {
    if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
    const c = gen(seed, i, j).find((p) => p.port && p.tier !== 'village' && zoneAt(p.x, p.z) < 0.6);
    if (c) { t.sailor = c.id; break loop; }
  }
  tags.set(seed, t); return t;
}
export function sectorIslands(seed, sx, sz) {
  const key = `${seed},${sx},${sz}`; let v = cache.get(key);
  if (v) return v;
  v = gen(seed, sx, sz);
  const t = questTags(seed);
  for (const i of v) i.quest = i.id === t.sailor ? 'sailor' : i.special === 'frost' ? 'warden' : null;
  cache.set(key, v); if (cache.size > 3000) cache.delete(cache.keys().next().value);
  return v;
}
export function questWorld(seed) {
  const t = questTags(seed), find = (id) => { const [a, b] = id.split(',').map(Number); return sectorIslands(seed, a, b).find((i) => i.id === id); }; // the cached, quest-tagged islands: a fresh gen() copy has no quest, and a town built from one would be cached without its sailor or warden
  const h = sectorIslands(seed, 0, 0)[0], s = find(t.sailor), f = find(t.frost), g = gatePos(seed);
  const pt = (i) => ({ id: i.id, name: i.port.name, x: i.port.x, z: i.port.z, island: i.name, get npcs() { return islandTown(i).npcs; } }); // npcs is looked up lazily: the island's quest tags are applied after this runs
  return { home: pt(h), sailor: pt(s), frost: pt(f), gate: { x: g.x, z: g.z, angle: g.angle } };
}

// terrain height at (x,z): > 0 is land, sea level is 0. rawHeight is the natural island; islandHeight also flattens
// terraces under the town (every building and the plaza gets a level pad), so nothing ever floats or sinks.
// baseHeight is the island's natural shape (town layout decisions use it); rawHeight lifts the land a little proud of the sea
export const lift = (y) => (y > 0 ? y + 2.1 * sstep(0, 0.6, y) : y);
export const rawHeight = (isl, x, z) => lift(baseHeight(isl, x, z));
function baseHeight(isl, x, z) {
  const d = Math.hypot(x - isl.x, z - isl.z) / isl.r;
  if (d > 1.5) return -4;
  const t = clamp(1 - d / 1.25, 0, 1), s = t * t * (3 - 2 * t);
  const n = fbm(isl.seed, x * 0.045, z * 0.045, 3);
  let y = -4 + (isl.h + 4) * s * (0.65 + 0.7 * n);
  if (isl.biome === 'volcanic') y -= isl.h * 0.7 * Math.exp(-((d / 0.22) ** 2));
  if (isl.biome === 'rocky') y += 3 * Math.abs(fbm(isl.seed + 9, x * 0.09, z * 0.09, 2) - 0.5) * s * 4;
  const sh = isl.shelf;
  if (y > 0 && (isl.flat || sh)) {
    let k = 1;
    if (!isl.flat) { const q = (x - sh.x) ** 2 + (z - sh.z) ** 2; k = q <= sh.r * sh.r ? 1 : q >= (sh.r + 14) ** 2 ? 0 : 1 - sstep(sh.r, sh.r + 14, Math.sqrt(q)); }
    if (k > 0) y = mix(y, 3.4 * (1 - Math.exp(-y / 3)), k); // flat-topped plateau islands (and the ground under a town) instead of hills
  }
  return y;
}
export function islandHeight(isl, x, z) {
  let y = rawHeight(isl, x, z);
  if (!isl.port || y < 0.2 || Math.hypot(x - isl.x, z - isl.z) > isl.r * 1.2) return y;
  const t = islandTown(isl), box = t.box;
  if (!box || x < box[0] || x > box[1] || z < box[2] || z > box[3]) return y; // open ground away from the town
  // a building's own footprint always wins (so a neighbour's terrace can never lift or sink it); then terraces blend out into the natural ground
  for (const b of t.buildings) if (Math.abs(x - b.x) <= b.w / 2 + 1.2 && Math.abs(z - b.z) <= b.d / 2 + 1.2) return b.pad;
  if (t.plaza) { const d = Math.hypot(x - t.plaza.x, z - t.plaza.z) - 9.5; if (d < 5) y = mix(y, t.plaza.y, 1 - sstep(0, 5, Math.max(d, 0))); }
  for (const b of t.buildings) {
    const d = Math.max(Math.abs(x - b.x) - b.w / 2 - 1.2, Math.abs(z - b.z) - b.d / 2 - 1.2);
    if (d < 4) y = mix(y, b.pad, 1 - sstep(0, 4, d));
  }
  return y > DOCK_Y ? Math.min(y, DOCK_Y + Math.max(0, dockDist(isl, x, z) - 1.6) * 0.9) : y; // the ground slopes down to the pier: a terrace never stands over the deck as a wall
}
const segDist = (px, pz, d) => { const bx = d.x1 - d.x0, bz = d.z1 - d.z0, h = clamp(((px - d.x0) * bx + (pz - d.z0) * bz) / (bx * bx + bz * bz || 1), 0, 1); return Math.hypot(px - d.x0 - bx * h, pz - d.z0 - bz * h); };
export const dockDist = (isl, x, z) => (isl.port ? segDist(x, z, isl.port.dock) : 1e9);
// distance to the dirt path from the plaza to the dock (used to paint it)
export const pathDist = (isl, x, z) => { if (!isl.port) return 1e9; const t = islandTown(isl); return t.plaza ? segDist(x, z, { x0: t.plaza.x, z0: t.plaza.z, x1: isl.port.dock.x1, z1: isl.port.dock.z1 }) : 1e9; };
// props.js registers its generator here (world.js cannot import it: props needs world), so villagers can keep clear of trees, rocks, stalls and so on
let propsOf = () => [];
export const bindProps = (f) => { propsOf = f; };
const KEEP = { tree: 0.55, rock: 0.7, bush: 0.6, well: 1.6, lamp: 0.35, sign: 0.4, barrel: 0.6, crate: 0.6, bench: 1.4, stall: 2.2, board: 2.6 };
const folkCache = new Map();
// ambient villagers spread through the whole town: a few keep to the plaza, the rest each pace a small loop at their own spot between the houses.
// Every loop is checked: no building wall, prop, dock, water or steep ground (nobody clips or floats). Pure data, cached per island.
// where a villager is at time t (they pace a small loop)
export const folkPos = (f, t) => { const an = f.a0 + t * f.speed; return { x: f.cx + Math.cos(an) * f.rad, z: f.cz + Math.sin(an) * f.rad, an }; };
export function townsfolk(isl) {
  if (!isl.port) return [];
  let out = folkCache.get(isl.seed); if (out) return out;
  const t = islandTown(isl); if (!t.plaza) return [];
  const r = rngFor(isl.seed, 8), n = { village: 5, town: 10, city: 18 }[isl.tier] || 5, solids = propsOf(isl).filter((p) => KEEP[p.k]), P = t.plaza;
  const clear = (cx, cz, w, y0) => { for (let k = 0; k < 13; k++) { const a = (k / 12) * TAU, x = k < 12 ? cx + Math.cos(a) * w : cx, z = k < 12 ? cz + Math.sin(a) * w : cz;
    if (Math.abs(islandHeight(isl, x, z) - y0) > 0.4 || islandHeight(isl, x, z) < 0.8 || dockDist(isl, x, z) < 3
      || t.buildings.some((b) => Math.abs(b.x - x) < b.w / 2 + 1 && Math.abs(b.z - z) < b.d / 2 + 1)
      || t.marks.some((b) => Math.abs(b.x - x) < b.w / 2 + 1 && Math.abs(b.z - z) < b.d / 2 + 1)
      || solids.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < (KEEP[p.k] + 0.9) ** 2)) return false; } return true; };
  out = [];
  for (let i = 0; i < n; i++) {
    const seed = (isl.seed + i * 977) >>> 0, dir = r() < 0.5 ? -1 : 1, lin = 0.8 + r() * 0.6;
    if (i % 4 === 0) { const rad = 2.4 + r() * 0.6; out.push({ seed, a0: r() * TAU, rad, speed: dir * lin / rad, cx: P.x, cz: P.z, y: P.y }); continue; }
    for (let tries = 0; tries < 60; tries++) { // pick a spot anywhere in the town
      const a = r() * TAU, d = 11 + r() * Math.max(6, isl.r * 0.62 - 11), w = 1.2 + r() * 1.6, cx = P.x + Math.cos(a) * d, cz = P.z + Math.sin(a) * d, y0 = islandHeight(isl, cx, cz);
      if (clear(cx, cz, w, y0)) { out.push({ seed, a0: r() * TAU, rad: w, speed: dir * lin / w, cx, cz, y: y0 }); break; }
    }
  }
  folkCache.set(isl.seed, out); if (folkCache.size > 80) folkCache.delete(folkCache.keys().next().value);
  return out;
}
// where you can stand: terrain, plus the dock planks (a little above the water)
export const DOCK_Y = 2.9; // pier deck height: above the highest wave crest
// beside the deck the dry ground ramps up to meet it, so there is never a lip too high to step (water beside the pier stays water)
export const walkHeight = (isl, x, z) => { const h = islandHeight(isl, x, z); if (!isl.port) return h; const d = dockDist(isl, x, z) - 1.6; return d < 0 ? Math.max(h, DOCK_Y) : h < -0.4 ? h : Math.max(h, DOCK_Y - d * 1.2); }; // -0.4: the tideline too, or a hairline of it fences the deck off from the sand

// ---------------------------------------------------------------- towns (size of the landmass decides the size of the town)
// Every NPC works inside their own shop: a hollow building with a doorway facing the plaza, a floor and a counter.
const DIRS = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
const EMPTY = { buildings: [], npcs: [], plaza: null, marks: [] };
const townCache = new Map();
function solidsOf(b) { // wall rectangles [x0,x1,z0,z1] used for walking collision
  const { x, z } = b, hw = b.w / 2, hd = b.d / 2, t = 0.5, g = 1.3;
  if (!b.door) return [[x - hw, x + hw, z - hd, z + hd]];
  const S = [], dx = DIRS[b.door][0], dz = DIRS[b.door][1];
  S.push(dz === -1 ? [x - hw, x - g, z - hd, z - hd + t] : [x - hw, x + hw, z - hd, z - hd + t]);
  if (dz === -1) S.push([x + g, x + hw, z - hd, z - hd + t]);
  S.push(dz === 1 ? [x - hw, x - g, z + hd - t, z + hd] : [x - hw, x + hw, z + hd - t, z + hd]);
  if (dz === 1) S.push([x + g, x + hw, z + hd - t, z + hd]);
  S.push(dx === -1 ? [x - hw, x - hw + t, z - hd, z - g] : [x - hw, x - hw + t, z - hd, z + hd]);
  if (dx === -1) S.push([x - hw, x - hw + t, z + g, z + hd]);
  S.push(dx === 1 ? [x + hw - t, x + hw, z - hd, z - g] : [x + hw - t, x + hw, z - hd, z + hd]);
  if (dx === 1) S.push([x + hw - t, x + hw, z + g, z + hd]);
  return S;
}
export function islandTown(isl) {
  if (!isl.port) return EMPTY;
  let t = townCache.get(isl.seed);
  if (t) return t;
  const r = rngFor(isl.seed, 6), a = isl.port.angle, ca = Math.cos(a), sa = Math.sin(a);
  let dc = isl.port.shore - Math.max(10, isl.r * 0.3), cx = isl.x, cz = isl.z;
  for (let k = 0; k < 16; k++) { cx = isl.x + ca * dc; cz = isl.z + sa * dc; const h = baseHeight(isl, cx, cz); if (h >= 1.5 && h <= isl.h * 0.6) break; dc -= isl.r * 0.06; }
  const plaza = { x: cx, z: cz, y: lift(Math.max(1.2, baseHeight(isl, cx, cz))) };
  const kinds = ['merchant'];
  if (isl.tier !== 'village' || isl.port.home) kinds.push('tavern');
  if (isl.port.home || isl.tier === 'city') kinds.push('shipwright');
  if (isl.quest === 'sailor') kinds.push('sailor');
  if (isl.quest === 'warden') kinds.push('warden');
  if (isl.tier !== 'village' || isl.port.home) kinds.push('smith'); // the armoury: weapons are bought here
  kinds.push('guard'); // the guard station: a real building with a barred jail cell inside (placed last so it never takes a quest giver's spot)
  const buildings = [], npcs = [];
  // a spot is good when the ground is land, gently sloped, clear of the dock, the plaza and other buildings
  const R = (cx, cz, w, d) => [cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2], hit = (a, b) => a[0] < b[1] && a[1] > b[0] && a[2] < b[3] && a[3] > b[2];
  const strip = (cx, cz, d) => [cx - 3.2, cx + 3.2, cz + d / 2, cz + d / 2 + 6]; // the approach in front of a (south-facing) door must stay clear
  const spot = (x, z, w, d, shop, gap = 3.8) => {
    const y = baseHeight(isl, x, z); if (y < 1.4 || y > isl.h * 0.75) return null;
    let lo = 1e9, hi = -1e9;
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const h = baseHeight(isl, x + (ox * w) / 2, z + (oz * d) / 2); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    if (lo < 0.8 || hi - lo > 2.6 || dockDist(isl, x, z) < 8 || Math.hypot(Math.max(Math.abs(x - plaza.x) - w / 2, 0), Math.max(Math.abs(z - plaza.z) - d / 2, 0)) < 8.6) return null; // the whole building, not just its centre, stays out of the plaza
    if (shop) for (const f of [1.5, 3, 4.5, 6]) for (const dx of [-1.5, 0, 1.5]) if (baseHeight(isl, x + dx, z + d / 2 + f) < 1.2) return null; // a shop's door must open onto dry land, never the sea
    const rad = Math.max(w, d) / 2 + gap, mine = R(x, z, w, d);
    if (buildings.some((b) => b.door && hit(mine, strip(b.x, b.z, b.d)))) return null;
    if (shop && buildings.some((b) => hit(strip(x, z, d), R(b.x, b.z, b.w + 1, b.d + 1)))) return null;
    if (buildings.some((b) => Math.hypot(b.x - x, b.z - z) < b.rad + rad)) return null;
    return { pad: lift(Math.round(((lo + hi) / 2) * 4) / 4), rad };
  };
  const toward = () => '+z'; // in the 2D view every door faces the viewer (south)
  kinds.forEach((k, i) => {
    for (let tries = 0; tries < (k === 'guard' ? 420 : 260); tries++) {
      const w = k === 'guard' ? (tries < 130 ? 10 : 9) : 8, d = k === 'guard' && tries < 130 ? 8 : 7; // the guard station is big; on a cramped island smaller ones are tried
      const last = tries >= 260, an = (i / kinds.length) * TAU + (r() - 0.5) * 0.6 + tries * 0.21, ring = last ? 11 + (tries - 260) * 0.15 : 13 + r() * 6 + tries * 0.12, x = plaza.x + Math.cos(an) * ring, z = plaza.z + Math.sin(an) * ring, sp = spot(x, z, w, d, true, last ? 1.2 : 3.8); // last resort on a tiny island (guard only): search inward again, closer to its neighbours
      if (!sp) continue;
      const b = { x, z, w, d, h: 4, pad: sp.pad, rad: sp.rad, roof: (r() * 3) | 0, door: toward(x, z), kind: k };
      b.solids = solidsOf(b); buildings.push(b);
      if (k === 'guard') { // a barred cell in the back right corner: bars along its front (with a gate you can be locked behind) and its left side; the sergeant's desk is at the front left
        const cx = x + 0.7, bz = z - 0.8, bar = (x0, x1, z0, z1) => (b.bars ||= []).push([x0, x1, z0, z1]); // bars block walking but are drawn as thin iron bars (mesh.js), not walls
        bar(cx, x + 1.4, bz - 0.1, bz + 0.1); bar(x + 3.9, x + w / 2, bz - 0.1, bz + 0.1); bar(cx, cx + 0.2, z - d / 2, bz + 0.1);
        b.jail = { spawn: { x: x + 1.7, z: z - 1.8 } /* clear of the bunk: overlapping it froze the player in the cell */, gate: [x + 1.9, x + 3.9, bz - 0.15, bz + 0.15], cell: [cx, x + w / 2, z - d / 2, bz] };
      }
      npcs.push({ id: `${isl.id}:${k}`, kind: k, name: captainName(r, isl.theme), x: k === 'guard' ? x - 2.4 : x, z: k === 'guard' ? z + 1.4 : z - 1.4, y: sp.pad + 0.1, island: isl.id, shop: buildings.length - 1, seed: (isl.seed + i * 7919) >>> 0 });
      return;
    }
    const an = (i / kinds.length) * TAU, x = plaza.x + Math.cos(an) * 4, z = plaza.z + Math.sin(an) * 4; // no room: stand in the plaza
    npcs.push({ id: `${isl.id}:${k}`, kind: k, name: captainName(r, isl.theme), x, z, y: plaza.y, island: isl.id, shop: -1, seed: (isl.seed + i * 7919) >>> 0 });
  });
  const want = { village: 4, town: 9, city: 22 }[isl.tier] + kinds.length, span = isl.tier === 'city' ? 50 : isl.tier === 'town' ? 32 : 20;
  for (let tries = 0; buildings.length < want && tries < 300; tries++) {
    const ring = 12 + r() * span, an = r() * TAU, big = isl.tier === 'city' && r() < 0.3, w = range(r, 4.5, 6.5) * (big ? 1.4 : 1), d = range(r, 4.5, 6.5) * (big ? 1.4 : 1);
    const x = plaza.x + Math.cos(an) * ring, z = plaza.z + Math.sin(an) * ring, sp = spot(x, z, w, d, false);
    if (!sp) continue;
    const b = { x, z, w, d, h: range(r, 3, 4.2) * (big ? 2.2 : isl.tier === 'city' ? 1.35 : 1), pad: sp.pad, rad: sp.rad, roof: (r() * 3) | 0, door: null, face: toward(x, z), kind: null };
    b.solids = solidsOf(b); buildings.push(b);
  }
  // the landmarks of this kind of town, on level open ground clear of every building and of each other
  const marks = [];
  for (const [k, w, d] of LANDMARKS[isl.style] || []) for (let tries = 0; tries < 240; tries++) {
    const an = r() * TAU, ring = 13 + r() * 8 + tries * 0.14, x = plaza.x + Math.cos(an) * ring, z = plaza.z + Math.sin(an) * ring, sp = spot(x, z, w, d, false);
    if (!sp || marks.some((q) => Math.hypot(q.x - x, q.z - z) < (Math.max(q.w, q.d) + Math.max(w, d)) / 2 + 2.5) || buildings.some((b) => b.door && Math.abs(b.x - x) < (b.w + w) / 2 + 1 && z > b.z && z - b.z < (b.d + d) / 2 + 6)) continue;
    const m = { k, x, z, w, d, pad: sp.pad }; m.solids = markSolids(m); marks.push(m); break;
  }
  const box = [plaza.x - 14.5, plaza.x + 14.5, plaza.z - 14.5, plaza.z + 14.5]; // the plaza and its blend, then every building's terrace
  for (const b of buildings) { const ex = b.w / 2 + 5.2, ez = b.d / 2 + 5.2; box[0] = Math.min(box[0], b.x - ex); box[1] = Math.max(box[1], b.x + ex); box[2] = Math.min(box[2], b.z - ez); box[3] = Math.max(box[3], b.z + ez); }
  t = { buildings, npcs, plaza, marks, box };
  townCache.set(isl.seed, t); return t;
}

// ---------------------------------------------------------------- ships at sea
export const KINDS = {
  trader: { hp: 40, speed: 6, hostile: false, dmg: 0, gold: [80, 200], label: 'Merchantman' },
  navy: { hp: 75, speed: 8.4, hostile: 'bounty', dmg: 9, gold: [120, 260], label: 'Navy cutter' },
  raider: { hp: 38, speed: 9.2, hostile: true, dmg: 7, gold: [60, 180], label: 'Raider' },
  ghost: { hp: 62, speed: 8, hostile: true, dmg: 10, gold: [150, 320], label: 'Ghost ship' },
};
// is this point on (or right beside) an island: land, beach, docks or the town on it
export function onLand(seed, x, z, pad = 40) { const cx = Math.floor(x / SECTOR), cz = Math.floor(z / SECTOR); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const isl of sectorIslands(seed, cx + i, cz + j)) if (Math.hypot(isl.x - x, isl.z - z) < isl.r * 1.8 + pad) return true; return false; }
export function sectorEnemies(seed, sx, sz) {
  const r = rngFor(seed, sx, sz, 2), out = [];
  if (sx === 0 && sz === 0) return out; // the starting waters are safe
  const z = zoneAt((sx + 0.5) * SECTOR, (sz + 0.5) * SECTOR);
  if (z > 1.05) return out;
  const n = r() < 0.2 ? 0 : r() < 0.55 ? 1 : r() < 0.9 ? 2 : 3; // busy seas, but not a gauntlet: about 1.2 ships a sector
  for (let i = 0; i < n; i++) {
    const s = hash(seed, sx, sz, 100 + i), sr = rngFor(s, 1);
    const kind = z < 0.3 ? pick(r, ['trader', 'trader', 'navy', 'raider', 'raider']) : z < 0.7 ? pick(r, ['trader', 'raider', 'raider', 'navy']) : pick(r, ['ghost', 'ghost', 'raider']);
    let ex = (sx + range(r, 0.1, 0.9)) * SECTOR, ez = (sz + range(r, 0.1, 0.9)) * SECTOR;
    for (let k = 0; k < 12 && onLand(seed, ex, ez); k++) { ex = (sx + range(r, 0.05, 0.95)) * SECTOR; ez = (sz + range(r, 0.05, 0.95)) * SECTOR; } // never spawn a ship on an island, its docks or its town
    if (onLand(seed, ex, ez)) continue;
    out.push({ id: `e${sx},${sz},${i}`, seed: s, kind, x: ex, z: ez, yaw: r() * TAU, name: shipName(sr, themeOf(seed)), captain: captainName(sr, themeOf(seed)) });
  }
  return out;
}

export const portPrice = (port, good, seed = 0) => {
  const jitter = 0.85 + 0.3 * (hash(Math.round(port.x), Math.round(port.z), GOODS.indexOf(good), seed) / 4294967296);
  return Math.max(1, Math.round(BASE_PRICE[good] * (good === port.cheap ? 0.6 : good === port.dear ? 1.55 : 1) * jitter));
};
export { mix, sstep };

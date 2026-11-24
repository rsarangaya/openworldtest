// The world map: pure data and rules, no drawing. It shows only what the player has found out: places they have been near, places an NPC told them about,
// places a quest opened up. It never shows objectives. It is built to grow: every realm is one entry in REALMS, and the grand map (the one that will end up
// looking like the flat-world chart with the ice ring in the middle and the other worlds round it) is laid out from those entries alone.
//
// To add a world: push one entry into REALMS (id, name, where it sits on the grand map, how it is hinted at by rumour). Nothing else in the map code changes.
// A realm's own local map is drawn by `realm.local` (Terra: the generated sea). A new realm supplies its own radius, cell size and `local` hook.
import { sectorIslands, WALL_R, SECTOR, gatePos, sectorOf } from '../gen/world.js';
import { hash } from '../gen/rng.js';

export const CELL = 300;                   // map grid cell, in world units (Terra: 40 x 40 cells across the disc)
export const SEA_REVEAL = 520, FOOT_REVEAL = 260; // how far you see from a ship / on foot

// state of a place on the map: 0 unknown, 1 hinted (rumour: a faint sketch), 2 known (you went there)
export const UNKNOWN = 0, HINTED = 1, KNOWN = 2;

// Every realm. `grand` places it on the grand map: polar angle (radians, 0 = right, -pi/2 = up) and distance from the centre in units of Terra's ice wall radius, plus a size (also in wall radii).
// `rumour` is the line an NPC says when they first mention it. Order matters: rumours about planned worlds come in this order.
export const REALMS = [
  { id: 'terra', name: 'Terra', radius: WALL_R, cell: CELL, home: true, blurb: 'The known world, ringed by ice.', grand: { ang: 0, dist: 0, size: 1 }, color: [96, 168, 96] },
  { id: 'asgard', name: 'Asgard', planned: true, blurb: 'Above the clouds, where the long ships sail on wind and fire.', grand: { ang: -1.5, dist: 1.95, size: 0.6 }, color: [150, 190, 220], rumour: 'a high land of snow and stone where the old gods are said to feast' },
  { id: 'atlantis', name: 'Atlantis', planned: true, blurb: 'A drowned world of glass and light.', grand: { ang: 2.35, dist: 2.0, size: 0.62 }, color: [60, 150, 170], rumour: 'a drowned kingdom, sunk long ago, with towers still lit beneath the waves' },
  { id: 'olympus', name: 'Olympus', planned: true, blurb: 'Peaks that touch the sky, and the oldest, proudest people.', grand: { ang: 0.35, dist: 2.05, size: 0.58 }, color: [210, 190, 120], rumour: 'a mountain that touches the sky, home to the oldest and proudest of all peoples' },
];
export const realmById = (id) => REALMS.find((r) => r.id === id);
// decorative rings of the grand map (radii in Terra wall radii): the ice wall round Terra, and the mountains ring round everything
export const GRAND_RINGS = [{ id: 'ice', r: 1.0, w: 0.07, color: [236, 244, 250] }, { id: 'mountains', r: 2.9, w: 0.2, color: [150, 110, 70] }];

// the map itself (the thing you can open and read) only comes to those who break through the ice; discovery is recorded from the start so it is all there when it unlocks
export const mapAvailable = (s) => !!s.flags?.crossed;
const upd = (s) => (mapAvailable(s) ? '(Map updated)' : '(You commit it to memory.)'), updW = (s) => (mapAvailable(s) ? '(World map updated)' : '(You commit it to memory.)');
export const mapOf = (s) => (s.map ||= { cells: { terra: {} }, realms: { terra: KNOWN }, heard: {}, visited: {} });
const cellsOf = (s, realm) => (mapOf(s).cells[realm] ||= {});
export const key = (gx, gz) => gx + ',' + gz;
export const cellAt = (x, z, cell = CELL) => [Math.floor(x / cell), Math.floor(z / cell)];
export const stateAt = (s, realm, x, z) => { const r = realmById(realm) || REALMS[0], [gx, gz] = cellAt(x, z, r.cell); return cellsOf(s, realm)[key(gx, gz)] || UNKNOWN; };
export const realmState = (s, id) => mapOf(s).realms[id] || UNKNOWN;

// reveal a disc of cells at world (x, z) with radius rad, to at least `level`
export function reveal(s, realm, x, z, rad, level = KNOWN) {
  const r = realmById(realm) || REALMS[0], c = cellsOf(s, realm), n = Math.ceil(rad / r.cell), [cx, cz] = cellAt(x, z, r.cell); let added = 0;
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const gx = cx + i, gz = cz + j, wx = (gx + 0.5) * r.cell, wz = (gz + 0.5) * r.cell;
    if (Math.hypot(wx - x, wz - z) > rad + r.cell * 0.4 || Math.hypot(wx, wz) > r.radius * 1.05) continue;
    const k = key(gx, gz); if ((c[k] || 0) < level) { c[k] = level; added++; }
  }
  return added;
}
// called every step: explore what you can see from where you are (cheap: only when you move into a new cell)
export function explore(s, realm, x, z, onFoot) {
  const m = mapOf(s), [gx, gz] = cellAt(x, z, (realmById(realm) || REALMS[0]).cell), k = realm + ':' + gx + ',' + gz + ':' + (onFoot ? 'f' : 's');
  if (m.last === k) return false; m.last = k; reveal(s, realm, x, z, onFoot ? FOOT_REVEAL : SEA_REVEAL, KNOWN); return true;
}
export function visit(s, isl) { const m = mapOf(s); if (!m.visited[isl.id]) { m.visited[isl.id] = isl.port?.name || isl.name; return true; } return false; }
export function hint(s, id) { const m = mapOf(s); if (!realmById(id) || (m.realms[id] || 0) >= HINTED) return false; m.realms[id] = HINTED; return true; }
export const nextUnhinted = (s) => REALMS.find((r) => r.planned && realmState(s, r.id) === UNKNOWN) || null;
export const visitRealm = (s, id) => { mapOf(s).realms[id] = KNOWN; };

// what an NPC tells you when you first talk to them: a rough chart of nearby waters, or a rumour of another world. Returns a line to add to the dialogue, or null.
export function learn(s, npc, isl) {
  const m = mapOf(s); if (m.heard[npc.id]) return null; m.heard[npc.id] = true; const n = Object.keys(m.heard).length;
  const near = () => { const out = []; if (!isl) return out; const cx = sectorOf(isl.x), cz = sectorOf(isl.z); for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const o of sectorIslands(s.seed, cx + i, cz + j)) if (o.id !== isl.id) out.push(o); return out; };
  const chart = (lead) => { const list = near(); if (!list.length) return null; const o = list[hash(s.seed, n, hashStr(npc.id)) % list.length]; reveal(s, 'terra', o.x, o.z, 700, HINTED); return `${lead} a rough chart of the waters round ${o.name}. ${upd(s)}`; };
  if (npc.kind === 'tavern') { const r = nextUnhinted(s); if (r && n % 2 === 0) { hint(s, r.id); return `"Beyond the Wall? Folk speak of ${r.name}: ${r.rumour}." ${updW(s)}`; } return chart('The keeper scrawls you'); }
  if (npc.kind === 'merchant') return chart('The merchant marks for you');
  if (npc.kind === 'sailor') { const g = gatePos(s.seed); reveal(s, 'terra', g.x * 0.97, g.z * 0.97, 1300, HINTED); return `He sketches the rim where the gate lies. ${upd(s)}`; }
  if (npc.kind === 'warden') { const g = gatePos(s.seed); reveal(s, 'terra', g.x * 0.95, g.z * 0.95, 1800, HINTED); return `He shows you the rim waters on a chart. ${upd(s)}`; }
  return null;
}
// quests open up the map too
export function learnQuest(s, id) {
  const t = s.targets; if (!t) return null;
  if (id === 'sailor' && t.frost) { reveal(s, 'terra', t.frost.x, t.frost.z, 900, HINTED); return `The old sailor marks the far outpost for you. ${upd(s)}`; }
  if (id === 'frost' && t.gate) { reveal(s, 'terra', t.gate.x * 0.97, t.gate.z * 0.97, 1500, HINTED); return `The Warden charts the waters round the gate for you. ${upd(s)}`; }
  if (id === 'wall') { const r = nextUnhinted(s); if (r) { hint(s, r.id); return `Past the ice you glimpse ${r.name}, ${r.rumour}. ${updW(s)}`; } }
  return null;
}
const hashStr = (str) => { let h = 7; for (let i = 0; i < String(str).length; i++) h = (Math.imul(h, 31) + String(str).charCodeAt(i)) | 0; return h >>> 0; };

// ---- the grand map layout (pure): where every realm sits on a square of `size` pixels, and whether it is shown. Terra is the disc in the middle.
export function worldLayout(s, size) {
  const unit = (size / 2) / 3.3, cx = size / 2, cy = size / 2; // 3.3 wall radii fit from the centre to the edge
  const realms = REALMS.map((r) => ({ id: r.id, name: r.name, x: cx + Math.cos(r.grand.ang) * r.grand.dist * unit, y: cy + Math.sin(r.grand.ang) * r.grand.dist * unit, r: r.grand.size * unit, state: realmState(s, r.id), color: r.color, home: !!r.home }));
  return { unit, cx, cy, rings: GRAND_RINGS.map((g) => ({ ...g, r: g.r * unit, w: g.w * unit })), realms };
}
// where a point of Terra sits on the grand map (the player marker)
export const grandPoint = (layout, x, z) => ({ x: layout.cx + (x / WALL_R) * layout.unit, y: layout.cy + (z / WALL_R) * layout.unit });
export { SECTOR };

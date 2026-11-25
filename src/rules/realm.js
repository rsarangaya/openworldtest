// Realms are separate maps and only one is loaded at a time. Terra's Outer Sea (the ring of open water just outside the Wall) leads to the other worlds:
// sail out to OUTER_EDGE and the bearing you leave on picks the world. A realm has its own seed, so every generator and cache keyed by seed just works.
// Per-realm state (reputation, hunts, town states, npcs, discoveries...) is stashed when you leave and restored when you come back; gold, ship, crew, fleet, parts, weapons and bounty travel with you.
import { WALL_R, setSeedTheme } from '../gen/world.js';
import { hash } from '../gen/rng.js';
import { REALMS, realmState, visitRealm, UNKNOWN } from './map.js';

export const OUTER = 3500, OUTER_EDGE = WALL_R + OUTER, EDGE_HINT = 300, WARP_S = 1.4, RIM_EXIT = WALL_R - 120;
export const CINE_S = 7.5, CINE_BREAK = 2.6; // the breakthrough scene: length, and the moment the wall gives way
const PER_REALM = ['hunts', 'towns', 'alert', 'guardT', 'npcs', 'jailed', 'newsSeen', 'found', 'dead', 'rep'];
const fresh = (k) => (k === 'found' || k === 'dead' ? new Set() : k === 'rep' ? { world: 0, local: {} } : {});
export const realmSeed = (base, id) => (id === 'terra' ? base : ((hash(base, 4001 + [...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7), 3) >>> 0) % 900000) + 1000);
const wrapPi = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
// which world lies in this direction (nearest map bearing among the worlds other than Terra)
export function destinationAt(angle) {
  let best = null, bd = 9; for (const r of REALMS) { if (r.home) continue; const d = Math.abs(wrapPi(angle - r.grand.ang)); if (d < bd) { bd = d; best = r; } }
  return best;
}
export const realmOf = (s) => s.realm || 'terra';
// swap the world state: stash what belongs to the realm you leave, restore (or create) the one you enter. Returns false if nothing to do.
export function enterRealm(s, id) {
  const from = realmOf(s); if (id === from) return false;
  const base = (s.baseSeed ||= s.seed), stash = (s.realms ||= {}), out = {};
  for (const k of PER_REALM) out[k] = s[k]; stash[from] = out;
  const to = stash[id]; for (const k of PER_REALM) s[k] = to && to[k] !== undefined ? to[k] : fresh(k);
  s.prisoner = null; s.realm = id; s.seed = realmSeed(base, id); setSeedTheme(s.seed, id); s.enemies = new Map(); s.shots = []; s.fx = []; s.guards = []; s.foes = []; s.sinking = []; s.deck = null; s.warp = null; s.cine = null; s.auto = false;
  visitRealm(s, id); return true;
}
export const isNewRealm = (s, id) => realmState(s, id) === UNKNOWN;
// the label for the banner when you cross over
export const warpText = (s, id) => (isNewRealm(s, id) ? 'Entering unknown waters' : (REALMS.find((r) => r.id === id)?.name || id));

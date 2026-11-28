// House burglaries at night (PLAN item 7, the player's side): after dark the townsfolk's houses in a port are dark and locked. Stand at a house door and press F
// to work the lock (PICK_S seconds standing still; step away and you give up). It gives: there is gold in a strongbox inside, more in a city and in a trade port.
// Now and then someone wakes (more often near the guard station, in a city, and on a "Cutpurses Abroad" night when the watch is out): you grab half and run,
// the alarm goes up (a crime: guards hunt you, your name there suffers). Each house is worth one try a day. A pickpocket kid at your side or in your crew knows
// locks: they open in half the time and you are seen half as often. Pure functions on the state; the game passes say, kid, ev, station and crime in H.
import { hash } from '../gen/rng.js';
import { islandTown } from '../gen/world.js';
import { addLocal } from './rep.js';
import { isNight, nowHour, DAY } from './daynight.js';

export const PICK_S = 3, SEEN_BASE = 20, SEEN_STATION = 25, STATION_NEAR = 30, SEEN_CITY = 10, SEEN_WATCH = 10, SEEN_MAX = 70, BURGLE_FINE = 40, BURGLE_REP = -6;
const LOOT = { village: [10, 30], town: [20, 55], city: [35, 90] };
const key = (isl, bi) => `${isl.id}:${bi}`;
// the gold in a house's strongbox tonight
export function loot(s, isl, bi) {
  const [a, b] = LOOT[isl.tier] || LOOT.village, k = (hash(s.seed, isl.id, bi, Math.floor(s.t / DAY), 66) % 1000) / 1000, g = Math.round(a + (b - a) * k);
  return isl.style === 'trade' ? Math.round(g * 1.4) : g;
}
// the odds (0-100) that someone wakes while you are inside
export function seenOdds(s, isl, bi, H) {
  const b = islandTown(isl).buildings[bi], st = H.station?.(isl); let p = SEEN_BASE;
  if (st && Math.hypot(st.x - b.x, st.z - b.z) < STATION_NEAR) p += SEEN_STATION;
  if (isl.tier === 'city') p += SEEN_CITY;
  if (H.ev?.(s, isl.id)?.thief) p += SEEN_WATCH;
  return Math.min(SEEN_MAX, H.kid?.(s) ? Math.round(p / 2) : p);
}
const tried = (s, isl, bi) => s.t - ((s.burgled || {})[key(isl, bi)] ?? -1e9) < DAY;
// the house door you stand at in a port at night: { isl, bi, tried } or null (by day every door is just a door)
export function nearHouse(s, isles) {
  if (s.mode !== 'foot' || s.deck || !isNight(nowHour(s))) return null; const f = s.foot;
  for (const isl of isles) if (isl.port) { const bs = islandTown(isl).buildings;
    for (let bi = 0; bi < bs.length; bi++) { const b = bs[bi]; if (b.kind || b.door) continue; const dz = f.z - (b.z + b.d / 2); if (Math.abs(f.x - b.x) < 1.6 && dz > 0 && dz < 2.2) return { isl, bi, tried: tried(s, isl, bi) }; } }
  return null;
}
// press F at a dark house: start on the lock
export function startBurgle(s, h, H) {
  if (s.burgle || !h) return false;
  if (h.tried) { H.say(s, 'You have tried this house tonight already. Better not push your luck.'); return false; }
  if (s.thief || s.raid || s.guards?.length || s.foes?.length) { H.say(s, 'Not now: there is too much going on.'); return false; }
  s.burgle = { isl: h.isl.id, bi: h.bi, t0: s.t, x: s.foot.x, z: s.foot.z, need: H.kid?.(s) ? PICK_S / 2 : PICK_S };
  H.say(s, H.kid?.(s) ? `${H.kid(s)} kneels at the lock with a bent nail. "Keep watch."` : 'You kneel at the lock in the dark and set to work. Stay still...'); return true;
}
// one frame at the lock; `here` is the port island you stand on (or null)
export function stepBurgle(s, dt, here, H) {
  const b = s.burgle; if (!b) return; const f = s.foot;
  if (s.mode !== 'foot' || here?.id !== b.isl || Math.hypot(f.x - b.x, f.z - b.z) > 0.8 || s.guards?.length || s.thief || s.raid) { s.burgle = null; H.say(s, 'You leave the lock alone.'); return; }
  if (s.t - b.t0 < b.need) return;
  s.burgle = null; (s.burgled ||= {})[key(here, b.bi)] = s.t;
  for (const k in s.burgled) if (s.t - s.burgled[k] >= DAY) delete s.burgled[k]; // forget yesterday's houses: the save stays small
  const g = loot(s, here, b.bi), seen = hash(s.seed, here.id, b.bi, Math.floor(s.t), 67) % 100 < seenOdds(s, here, b.bi, H);
  if (!seen) { s.gold += g; s.events?.push({ type: 'coin' }); H.say(s, `The lock gives. Inside, by feel in the dark, you find a strongbox: ${g} gold. You slip out unseen.`); return 'clean'; }
  const half = Math.floor(g / 2); s.gold += half; addLocal(s, here.id, BURGLE_REP); H.crime(s, here, BURGLE_FINE, false); s.events?.push({ type: 'hit' });
  H.say(s, `The lock gives, but a floorboard creaks and a candle is lit upstairs: "Thieves!" You grab ${half} gold and run.`); return 'seen';
}

// Wrecks and salvage, the first pass at "underwater". A few old wrecks lie in open water in every world, rumoured on notice boards and in
// taverns with a bearing. Floating barrels and crates mark the spot. Stop over one, press F, and a diver goes down; a few seconds later
// they come up with gold and sometimes cargo. Each wreck gives DIVES dives (the last brings up the strongbox), then it is stripped (saved
// in s.salvage, per world). No diving in a storm, under way, or with enemies about; trouble while the diver is down hauls them back up.
import { GOODS } from '../gen/world.js';
import { rngFor, hash } from '../gen/rng.js';
import { shipName } from '../gen/names.js';
import { seaSpots, compassWord } from './serpent.js';
import { cargoCount } from './trade.js';

export const DIVES = 3, DIVE_S = 6, DIVE_R = 35, STILL = 2, SAFE_R = 200, BOX = [160, 260];
const realm = (s) => s.realm || 'terra';
// the wrecks of a world: [{ id, x, z, name, good }], deterministic per world seed
const memo = new Map();
export const wrecks = (seed, th = '') => memo.get(seed) || memo.set(seed, seaSpots(seed, [[0.16, 0.36], [0.4, 0.6], [0.62, 0.8], [0.82, 0.94]], 9100, 'wreck').map((w, i) => ({ ...w, name: shipName(rngFor(seed, 9150 + i), th), good: GOODS[hash(seed, 9160 + i) % GOODS.length] }))).get(seed);
const keyOf = (s, w) => realm(s) + ':' + w.id;
export const divesLeft = (s, w) => DIVES - ((s.salvage || {})[keyOf(s, w)] || 0);
const all = (s) => wrecks(s.seed, realm(s) === 'terra' ? '' : realm(s)), live = (s) => all(s).filter((w) => divesLeft(s, w) > 0);
// the wreck under the ship (within reach of a diver), or null
export function wreckHere(s) { const p = s.ship; return (p && all(s).find((w) => Math.hypot(w.x - p.x, w.z - p.z) < DIVE_R && divesLeft(s, w) > 0)) || null; }
// wrecks worth drawing near (x, z): their floating debris
export const wrecksNear = (s, x, z, r) => live(s).filter((w) => Math.hypot(w.x - x, w.z - z) < r);
export function wreckRumour(s, x, z) {
  let best = null, bd = 1e9; for (const w of live(s)) { const d = Math.hypot(w.x - x, w.z - z); if (d < bd) { bd = d; best = w; } }
  if (!best) return null; (s.salvage ||= {})[keyOf(s, best)] ??= 0; // heard of: the chart map marks roughly where she lies
  return `${realm(s) === 'asgard' ? 'A trader swears' : realm(s) === 'atlantis' ? 'A pearl diver swears' : realm(s) === 'olympus' ? 'A sponge diver swears' : 'An old diver swears'} the ${best.name.replace(/^The /, '')} went down ${bd > 2500 ? 'far out' : bd > 1200 ? 'a long sail' : 'not far'} to the ${compassWord(best.x - x, best.z - z)} with ${best.good} in her hold. Barrels still float over the spot. Heave to above her and send a diver down.`;
}
// Terra's wrecks for the chart map: the ones you have heard of (dives 0) or dived on, with how many dives they have had
export const chartWrecks = (s) => wrecks(s.baseSeed || s.seed).flatMap((w) => { const n = (s.salvage || {})['terra:' + w.id]; return n === undefined ? [] : [{ ...w, dives: n, stripped: n >= DIVES }]; });
// F at sea over a wreck: send the diver down, or say why not. danger(s) is true while a foe is close.
export function startDive(s, w, say, stormy, danger) {
  const p = s.ship;
  if (s.dive) return;
  if (stormy) { say(s, 'Too rough to dive: wait for the storm to pass.'); return; }
  if (danger(s, SAFE_R)) { say(s, 'Not with enemies about. Deal with them first.'); return; }
  if (Math.abs(p.speed) > STILL) { say(s, 'Heave to first: take in the sail (S) until she barely drifts.'); return; }
  s.dive = { id: w.id, t0: s.t }; s.auto = false; s.row = false; p.sail = 0;
  say(s, `Your diver goes over the side and down to the ${w.name.replace(/^The /, '')}...`); s.events.push({ type: 'splash' });
}
// a step at sea while a diver is down: hold the ship still, haul them up on trouble, pay out when they surface
export function stepDive(s, dt, say, puff, danger) {
  const d = s.dive; if (!d) return; const p = s.ship, w = live(s).find((q) => q.id === d.id);
  p.speed *= 1 - Math.min(1, dt * 2); p.sail = 0;
  if (!w || danger(s, SAFE_R * 0.75)) { s.dive = null; say(s, 'Trouble! Your diver is hauled back up empty-handed.'); return; }
  if (s.t - d.t0 < DIVE_S) return;
  s.dive = null; const k = keyOf(s, w), n = ((s.salvage ||= {})[k] || 0) + 1; s.salvage[k] = n;
  const last = n >= DIVES, gold = last ? BOX[0] + (hash(s.seed, 9170 + w.id.length + n) % (BOX[1] - BOX[0])) : 40 + (hash(s.seed, 9180 + n, w.x | 0) % 70);
  const room = Math.max(0, s.hold - cargoCount(s)), c = last ? 0 : Math.min(room, 1 + (hash(s.seed, 9190 + n, w.z | 0) % 2));
  s.gold += gold; s.score += gold; if (c) s.cargo[w.good] = (s.cargo[w.good] || 0) + c;
  if (last) s.killsBy.wreck = (s.killsBy.wreck || 0) + 1;
  puff(s, 'splash', p.x + Math.cos(p.yaw + 1.57) * 3, 0.6, p.z + Math.sin(p.yaw + 1.57) * 3, 0.8, { sc: 1.6 });
  say(s, last ? `Your diver comes up with the ${w.name.replace(/^The /, '')}'s strongbox! +${gold} gold. Nothing more down there: the wreck is stripped.` : `Your diver surfaces with coins${c ? ` and ${c} ${w.good}` : room ? '' : ' (the hold is full, so the cargo stays down there)'}. +${gold} gold. ${DIVES - n} more dive${DIVES - n > 1 ? 's' : ''} should strip her.`);
  s.events.push({ type: 'coin' });
}
